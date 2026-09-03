import { z } from "zod";

import { MovementType } from "@/app/generated/prisma/enums";

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

// NUMERIC(14, 3) CHECK (quantity >= 0) / CHECK (reorder_level >= 0)
const stockAmount = decimalSchema({ precision: 14, scale: 3, min: 0 });

const inventoryItemFields = z.object({
  organizationId: uuidSchema,
  name: shortText(160),
  /** Free-form grouping, e.g. "seed", "fertilizer", "fuel", "spare-parts". */
  category: shortText(80),
  /** Stock-keeping unit of measure, e.g. "kg", "L", "bag". */
  unit: shortText(24),
  quantity: stockAmount,
  reorderLevel: stockAmount,
});

/** `organizationId` is resolved from the session; see `createFarmSchema`. */
export const createInventoryItemSchema = inventoryItemFields.extend({
  organizationId: uuidSchema.optional(),
  quantity: stockAmount.default(0),
  reorderLevel: stockAmount.default(0),
});

export const updateInventoryItemSchema = inventoryItemFields
  .omit({ organizationId: true })
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

/**
 * Which way a movement pushes the running stock balance. It is a separate
 * field because `movementType` does not determine it: a purchase always adds
 * and usage always subtracts, but an adjustment can correct a count in either
 * direction and a transfer can be into or out of the site.
 */
export const movementDirectionSchema = z.enum(["in", "out"]);

export type MovementDirection = z.infer<typeof movementDirectionSchema>;

/** The directions that follow from the movement type on their own. */
const IMPLIED_DIRECTION: Partial<Record<MovementType, MovementDirection>> = {
  [MovementType.purchase]: "in",
  [MovementType.usage]: "out",
};

/**
 * Movements are append-only history. Quantity is always positive — direction
 * travels in `direction`, matching CHECK (quantity > 0). The signed effect on
 * inventory_items.quantity is applied in the same transaction as the insert.
 */
export const createInventoryMovementSchema = z
  .object({
    inventoryItemId: uuidSchema,
    recordedBy: uuidSchema.nullable().optional(),
    movementType: z.enum(MovementType),
    /** Optional for purchases and usage, where the type implies it. */
    direction: movementDirectionSchema.optional(),
    quantity: decimalSchema({ precision: 14, scale: 3, exclusiveMin: 0 }),
    occurredAt: timestampSchema.optional(),
    /** Links the movement to a purchase order, delivery note, or task. */
    reference: nullableText(160).optional(),
    notes: nullableText().optional(),
  })
  .transform((value, ctx) => {
    const direction = value.direction ?? IMPLIED_DIRECTION[value.movementType];

    if (!direction) {
      ctx.addIssue({
        code: "custom",
        path: ["direction"],
        message: `A ${value.movementType} must state a direction of "in" or "out".`,
      });
      return z.NEVER;
    }

    if (
      value.direction &&
      IMPLIED_DIRECTION[value.movementType] &&
      value.direction !== IMPLIED_DIRECTION[value.movementType]
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["direction"],
        message: `A ${value.movementType} is always "${IMPLIED_DIRECTION[value.movementType]}".`,
      });
      return z.NEVER;
    }

    return { ...value, direction };
  });

/**
 * Filters for GET /api/inventory. `lowStock=true` returns only the items at or
 * below their reorder level, which is the restocking view.
 */
export const inventoryItemQuerySchema = offsetPaginationSchema.extend({
  /** Omitted, the list covers every organization the caller belongs to. */
  organizationId: uuidSchema.optional(),
  category: shortText(80).optional(),
  lowStock: booleanQueryParam.optional(),
});

export const inventoryMovementQuerySchema = offsetPaginationSchema.extend({
  inventoryItemId: uuidSchema,
  movementType: z.enum(MovementType).optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
});

export type InventoryItemQuery = z.infer<typeof inventoryItemQuerySchema>;
export type InventoryMovementQuery = z.infer<typeof inventoryMovementQuerySchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type CreateInventoryMovementInput = z.infer<
  typeof createInventoryMovementSchema
>;
