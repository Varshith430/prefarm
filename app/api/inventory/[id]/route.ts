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
import { updateInventoryItemSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** How much movement history a single item response carries. */
const RECENT_MOVEMENTS = 50;

/** GET /api/inventory/:id — the item with its most recent movements. */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Inventory item");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(
    auth.session,
    "inventoryItem",
    route.id,
    READ,
  );
  if (!access.ok) return access.response;

  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: route.id },
      include: {
        movements: {
          include: { recorder: true },
          orderBy: { occurredAt: "desc" },
          take: RECENT_MOVEMENTS,
        },
      },
    });

    if (!item) return notFoundError("Inventory item");
    return apiOk(serialize(item));
  } catch (error) {
    return infrastructureError("inventory", error);
  }
}

/**
 * PATCH /api/inventory/:id
 * Body: any subset of { name, category, unit, quantity, reorderLevel }
 *
 * Setting `quantity` here overwrites the balance without recording why. It
 * exists for correcting a bad opening figure; a real stock change belongs in
 * POST :id/movements, which writes the history and the balance together.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Inventory item");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(
    auth.session,
    "inventoryItem",
    route.id,
    WRITE,
  );
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateInventoryItemSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const item = await prisma.inventoryItem.update({
      where: { id: route.id },
      data: parsed.data,
    });

    return apiOk(serialize(item));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, "This organization already stocks an item with that name.", {
        name: ["Already used within this organization."],
      });
    }
    return writeConflictResponse(error, "Inventory item")
      ?? infrastructureError("inventory", error);
  }
}

/**
 * DELETE /api/inventory/:id
 *
 * Managers and owners only: the item's movement history cascades away with it,
 * discarding the record of everything ever bought or consumed against it.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Inventory item");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(
    auth.session,
    "inventoryItem",
    route.id,
    MANAGE,
  );
  if (!access.ok) return access.response;

  try {
    await prisma.inventoryItem.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Inventory item")
      ?? infrastructureError("inventory", error);
  }
}
