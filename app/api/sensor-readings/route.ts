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
import { READ, WRITE, authorizeOrg, requireResourceRole, requireUser } from "@/lib/auth";
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
 * TODO(device credentials): this endpoint is called by field gateways, not by
 * people, so a user session is the wrong credential for it — a gateway cannot
 * hold a browser cookie, and giving one a human's login would hand it that
 * person's entire access. It needs a per-device credential instead: a token
 * issued when a sensor is registered, presented as a bearer header, scoped to
 * exactly the sensors that device owns, and revocable when the hardware is
 * lost. Until that exists the endpoint requires a session with write access to
 * every sensor in the batch, which is correct but unusable by real hardware.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = ingestSensorReadingsSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { readings } = parsed.data;

  // Authorized in one query rather than per reading: a batch may carry a
  // thousand samples but only a handful of distinct sensors.
  const sensorIds = [...new Set(readings.map((reading) => reading.sensorId))];

  const sensors = await prisma.sensor.findMany({
    where: { id: { in: sensorIds } },
    select: { id: true, field: { select: { farm: { select: { organizationId: true } } } } },
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
