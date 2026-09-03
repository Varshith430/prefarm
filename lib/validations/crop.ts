import { z } from "zod";

import { CropCycleStatus } from "@/app/generated/prisma/enums";

import { type MassUnit, normalizeMassUnit } from "../units";

import {
  atLeastOneFieldError,
  booleanQueryParam,
  dateOnlySchema,
  decimalSchema,
  hasAtLeastOneKey,
  nullableText,
  offsetPaginationSchema,
  searchTermSchema,
  shortText,
  uuidSchema,
} from "./common";

const cropFields = z.object({
  /** Null marks a platform-wide crop shared across organizations. */
  organizationId: uuidSchema.nullable().optional(),
  name: shortText(120),
  variety: nullableText(120).optional(),
  // CHECK (typical_days_to_harvest > 0)
  typicalDaysToHarvest: z.number().int().positive().max(2000).nullable().optional(),
});

export const createCropSchema = cropFields;

export const updateCropSchema = cropFields
  .omit({ organizationId: true })
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

const cropCycleFields = z.object({
  fieldId: uuidSchema,
  cropId: uuidSchema,
  season: shortText(60),
  plantedOn: dateOnlySchema.nullable().optional(),
  expectedHarvestOn: dateOnlySchema.nullable().optional(),
  harvestedOn: dateOnlySchema.nullable().optional(),
  // Default applied on the create schema only, so a partial update that omits
  // `status` does not silently reset the cycle to 'planned'.
  status: z.enum(CropCycleStatus),
  // NUMERIC(14, 2) CHECK (expected_yield_kg >= 0)
  expectedYieldKg: decimalSchema({ precision: 14, scale: 2, min: 0 })
    .nullable()
    .optional(),
  // NUMERIC(14, 2) CHECK (actual_yield_kg >= 0)
  actualYieldKg: decimalSchema({ precision: 14, scale: 2, min: 0 })
    .nullable()
    .optional(),
  notes: nullableText().optional(),
});

/**
 * Mirrors the two date CHECK constraints on crop_cycles. Only runs when both
 * sides of a comparison are present, so partial updates stay valid.
 */
const checkCycleDates: z.core.CheckFn<{
  plantedOn?: Date | null;
  expectedHarvestOn?: Date | null;
  harvestedOn?: Date | null;
}> = (ctx) => {
  const { plantedOn, expectedHarvestOn, harvestedOn } = ctx.value;
  if (!plantedOn) return;

  if (expectedHarvestOn && expectedHarvestOn < plantedOn) {
    ctx.issues.push({
      code: "custom",
      input: expectedHarvestOn,
      path: ["expectedHarvestOn"],
      message: "Expected harvest cannot precede the planting date.",
    });
  }
  if (harvestedOn && harvestedOn < plantedOn) {
    ctx.issues.push({
      code: "custom",
      input: harvestedOn,
      path: ["harvestedOn"],
      message: "Harvest date cannot precede the planting date.",
    });
  }
};

export const createCropCycleSchema = cropCycleFields
  .extend({ status: z.enum(CropCycleStatus).default(CropCycleStatus.planned) })
  .check(checkCycleDates);

/** `fieldId` and `cropId` are omitted: re-planting is a new cycle, not an edit. */
export const updateCropCycleSchema = cropCycleFields
  .omit({ fieldId: true, cropId: true })
  .partial()
  .check(checkCycleDates)
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

/**
 * Mass units accepted on a harvest payload. Spellings are normalized by
 * `normalizeMassUnit`, so "Quintals", "metric ton", and "KG" all parse.
 */
export const massUnitSchema = z
  .string()
  .transform((value, ctx): MassUnit => {
    const unit = normalizeMassUnit(value);
    if (!unit) {
      ctx.addIssue({
        code: "custom",
        message: `Unrecognized unit "${value}". Use kg, g, t, quintal, or lb.`,
      });
      return z.NEVER;
    }
    return unit;
  });

/**
 * Closes out a cycle: recording a harvest requires a date and a yield.
 *
 * The yield is submitted in whatever unit it was weighed in and converted to
 * kilograms by the route before it reaches `crop_cycles.actual_yield_kg`,
 * which is kilograms by definition. `unit` defaults to kilograms, so a caller
 * that already works in kg can omit it.
 */
export const harvestCropCycleSchema = z.object({
  harvestedOn: dateOnlySchema,
  actualYield: z.number().finite().nonnegative(),
  unit: massUnitSchema.default("kg"),
  notes: nullableText().optional(),
});

/**
 * Filters for GET /api/crops. `includeShared` keeps the platform-wide crops
 * (`organization_id IS NULL`) in the result alongside a tenant's own, which is
 * what a crop picker needs.
 */
export const cropQuerySchema = offsetPaginationSchema.extend({
  organizationId: uuidSchema.optional(),
  includeShared: booleanQueryParam.default(true),
  search: searchTermSchema.optional(),
});

/** Filters for GET /api/crop-cycles. */
export const cropCycleQuerySchema = offsetPaginationSchema.extend({
  fieldId: uuidSchema.optional(),
  farmId: uuidSchema.optional(),
  cropId: uuidSchema.optional(),
  season: shortText(60).optional(),
  status: z.enum(CropCycleStatus).optional(),
});

export type CropQuery = z.infer<typeof cropQuerySchema>;
export type CropCycleQuery = z.infer<typeof cropCycleQuerySchema>;
export type CreateCropInput = z.infer<typeof createCropSchema>;
export type UpdateCropInput = z.infer<typeof updateCropSchema>;
export type CreateCropCycleInput = z.infer<typeof createCropCycleSchema>;
export type UpdateCropCycleInput = z.infer<typeof updateCropCycleSchema>;
export type HarvestCropCycleInput = z.infer<typeof harvestCropCycleSchema>;
