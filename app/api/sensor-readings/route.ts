import {
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  paginationMeta,
  readJsonBody,
  searchParamsToObject,
  validationError,
} from "@/lib/api";
import {
  READ,
  WRITE,
  authorizeOrg,
  readBearerToken,
  requireResourceRole,
  requireUser,
  resolveDeviceToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import {
  ingestSensorReadingsSchema,
  sensorReadingQuerySchema,
} from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sensor-readings
 * Body: { readings: [{ sensorId, recordedAt, value }, ...] } — up to 1000.
 *
 * Ingest is idempotent: `(sensor_id, recorded_at)` is unique and duplicates
 * are skipped, so a gateway that retries after a timeout re-sends its whole
 * buffer without creating double samples. The response reports how many rows
 * were actually written so a caller can tell a retry from fresh data.
 *
 * Two ways to authenticate, because two very different callers use this:
 *
 * - **A field gateway** sends `Authorization: Bearer <device token>`. That
 *   token authorizes writing readings for exactly one sensor and nothing else:
 *   it is not a stand-in for a member of the organization, so a batch naming
 *   any other sensor is refused even when both sensors belong to the same
 *   farm. A gateway that is compromised costs its own telemetry, not the
 *   tenant.
 * - **A person** (backfilling by hand, or a test) sends their session cookie
 *   and needs write access to every sensor in the batch, as before.
 *
 * The bearer header wins when both are present: a request that presents a
 * device credential is acting as that device.
 */
export async function POST(request: Request) {
  const bearer = readBearerToken(request);

  const device = bearer ? await resolveDeviceToken(bearer) : null;

  // An unrecognized token is 401, never a fall-through to session auth: a
  // gateway with a stale token must be told its credential is wrong, not
  // silently treated as an anonymous caller.
  if (bearer && !device) {
    return apiError(401, "Unknown device token.");
  }

  if (device && !device.isActive) {
    return apiError(403, "This sensor has been deactivated.");
  }

  const auth = device ? null : await requireUser();
  if (auth && !auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = ingestSensorReadingsSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { readings } = parsed.data;

  // Authorized in one query rather than per reading: a batch may carry a
  // thousand samples but only a handful of distinct sensors.
  const sensorIds = [...new Set(readings.map((reading) => reading.sensorId))];

  if (device) {
    // The token speaks for one sensor. Anything else in the batch is refused
    // outright rather than partially accepted, so a gateway cannot be used to
    // write telemetry for its neighbours.
    const foreign = sensorIds.filter((id) => id !== device.sensorId);

    if (foreign.length > 0) {
      return apiError(
        403,
        "This device token can only write readings for its own sensor.",
        { readings: [`Not this device's sensor: ${foreign[0]}.`] },
      );
    }
  } else if (auth?.ok) {
    const sensors = await prisma.sensor.findMany({
      where: { id: { in: sensorIds } },
      select: {
        id: true,
        field: { select: { farm: { select: { organizationId: true } } } },
      },
    });

    if (sensors.length !== sensorIds.length) {
      const known = new Set(sensors.map((sensor) => sensor.id));
      const missing = sensorIds.filter((id) => !known.has(id));
      return apiError(422, "A reading references a sensor that does not exist.", {
        readings: [`Unknown sensor id: ${missing[0]}.`],
      });
    }

    for (const sensor of sensors) {
      const allowed = authorizeOrg(
        auth.session,
        sensor.field.farm.organizationId,
        WRITE,
      );
      if (!allowed.ok) return allowed.response;
    }
  }

  try {
    const result = await prisma.sensorReading.createMany({
      data: readings,
      skipDuplicates: true,
    });

    return apiOk({
      received: readings.length,
      inserted: result.count,
      skipped: readings.length - result.count,
    });
  } catch (error) {
    // Every sensor was checked above, so this means one was deleted mid-request.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(409, "A sensor was removed while this request ran.");
    }
    return infrastructureError("sensor-readings", error);
  }
}

/**
 * GET /api/sensor-readings?sensorId=&from=&to=&limit=&offset=
 *
 * `sensorId` is required: readings are only meaningful per device, and an
 * unfiltered scan of this table is the one query that will not stay fast. It
 * also gives the request something to authorize against — the caller must be
 * able to read the field the sensor stands in.
 *
 * `from` is inclusive and `to` exclusive, so adjacent windows neither overlap
 * nor drop a sample on the boundary.
 *
 * Session only: a device token authorizes writing this sensor's telemetry, not
 * reading back the history, so a stolen gateway cannot be used to harvest data
 * it never saw.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = sensorReadingQuerySchema.safeParse(
    searchParamsToObject(url.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, sensorId, from, to } = parsed.data;

  const access = await requireResourceRole(auth.session, "sensor", sensorId, READ);
  if (!access.ok) return access.response;

  if (from && to && to < from) {
    return apiError(400, "The time window ends before it starts.", {
      to: ["Must be later than `from`."],
    });
  }

  const where = {
    sensorId,
    ...(from || to
      ? { recordedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
  };

  try {
    const [readings, total] = await prisma.$transaction([
      prisma.sensorReading.findMany({
        where,
        // Matches sensor_readings_sensor_recorded_idx, so paging stays an
        // index scan rather than a sort of the whole window.
        orderBy: { recordedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.sensorReading.count({ where }),
    ]);

    return apiOk(serialize(readings), {
      pagination: paginationMeta(limit, offset, readings.length, total),
    });
  } catch (error) {
    return infrastructureError("sensor-readings", error);
  }
}
