import { z } from "zod";

import { FarmStatus, FieldStatus } from "@/app/generated/prisma/enums";

import {
  atLeastOneFieldError,
  decimalSchema,
  hasAtLeastOneKey,
  nullableText,
  offsetPaginationSchema,
  shortText,
  uuidSchema,
} from "./common";

// NUMERIC(12, 3) CHECK (area_hectares >= 0)
const farmArea = decimalSchema({ precision: 12, scale: 3, min: 0 });
// NUMERIC(12, 3) CHECK (area_hectares > 0)
const fieldArea = decimalSchema({ precision: 12, scale: 3, exclusiveMin: 0 });

/**
 * Base shapes carry no `.default()` values. Defaults are added on the create
 * schemas only — on a `.partial()` update schema they would turn an omitted
 * key into a write, silently resetting the column.
 */
const farmFields = z.object({
  organizationId: uuidSchema,
  name: shortText(160),
  location: nullableText(240).optional(),
  areaHectares: farmArea,
  status: z.enum(FarmStatus),
});

/**
 * `organizationId` is optional: the route resolves it from the caller's
 * session, and only needs it when the caller belongs to several organizations.
 * When present it is authorized against their memberships, never trusted.
 */
export const createFarmSchema = farmFields.extend({
  organizationId: uuidSchema.optional(),
  areaHectares: farmArea.default(0),
  status: z.enum(FarmStatus).default(FarmStatus.active),
});

/** `organizationId` is omitted: farms cannot be moved between tenants. */
export const updateFarmSchema = farmFields
  .omit({ organizationId: true })
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

const fieldFields = z.object({
  farmId: uuidSchema,
  name: shortText(160),
  areaHectares: fieldArea,
  soilType: nullableText(120).optional(),
  status: z.enum(FieldStatus),
});

export const createFieldSchema = fieldFields.extend({
  status: z.enum(FieldStatus).default(FieldStatus.active),
});

/** `farmId` is omitted: a field belongs to the farm it was created on. */
export const updateFieldSchema = fieldFields
  .omit({ farmId: true })
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

/**
 * Filters for GET /api/farms. `organizationId` is optional so the endpoint can
 * list across tenants; once auth exists it should be required, or derived from
 * the session rather than trusted from the query string.
 */
export const farmQuerySchema = offsetPaginationSchema.extend({
  organizationId: uuidSchema.optional(),
  status: z.enum(FarmStatus).optional(),
});

/**
 * Filters for GET /api/fields. Either `farmId` or `organizationId` narrows the
 * result; without one the endpoint lists fields across every tenant.
 */
export const fieldQuerySchema = offsetPaginationSchema.extend({
  farmId: uuidSchema.optional(),
  organizationId: uuidSchema.optional(),
  status: z.enum(FieldStatus).optional(),
});

export type FieldQuery = z.infer<typeof fieldQuerySchema>;
export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
export type FarmQuery = z.infer<typeof farmQuerySchema>;
