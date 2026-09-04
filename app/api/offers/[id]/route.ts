import { OfferStatus } from "@/app/generated/prisma/enums";
import {
  apiError,
  apiOk,
  infrastructureError,
  notFoundError,
  parseRouteId,
  readJsonBody,
  validationError,
} from "@/lib/api";
import { WRITE, authorizeOrg, findOfferParties, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { respondToOfferSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/offers/:id
 * Body: { status: "accepted" | "rejected" | "withdrawn" }
 *
 * Both sides of a bid act through this endpoint, and which side you are on
 * decides what you may ask for:
 *
 * - `accepted` and `rejected` are the **seller's** answer, authorized against
 *   the organization that owns the *listing* — the buyer may read their own
 *   offer but must never be able to accept it;
 * - `withdrawn` is the **buyer** taking the bid back, authorized against the
 *   organization that made it. A seller cannot withdraw a bid on the buyer's
 *   behalf; refusing it is what `rejected` is for.
 *
 * Every transition is final and leaves `pending` exactly once, so a rejection
 * cannot be quietly reversed and two people acting at the same moment cannot
 * both succeed. Accepting deliberately does not mark the listing sold or turn
 * down the other bids: an offer may be for part of the quantity, so what
 * happens to the rest of the listing is the seller's decision, made through
 * PATCH /api/listings/:id.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Offer");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = respondToOfferSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { status } = parsed.data;

  try {
    const parties = await findOfferParties(route.id);
    if (!parties) return notFoundError("Offer");

    // Withdrawal belongs to the side that made the bid; answering to the side
    // that owns the listing.
    const withdrawing = status === OfferStatus.withdrawn;
    const actingOrganizationId = withdrawing
      ? parties.buyerOrganizationId
      : parties.sellerOrganizationId;

    const allowed = authorizeOrg(auth.session, actingOrganizationId, WRITE);

    if (!allowed.ok) {
      // Being on the *other* side of this bid is a different situation from
      // being a stranger to it, and worth saying plainly — it reveals nothing
      // the caller did not already know about a bid they are party to.
      const otherSide = withdrawing
        ? parties.sellerOrganizationId
        : parties.buyerOrganizationId;

      if (authorizeOrg(auth.session, otherSide, WRITE).ok) {
        return apiError(
          403,
          withdrawing
            ? "Only the buyer can withdraw a bid. Reject it instead."
            : "Only the seller can accept or reject an offer.",
        );
      }

      return allowed.response;
    }

    // Guarded so the transition happens exactly once: the status check and the
    // write are a single statement, so two people answering at the same moment
    // cannot both succeed.
    const answered = await prisma.offer.updateMany({
      where: { id: route.id, status: OfferStatus.pending },
      data: { status },
    });

    if (answered.count === 0) {
      return apiError(409, `This offer has already been ${parties.status}.`, {
        status: ["Only a pending offer can be answered or withdrawn."],
      });
    }

    const offer = await prisma.offer.findUniqueOrThrow({
      where: { id: route.id },
      include: {
        buyerOrganization: {
          select: { id: true, name: true, organizationType: true },
        },
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
      },
    });

    return apiOk(serialize(offer));
  } catch (error) {
    return infrastructureError("offers", error);
  }
}
