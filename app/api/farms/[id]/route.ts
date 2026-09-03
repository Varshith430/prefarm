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
import { updateFarmSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/farms/:id — the farm with its fields.
 *
 * The farm's organization is resolved from the row and checked against the
 * caller's memberships, so a farm in another tenant is a 403 and one that does
 * not exist is a 404.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Farm");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "farm", route.id, READ);
  if (!access.ok) return access.response;

  try {
    const farm = await prisma.farm.findUnique({
      where: { id: route.id },
      include: { fields: { orderBy: { name: "asc" } } },
    });

    if (!farm) return notFoundError("Farm");
    return apiOk(serialize(farm));
  } catch (error) {
    return infrastructureError("farms", error);
  }
}

/**
 * PATCH /api/farms/:id
 * Body: any subset of { name, location, areaHectares, status }
 *
 * `organizationId` is not accepted: a farm cannot be moved between tenants.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Farm");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "farm", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateFarmSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, location, areaHectares, status } = parsed.data;

  try {
    const farm = await prisma.farm.update({
      where: { id: route.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(areaHectares !== undefined ? { areaHectares } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    return apiOk(serialize(farm));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, `This organization already has a farm named "${name}".`, {
        name: ["Already used within this organization."],
      });
    }
    return writeConflictResponse(error, "Farm") ?? infrastructureError("farms", error);
  }
}

/**
 * DELETE /api/farms/:id
 *
 * Managers and owners only. Fields, their crop cycles, sensors, and readings
 * all cascade; archiving (`PATCH { status: "archived" }`) is the
 * non-destructive alternative.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Farm");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "farm", route.id, MANAGE);
  if (!access.ok) return access.response;

  try {
    await prisma.farm.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Farm") ?? infrastructureError("farms", error);
  }
}
