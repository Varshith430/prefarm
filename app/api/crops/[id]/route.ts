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
import { updateCropSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/crops/:id
 *
 * Readable by any member of the owning organization, and by anyone signed in
 * when the crop is platform-wide.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "crop", route.id, READ);
  if (!access.ok) return access.response;

  try {
    const crop = await prisma.crop.findUnique({ where: { id: route.id } });
    if (!crop) return notFoundError("Crop");
    return apiOk(serialize(crop));
  } catch (error) {
    return infrastructureError("crops", error);
  }
}

/**
 * PATCH /api/crops/:id
 * Body: any subset of { name, variety, typicalDaysToHarvest }
 *
 * `organizationId` is not accepted: turning a tenant's crop into a shared one
 * (or the reverse) would change who can see it, and existing cycles reference
 * it either way.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // A shared crop is refused here: `requireResourceRole` only allows READ on
  // rows that belong to no tenant.
  const access = await requireResourceRole(auth.session, "crop", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateCropSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, variety, typicalDaysToHarvest } = parsed.data;

  try {
    const crop = await prisma.crop.update({
      where: { id: route.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(variety !== undefined ? { variety } : {}),
        ...(typicalDaysToHarvest !== undefined ? { typicalDaysToHarvest } : {}),
      },
    });

    return apiOk(serialize(crop));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, "A crop with this name and variety already exists.", {
        name: ["Already defined for this organization."],
      });
    }
    return writeConflictResponse(error, "Crop") ?? infrastructureError("crops", error);
  }
}

/**
 * DELETE /api/crops/:id
 *
 * `crop_cycles.crop_id` is ON DELETE RESTRICT, so a crop that has ever been
 * planted cannot be removed — that would erase the meaning of its history.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "crop", route.id, MANAGE);
  if (!access.ok) return access.response;

  try {
    await prisma.crop.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    // P2003 here is the RESTRICT firing, not a missing parent row, so it is
    // handled before the shared foreign-key mapping.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(409, "This crop is used by existing crop cycles.", {
        id: ["Delete or reassign its crop cycles first."],
      });
    }
    return writeConflictResponse(error, "Crop") ?? infrastructureError("crops", error);
  }
}
