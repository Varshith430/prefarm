import { z } from "zod";

import { SensorType } from "@/app/generated/prisma/enums";

import {
  atLeastOneFieldError,
  booleanQueryParam,
  decimalSchema,
  hasAtLeastOneKey,
  nullableText,
  offsetPaginationSchema,
  shortText,
  timestampSchema,
  uuidSchema,
} from "./common";

const sensorFields = z.object({
  fieldId: uuidSchema,
  name: shortText(120),
  sensorType: z.enum(SensorType),
  /** Unit of measure for readings, e.g. "%", "degC", "mm", "pH", "lux". */
  unit: shortText(24),
  /** Vendor/gateway identifier; unique across the platform when present. */
  externalId: nullableText(160).optional(),
  installedAt: timestampSchema.nullable().optional(),
  // No `.default()` here: on the `.partial()` update schema below a default
  // would turn an omitted key into a write.
  isActive: z.boolean(),
});

export const createSensorSchema = sensorFields.extend({
  isActive: z.boolean().default(true),
});

/** `fieldId` is omitted: moving hardware is a decommission plus a new sensor. */
export const updateSensorSchema = sensorFields
  .omit({ fieldId: true })
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

/**
 * A single telemetry sample. NUMERIC(14, 5) with no CHECK constraint — values
 * are legitimately negative (sub-zero temperatures), so no lower bound.
 */
export const createSensorReadingSchema = z.object({
  sensorId: uuidSchema,
  recordedAt: timestampSchema,
  value: decimalSchema({ precision: 14, scale: 5 }),
});

/**
 * Batch ingest. `(sensor_id, recorded_at)` is unique, so callers should write
 * these with `skipDuplicates` to make gateway retries idempotent.
 */
export const ingestSensorReadingsSchema = z.object({
  readings: z.array(createSensorReadingSchema).min(1).max(1000),
});

/** Filters for GET /api/sensors. */
export const sensorQuerySchema = offsetPaginationSchema.extend({
  fieldId: uuidSchema.optional(),
  farmId: uuidSchema.optional(),
  sensorType: z.enum(SensorType).optional(),
  isActive: booleanQueryParam.optional(),
});

export const sensorReadingQuerySchema = offsetPaginationSchema.extend({
  sensorId: uuidSchema,
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
});

export type SensorQuery = z.infer<typeof sensorQuerySchema>;
export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type UpdateSensorInput = z.infer<typeof updateSensorSchema>;
export type CreateSensorReadingInput = z.infer<typeof createSensorReadingSchema>;
export type IngestSensorReadingsInput = z.infer<typeof ingestSensorReadingsSchema>;
export type SensorReadingQuery = z.infer<typeof sensorReadingQuerySchema>;
