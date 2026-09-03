import { z } from "zod";

import { OfferStatus } from "@/app/generated/prisma/enums";

import {
  decimalSchema,
  offsetPaginationSchema,
  uuidSchema,
} from "./common";

// NUMERIC(12, 2) CHECK (price_per_unit >= 0) — zero allows a giveaway bid.
const pricePerUnit = decimalSchema({ precision: 12, scale: 2, min: 0 });
// NUMERIC(14, 2) CHECK (quantity > 0)
const quantity = decimalSchema({ precision: 14, scale: 2, exclusiveMin: 0 });

/**
 * A bid on a listing.
 *
 * `organizationId` names which of the caller's organizations is bidding, and
 * is only needed when they belong to more than one; the route checks it
 * against their memberships either way. The seller is never taken from the
 * payload — it comes from the listing being bid on.
 */
export const createOfferSchema = z.object({
  listingId: uuidSchema,
  organizationId: uuidSchema.optional(),
  pricePerUnit,
  quantity,
});

/**
 * A seller's answer to a bid. `pending` is not accepted: it is where an offer
 * starts, not something it can be moved back to once answered.
 */
export const respondToOfferSchema = z.object({
  status: z.enum([OfferStatus.accepted, OfferStatus.rejected]),
});

export const offerQuerySchema = offsetPaginationSchema.extend({
  listingId: uuidSchema.optional(),
  status: z.enum(OfferStatus).optional(),
  /** Narrows to bids made by one of the caller's own organizations. */
  buyerOrganizationId: uuidSchema.optional(),
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type RespondToOfferInput = z.infer<typeof respondToOfferSchema>;
export type OfferQuery = z.infer<typeof offerQuerySchema>;
