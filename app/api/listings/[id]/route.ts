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
import { MANAGE, WRITE, roleIn, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { updateMarketplaceListingSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/listings/:id
 *
 * Readable by any signed-in caller once the listing is `active` — it is on the
 * open market — and by the seller's own members in any status. Includes the
 * crop cycle and crop when the listing states its provenance, which is what a
 * buyer checks before committing.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Listing");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: route.id },
      include: {
        organization: true,
        cropCycle: { include: { crop: true, field: { include: { farm: true } } } },
      },
    });

    if (!listing) return notFoundError("Listing");

    // The same rule as the collection: your own rows are always yours to read,
    // and everyone else's only once published by a verified organization.
    // Without this a direct link would walk straight past the marketplace
    // filter.
    const isMember = roleIn(auth.session, listing.organizationId) !== null;
    const publiclyVisible =
      listing.status === "active" && listing.organization.verifiedAt !== null;

    if (!isMember && !publiclyVisible) {
      return notFoundError("Listing");
    }

    return apiOk(serialize(listing));
  } catch (error) {
    return infrastructureError("listings", error);
  }
}

/**
 * PATCH /api/listings/:id
 * Body: any subset of { title, description, quantityKg, pricePerKg,
 *                       availableFrom, cropCycleId, status }
 *
 * Publishing, marking sold, and archiving are all status changes, so they go
 * through here rather than through endpoints of their own.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Listing");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "listing", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateMarketplaceListingSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const listing = await prisma.marketplaceListing.update({
      where: { id: route.id },
      data: parsed.data,
    });

    return apiOk(serialize(listing));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(422, "The referenced crop cycle does not exist.", {
        cropCycleId: ["No crop cycle found with this id."],
      });
    }
    return writeConflictResponse(error, "Listing")
      ?? infrastructureError("listings", error);
  }
}

/**
 * DELETE /api/listings/:id
 *
 * `PATCH { status: "archived" }` is the reversible alternative, and keeps the
 * listing visible in the organization's own history.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Listing");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "listing", route.id, MANAGE);
  if (!access.ok) return access.response;

  try {
    await prisma.marketplaceListing.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Listing")
      ?? infrastructureError("listings", error);
  }
}
