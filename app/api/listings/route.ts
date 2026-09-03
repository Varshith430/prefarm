import { ListingStatus } from "@/app/generated/prisma/enums";
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
  organizationIdsFor,
  requireResourceRole,
  requireUser,
  resolveOrganizationId,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import {
  createMarketplaceListingSchema,
  marketplaceQuerySchema,
} from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/listings
 * Body: { organizationId, title, quantityKg, pricePerKg, description?,
 *         cropCycleId?, availableFrom?, status? }
 *
 * Listed on behalf of the caller's organization. Listings start as `draft`
 * unless a status is given, so produce is not published to the market by the
 * act of describing it.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createMarketplaceListingSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const {
    cropCycleId,
    title,
    description,
    quantityKg,
    pricePerKg,
    availableFrom,
    status,
  } = parsed.data;

  const target = resolveOrganizationId(auth.session, parsed.data.organizationId, WRITE);
  if (!target.ok) return target.response;

  const organizationId = target.organizationId;

  // Provenance may only point at the seller's own harvest.
  if (cropCycleId) {
    const access = await requireResourceRole(
      auth.session,
      "cropCycle",
      cropCycleId,
      READ,
    );
    if (!access.ok) return access.response;
  }

  try {
    const listing = await prisma.marketplaceListing.create({
      data: {
        organizationId,
        cropCycleId: cropCycleId ?? null,
        title,
        description: description ?? null,
        quantityKg,
        pricePerKg,
        availableFrom: availableFrom ?? null,
        status,
      },
    });

    return apiCreated(serialize(listing), `/api/listings/${listing.id}`);
  } catch (error) {
    // Both references were checked above.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(409, "A referenced record was removed while this request ran.");
    }
    return infrastructureError("listings", error);
  }
}

/**
 * GET /api/listings?status=&organizationId=&availableOn=&maxPricePerKg=
 *
 * This is the one endpoint that deliberately crosses tenant boundaries: a
 * marketplace where you can only see your own produce would be pointless. Any
 * signed-in caller sees every `active` listing on the platform, plus all of
 * their own organizations' listings whatever their status — so drafts, sold,
 * and archived rows stay private to the seller.
 *
 * `availableOn` returns what a buyer could collect on that date: listings
 * available from then or earlier, plus those with no stated date. Cheapest
 * first, since price is what a buyer is comparing.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = marketplaceQuerySchema.safeParse(
    searchParamsToObject(url.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, status, organizationId, availableOn, maxPricePerKg } =
    parsed.data;

  // Asking for a specific seller is allowed, but only their published rows
  // unless the caller is a member of that organization.
  const mine = organizationIdsFor(auth.session);
  const visible = {
    OR: [{ status: ListingStatus.active }, { organizationId: { in: mine } }],
  };

  const where = {
    AND: [
      visible,
      {
        ...(status ? { status } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(availableOn
          ? { OR: [{ availableFrom: { lte: availableOn } }, { availableFrom: null }] }
          : {}),
        ...(maxPricePerKg !== undefined ? { pricePerKg: { lte: maxPricePerKg } } : {}),
      },
    ],
  };

  try {
    const [listings, total] = await prisma.$transaction([
      prisma.marketplaceListing.findMany({
        where,
        include: { cropCycle: { include: { crop: true } } },
        orderBy: [{ pricePerKg: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.marketplaceListing.count({ where }),
    ]);

    return apiOk(serialize(listings), {
      pagination: paginationMeta(limit, offset, listings.length, total),
    });
  } catch (error) {
    return infrastructureError("listings", error);
  }
}
