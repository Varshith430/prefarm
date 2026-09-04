import {
  apiOk,
  infrastructureError,
  parseRouteId,
  writeConflictResponse,
} from "@/lib/api";
import { WRITE, issueDeviceToken, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/sensors/:id/token
 *
 * Issues a new device token and invalidates the old one immediately.
 *
 * This exists because the token is stored only as a hash: there is no way to
 * look up what a device was given, so a gateway that has been reflashed or a
 * token that has leaked is recovered by replacement. Without it the only
 * remedy would be deleting the sensor, which would take every reading it has
 * ever produced with it.
 *
 * Requires WRITE on the organization that owns the sensor's field — the same
 * authority needed to register the device in the first place.
 */
export async function POST(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Sensor");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "sensor", route.id, WRITE);
  if (!access.ok) return access.response;

  const device = issueDeviceToken();

  try {
    const sensor = await prisma.sensor.update({
      where: { id: route.id },
      data: {
        deviceTokenHash: device.hash,
        deviceTokenIssuedAt: device.issuedAt,
      },
    });

    // Shown once, exactly as at registration.
    return apiOk({ ...serialize(sensor), deviceToken: device.token });
  } catch (error) {
    return writeConflictResponse(error, "Sensor")
      ?? infrastructureError("sensors", error);
  }
}
