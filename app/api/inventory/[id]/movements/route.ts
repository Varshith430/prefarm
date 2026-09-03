import {
  apiCreated,
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  paginationMeta,
  parseRouteId,
  readJsonBody,
  searchParamsToObject,
  validationError,
} from "@/lib/api";
import { READ, WRITE, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import {
  createInventoryMovementSchema,
  inventoryMovementQuerySchema,
} from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/inventory/:id/movements
 * Body: { movementType, quantity, direction?, recordedBy?, occurredAt?,
 *         reference?, notes? }
 *
 * Records a stock change and moves the item's balance by the same amount, in
 * one transaction — the movement log is the explanation for the balance, so
 * neither may exist without the other.
 *
 * `direction` is optional for `purchase` (always in) and `usage` (always out),
 * and required for `adjustment` and `transfer`, which go either way.
 *
 * `recordedBy` defaults to the caller, so the movement log says who did it
 * without the client having to assert an identity.
 */
export async function POST(request: Request, context: Context) {
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

  // The item always comes from the path; an `inventoryItemId` in the body is
  // ignored rather than allowed to move stock on a different item.
  const parsed = createInventoryMovementSchema.safeParse({
    ...(typeof body.value === "object" && body.value !== null ? body.value : {}),
    inventoryItemId: route.id,
  });
  if (!parsed.success) return validationError(parsed.error);

  const {
    inventoryItemId,
    movementType,
    direction,
    quantity,
    occurredAt,
    reference,
    notes,
  } = parsed.data;

  // A caller may record a movement on behalf of a colleague, but only one who
  // shares the organization the item belongs to.
  const recordedBy = parsed.data.recordedBy ?? auth.session.user.id;

  if (recordedBy !== auth.session.user.id) {
    const shared = await prisma.organizationMember.findFirst({
      where: { userId: recordedBy, organizationId: access.organizationId ?? "" },
      select: { userId: true },
    });
    if (!shared) {
      return apiError(422, "The recording user is not a member of this organization.", {
        recordedBy: ["Not a member of this organization."],
      });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The `quantity: { gte }` guard makes the check and the decrement one
      // statement, so two concurrent withdrawals cannot both read the same
      // balance and drive the column below zero.
      const moved = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItemId,
          ...(direction === "out" ? { quantity: { gte: quantity } } : {}),
        },
        data: {
          quantity:
            direction === "in" ? { increment: quantity } : { decrement: quantity },
        },
      });

      if (moved.count === 0) {
        // Either the item is gone or there was not enough stock to take.
        const exists = await tx.inventoryItem.findUnique({
          where: { id: inventoryItemId },
          select: { quantity: true, unit: true },
        });
        return exists
          ? ({ kind: "insufficient", available: exists.quantity.toString(), unit: exists.unit } as const)
          : ({ kind: "missing" } as const);
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryItemId,
          movementType,
          quantity,
          recordedBy,
          ...(occurredAt ? { occurredAt } : {}),
          reference: reference ?? null,
          notes: notes ?? null,
        },
        include: { recorder: true },
      });

      const item = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: inventoryItemId },
      });

      return { kind: "ok", movement, item } as const;
    });

    if (result.kind === "missing") return apiError(404, "Inventory item not found.");

    if (result.kind === "insufficient") {
      return apiError(
        409,
        `Only ${result.available} ${result.unit} in stock; cannot remove ${quantity}.`,
        { quantity: [`Exceeds the available balance of ${result.available}.`] },
      );
    }

    return apiCreated(
      serialize({ movement: result.movement, item: result.item }),
      `/api/inventory/${inventoryItemId}/movements`,
    );
  } catch (error) {
    // A movement's only other foreign key is `recorded_by`.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(422, "The recording user does not exist.", {
        recordedBy: ["No user found with this id."],
      });
    }
    return infrastructureError("inventory-movements", error);
  }
}

/**
 * GET /api/inventory/:id/movements?movementType=&from=&to=&limit=&offset=
 *
 * Newest first, matching inventory_movements_item_occurred_idx. `from` is
 * inclusive and `to` exclusive.
 */
export async function GET(request: Request, context: Context) {
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

  const url = new URL(request.url);
  const parsed = inventoryMovementQuerySchema.safeParse({
    ...searchParamsToObject(url.searchParams),
    inventoryItemId: route.id,
  });
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, inventoryItemId, movementType, from, to } = parsed.data;

  if (from && to && to < from) {
    return apiError(400, "The time window ends before it starts.", {
      to: ["Must be later than `from`."],
    });
  }

  const where = {
    inventoryItemId,
    ...(movementType ? { movementType } : {}),
    ...(from || to
      ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
  };

  try {
    const [movements, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        include: { recorder: true },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return apiOk(serialize(movements), {
      pagination: paginationMeta(limit, offset, movements.length, total),
    });
  } catch (error) {
    return infrastructureError("inventory-movements", error);
  }
}
