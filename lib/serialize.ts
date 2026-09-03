/**
 * Wire serialization for database rows.
 *
 * Prisma returns `Date`, `Decimal`, and `BigInt` values. None of them survive
 * `JSON.stringify` or the Server -> Client Component boundary, so every row
 * leaving a route handler passes through here first. The result matches the
 * `Serialized<T>` DTO types in lib/types.ts:
 *
 * - `Date`    -> ISO 8601 string
 * - `Decimal` -> exact decimal string (`"12.5"`; not padded to column scale)
 * - `BigInt`  -> base-10 string
 *
 * Decimals are stringified rather than converted to numbers on purpose: a
 * NUMERIC(14, 5) value can exceed the precision of an IEEE-754 double.
 */

import { Prisma } from "@/app/generated/prisma/client";

import type { Serialized } from "./types";

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();

  if (Array.isArray(value)) return value.map(serializeValue);

  // Plain objects only. Anything else with a prototype (a Buffer, a class
  // instance) is left alone rather than being shallow-copied into a
  // meaningless object literal.
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = serializeValue(nested);
    }
    return result;
  }

  return value;
}

/**
 * Converts a row (or an array of rows, or a relation-loaded shape) into its
 * wire-safe form. The cast is the one place the runtime walk above is tied to
 * the `Serialized<T>` type mapping; the two must be kept in step.
 */
export function serialize<T>(value: T): Serialized<T> {
  return serializeValue(value) as Serialized<T>;
}
