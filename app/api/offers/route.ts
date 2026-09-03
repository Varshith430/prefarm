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
  authorizeOrg,
  organizationIdsFor,
  requireUser,
  resolveOrganizationId,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createOfferSchema, offerQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything a card needs about a bid, on either side of it. */
const OFFER_INCLUDE = {
  buyerOrganization: { select: { id: true, name: true, organizationType: true } },
  buyer: { select: { id: true, fullName: true, email: true } },
  listing: {
    select: {
      id: true,
      title: true,
      organizationId: true,
      quantityKg: true,
      pricePerKg: true,
      status: true,
    },
  },
} as const;

/**
 * POST /api/offers
 * Body: { listingId, pricePerUnit, quantity, organizationId? }
 *
 * Places a bid on behalf of one of the caller's organizations. The seller is
 * never taken from the payload — it is whoever owns the listing.
 *
 * A listing that does not exist, is not published, or is already sold gives
 * the same refusal, so this endpoint cannot be used to discover which
 * listing ids are real or to watch another tenant's drafts.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createOfferSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { listingId, pricePerUnit, quantity } = parsed.data;

  const buyer = resolveOrganizationId(
    auth.session,
    parsed.data.organizationId,
    WRITE,
  );
  if (!buyer.ok) return buyer.response;

  try {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, organizationId: true, status: true },
    });

    if (!listing || listing.status !== ListingStatus.active) {
      return apiError(422, "That listing is not open for offers.", {
        listingId: ["No published listing with this id."],
      });
    }

    if (listing.organizationId === buyer.organizationId) {
      return apiError(422, "You cannot bid on your own listing.", {
        listingId: ["This listing belongs to the organization you are bidding as."],
      });
    }

    const offer = await prisma.offer.create({
      data: {
        listingId,
        buyerOrganizationId: buyer.organizationId,
        // Recorded so the seller can see who they are dealing with; nulled if
        // that person later leaves, which does not affect the bid itself.
        buyerId: auth.session.user.id,
        pricePerUnit,
        quantity,
      },
      include: OFFER_INCLUDE,
    });

    return apiCreated(serialize(offer), `/api/offers/${offer.id}`);
  } catch (error) {
    // The partial unique index allows one pending offer per buyer per listing.
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(
        409,
        "You already have an offer awaiting an answer on this listing.",
        { listingId: ["Withdraw or wait for a reply before bidding again."] },
      );
    }
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(409, "The listing was removed while this request ran.");
    }
    return infrastructureError("offers", error);
  }
}

/**
 * GET /api/offers?listingId=&status=&buyerOrganizationId=&limit=&offset=
 *
 * Serves both sides of a bid from one endpoint, because who you are decides
 * what you see:
 *
 * - a member of the **selling** organization sees every offer on its listings,
 *   which is the seller's view of the bidding;
 * - anyone else sees only the offers their own organizations have made.
 *
 * That distinction is the whole point of the scope below: without it, asking
 * for `?listingId=` would let one buyer read every rival bid on a listing.
 *
 * Highest price first, since that is the order a seller is deciding in.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = offerQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, listingId, status, buyerOrganizationId } = parsed.data;

  // Asking to filter by a buyer organization only makes sense for one of your
  // own; anything else is refused rather than silently returning nothing.
  if (buyerOrganizationId) {
    const allowed = authorizeOrg(auth.session, buyerOrganizationId, READ);
    if (!allowed.ok) return allowed.response;
  }

  const mine = organizationIdsFor(auth.session);

  const where = {
    AND: [
      {
        OR: [
          // Offers on listings my organizations are selling.
          { listing: { organizationId: { in: mine } } },
          // Offers my organizations have made.
          { buyerOrganizationId: { in: mine } },
        ],
      },
      {
        ...(listingId ? { listingId } : {}),
        ...(status ? { status } : {}),
        ...(buyerOrganizationId ? { buyerOrganizationId } : {}),
      },
    ],
  };

  try {
    const [offers, total] = await prisma.$transaction([
      prisma.offer.findMany({
        where,
        include: OFFER_INCLUDE,
        orderBy: [{ pricePerUnit: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.offer.count({ where }),
    ]);

    return apiOk(serialize(offers), {
      pagination: paginationMeta(limit, offset, offers.length, total),
    });
  } catch (error) {
    return infrastructureError("offers", error);
  }
}
