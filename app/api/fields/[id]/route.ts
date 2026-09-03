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
import { updateFieldSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/fields/:id
 *
 * Loads the parent farm, the field's sensors, and its crop cycles newest
 * first — the shape a field detail view needs in one round trip.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Field");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "field", route.id, READ);
  if (!access.ok) return access.response;

  try {
    const field = await prisma.field.findUnique({
      where: { id: route.id },
      include: {
        farm: true,
        sensors: { orderBy: { name: "asc" } },
        cropCycles: {
          include: { crop: true },
          orderBy: [{ plantedOn: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!field) return notFoundError("Field");
    return apiOk(serialize(field));
  } catch (error) {
    return infrastructureError("fields", error);
  }
}

/**
 * PATCH /api/fields/:id
 * Body: any subset of { name, areaHectares, soilType, status }
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Field");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "field", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateFieldSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, areaHectares, soilType, status } = parsed.data;

  try {
    const field = await prisma.field.update({
      where: { id: route.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(areaHectares !== undefined ? { areaHectares } : {}),
        ...(soilType !== undefined ? { soilType } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    return apiOk(serialize(field));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, `This farm already has a field named "${name}".`, {
        name: ["Already used within this farm."],
      });
    }
    return writeConflictResponse(error, "Field") ?? infrastructureError("fields", error);
  }
}

/**
 * DELETE /api/fields/:id
 *
 * Managers and owners only. Crop cycles, sensors, and every reading below them
 * cascade; use `PATCH { status: "fallow" }` to rest a field without losing its
 * history.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Field");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "field", route.id, MANAGE);
  if (!access.ok) return access.response;

  try {
    await prisma.field.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Field") ?? infrastructureError("fields", error);
  }
}
