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
  WRITE,
  requireUser,
  resolveOrganizationId,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import {
  createInventoryItemSchema,
  inventoryItemQuerySchema,
} from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inventory
 * Body: { organizationId, name, category, unit, quantity?, reorderLevel? }
 *
 * Created in the caller's organization. An opening balance may be set with
 * `quantity`; every later change should go through POST
 * /api/inventory/:id/movements so the stock level always has a movement
 * explaining it.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createInventoryItemSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, category, unit, quantity, reorderLevel } = parsed.data;

  const target = resolveOrganizationId(auth.session, parsed.data.organizationId, WRITE);
  if (!target.ok) return target.response;

  const organizationId = target.organizationId;

  try {
    const item = await prisma.inventoryItem.create({
      data: { organizationId, name, category, unit, quantity, reorderLevel },
    });

    return apiCreated(serialize(item), `/api/inventory/${item.id}`);
  } catch (error) {
    if (isPrismaKnownError(error)) {
      // UNIQUE (organization_id, name)
      if (error.code === "P2002") {
        return apiError(409, `This organization already stocks an item named "${name}".`, {
          name: ["Already used within this organization."],
        });
      }
      // The organization was proven to exist by the membership check above.
      if (error.code === "P2003") {
        return apiError(409, "The organization was removed while this request ran.");
      }
    }
    return infrastructureError("inventory", error);
  }
}

/**
 * GET /api/inventory?organizationId=&category=&lowStock=&limit=&offset=
 *
 * `lowStock=true` narrows to items at or below their reorder level — the
 * restocking view. The comparison is done in SQL against the row's own
 * `reorder_level` column rather than by filtering a fetched page, so it
 * applies across the whole table before pagination.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = inventoryItemQuerySchema.safeParse(
    searchParamsToObject(url.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, category, lowStock } = parsed.data;

  const scope = scopeToMemberships(auth.session, parsed.data.organizationId);
  if (!scope.ok) return scope.response;

  const where = {
    ...scope.where,
    ...(category ? { category } : {}),
    ...(lowStock ? { quantity: { lte: prisma.inventoryItem.fields.reorderLevel } } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.inventoryItem.findMany({
        where,
        orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return apiOk(serialize(items), {
      pagination: paginationMeta(limit, offset, items.length, total),
    });
  } catch (error) {
    return infrastructureError("inventory", error);
  }
}
