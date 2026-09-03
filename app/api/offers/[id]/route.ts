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
 * Body: { status: "accepted" | "rejected" }
 *
 * The seller's answer to a bid. Authorized against the organization that owns
 * the *listing*, not the one that owns the offer row — the buyer may read
 * their own offer but must not be able to accept it.
 *
 * Answering is final: an offer leaves `pending` once, so a rejection cannot be
 * quietly reversed, and two managers acting at the same time cannot both
 * "win". Accepting deliberately does not mark the listing sold or turn down
 * the other bids: an offer may be for part of the quantity, so what happens to
 * the rest of the listing is the seller's decision, made through
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

    const allowed = authorizeOrg(
      auth.session,
      parties.sellerOrganizationId,
      WRITE,
    );

    if (!allowed.ok) {
      // The buyer can see this offer but cannot answer it. Saying so is
      // clearer than the generic membership message, and reveals nothing they
      // did not already know about their own bid.
      const isBuyer = authorizeOrg(
        auth.session,
        parties.buyerOrganizationId,
        WRITE,
      ).ok;

      return isBuyer
        ? apiError(403, "Only the seller can accept or reject an offer.")
        : allowed.response;
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
        status: ["Only a pending offer can be answered."],
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
