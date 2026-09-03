import { z } from "zod";

import { ListingStatus } from "@/app/generated/prisma/enums";

import {
  atLeastOneFieldError,
  dateOnlySchema,
  decimalSchema,
  hasAtLeastOneKey,
  nullableText,
  numericQueryParam,
  offsetPaginationSchema,
  shortText,
  uuidSchema,
} from "./common";

// NUMERIC(12, 2) CHECK (price_per_kg >= 0) — zero allows giveaway listings.
const pricePerKg = decimalSchema({ precision: 12, scale: 2, min: 0 });

const listingFields = z.object({
  organizationId: uuidSchema,
  /** Optional provenance: the harvest this produce came from. */
  cropCycleId: uuidSchema.nullable().optional(),
  title: shortText(200),
  description: nullableText().optional(),
  // NUMERIC(14, 2) CHECK (quantity_kg > 0)
  quantityKg: decimalSchema({ precision: 14, scale: 2, exclusiveMin: 0 }),
  pricePerKg,
  availableFrom: dateOnlySchema.nullable().optional(),
  status: z.enum(ListingStatus),
});

/** `organizationId` is resolved from the session; see `createFarmSchema`. */
export const createMarketplaceListingSchema = listingFields.extend({
  organizationId: uuidSchema.optional(),
  status: z.enum(ListingStatus).default(ListingStatus.draft),
});

export const updateMarketplaceListingSchema = listingFields
  .omit({ organizationId: true })
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

export const marketplaceQuerySchema = offsetPaginationSchema.extend({
  status: z.enum(ListingStatus).optional(),
  organizationId: uuidSchema.optional(),
  availableOn: dateOnlySchema.optional(),
  maxPricePerKg: numericQueryParam(pricePerKg).optional(),
});

export type CreateMarketplaceListingInput = z.infer<
  typeof createMarketplaceListingSchema
>;
export type UpdateMarketplaceListingInput = z.infer<
  typeof updateMarketplaceListingSchema
>;
export type MarketplaceQuery = z.infer<typeof marketplaceQuerySchema>;
