import {
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  notFoundError,
  parseRouteId,
  readJsonBody,
  validationError,
  writeConflictResponse,
} from "@/lib/api";
import { MANAGE, READ, WRITE, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { updateSensorSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** How many recent samples a sensor detail response carries. */
const RECENT_READINGS = 50;

/** GET /api/sensors/:id — the sensor, its field, and its latest samples. */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Sensor");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "sensor", route.id, READ);
  if (!access.ok) return access.response;

  try {
    const sensor = await prisma.sensor.findUnique({
      where: { id: route.id },
      include: {
        field: true,
        readings: { orderBy: { recordedAt: "desc" }, take: RECENT_READINGS },
      },
    });

    if (!sensor) return notFoundError("Sensor");
    return apiOk(serialize(sensor));
  } catch (error) {
    return infrastructureError("sensors", error);
  }
}

/**
 * PATCH /api/sensors/:id
 * Body: any subset of { name, sensorType, unit, externalId, installedAt, isActive }
 *
 * `fieldId` is not accepted: moving hardware to another field is a
 * decommission (`isActive: false`) plus a new sensor, which keeps each field's
 * reading history attributable to the device that was actually there.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Sensor");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "sensor", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateSensorSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const sensor = await prisma.sensor.update({
      where: { id: route.id },
      data: parsed.data,
    });

    return apiOk(serialize(sensor));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
      if (target.includes("external_id")) {
        return apiError(409, "Another sensor is already registered with this externalId.", {
          externalId: ["Already registered."],
        });
      }
      return apiError(409, "This field already has a sensor with that name.", {
        name: ["Already used within this field."],
      });
    }
    return writeConflictResponse(error, "Sensor")
      ?? infrastructureError("sensors", error);
  }
}

/**
 * DELETE /api/sensors/:id
 *
 * Every reading the sensor produced cascades away with it. To retire a device
 * while keeping its telemetry, PATCH `isActive: false` instead.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Sensor");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "sensor", route.id, MANAGE);
  if (!access.ok) return access.response;

  try {
    await prisma.sensor.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Sensor")
      ?? infrastructureError("sensors", error);
  }
}
