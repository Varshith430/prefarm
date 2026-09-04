import {
  apiCreated,
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
  issueDeviceToken,
  requireResourceRole,
  requireUser,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createSensorSchema, sensorQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sensors
 * Body: { fieldId, name, sensorType, unit, externalId?, installedAt?, isActive? }
 *
 * The tenant comes from the parent field. `externalId` is the gateway's own
 * identifier and is unique platform-wide, so a device can be reconciled with
 * its telemetry source without guessing.
 *
 * Registering a sensor issues its device token, which is returned **once** in
 * this response as `deviceToken` and never again — only its hash is stored.
 * Configure the gateway with it now; a device that loses it gets a new one
 * from POST /api/sensors/:id/token, which keeps the sensor and its readings.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createSensorSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { fieldId, name, sensorType, unit, externalId, installedAt, isActive } =
    parsed.data;

  const access = await requireResourceRole(auth.session, "field", fieldId, WRITE);
  if (!access.ok) return access.response;

  const device = issueDeviceToken();

  try {
    const sensor = await prisma.sensor.create({
      data: {
        fieldId,
        name,
        sensorType,
        unit,
        externalId: externalId ?? null,
        installedAt: installedAt ?? null,
        isActive,
        deviceTokenHash: device.hash,
        deviceTokenIssuedAt: device.issuedAt,
      },
    });

    return apiCreated(
      { ...serialize(sensor), deviceToken: device.token },
      `/api/sensors/${sensor.id}`,
    );
  } catch (error) {
    if (isPrismaKnownError(error)) {
      if (error.code === "P2002") {
        // Either UNIQUE (field_id, name) or the unique external_id.
        const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
        if (target.includes("external_id")) {
          return apiError(409, "Another sensor is already registered with this externalId.", {
            externalId: ["Already registered."],
          });
        }
        return apiError(409, `This field already has a sensor named "${name}".`, {
          name: ["Already used within this field."],
        });
      }
      // The field was proven to exist by the access check above.
      if (error.code === "P2003") {
        return apiError(409, "The field was removed while this request ran.");
      }
    }
    return infrastructureError("sensors", error);
  }
}

/**
 * GET /api/sensors?fieldId=&farmId=&sensorType=&isActive=&limit=&offset=
 *
 * Each sensor carries its most recent reading, which is what a monitoring view
 * shows; the readings themselves are paged from /api/sensor-readings.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = sensorQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, fieldId, farmId, sensorType, isActive } = parsed.data;

  if (fieldId) {
    const access = await requireResourceRole(auth.session, "field", fieldId, READ);
    if (!access.ok) return access.response;
  }
  if (farmId) {
    const access = await requireResourceRole(auth.session, "farm", farmId, READ);
    if (!access.ok) return access.response;
  }

  const scope = scopeToMemberships(auth.session, undefined);
  if (!scope.ok) return scope.response;

  const where = {
    ...(fieldId ? { fieldId } : {}),
    field: { farm: { ...scope.where, ...(farmId ? { id: farmId } : {}) } },
    ...(sensorType ? { sensorType } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };

  try {
    const [sensors, total] = await prisma.$transaction([
      prisma.sensor.findMany({
        where,
        include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.sensor.count({ where }),
    ]);

    return apiOk(serialize(sensors), {
      pagination: paginationMeta(limit, offset, sensors.length, total),
    });
  } catch (error) {
    return infrastructureError("sensors", error);
  }
}
