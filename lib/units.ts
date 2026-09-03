/**
 * Mass unit handling for yield figures.
 *
 * `crop_cycles.expected_yield_kg` is kilograms by definition, so any yield
 * submitted in another unit is converted before it is stored.
 */

export const MASS_UNITS = ["kg", "g", "t", "quintal", "lb"] as const;

export type MassUnit = (typeof MASS_UNITS)[number];

/** Multipliers to kilograms. `quintal` is the Indian quintal of 100 kg. */
const TO_KILOGRAMS: Record<MassUnit, number> = {
  kg: 1,
  g: 0.001,
  t: 1000,
  quintal: 100,
  lb: 0.45359237,
};

/** Spellings accepted from clients, normalized to a canonical unit. */
const ALIASES: Record<string, MassUnit> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  kilogram: "kg", kilograms: "kg", kilogramme: "kg", kilogrammes: "kg",
  g: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  t: "t", ton: "t", tons: "t", tonne: "t", tonnes: "t",
  mt: "t", metricton: "t", metrictons: "t", metrictonne: "t",
  q: "quintal", quintal: "quintal", quintals: "quintal",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
};

/**
 * Normalizes a unit string ("KG", "Tonnes", "metric ton") to a canonical unit,
 * or returns null when it is not recognized.
 */
export function normalizeMassUnit(input: string): MassUnit | null {
  const key = input.trim().toLowerCase().replace(/[\s._-]+/g, "");
  return ALIASES[key] ?? null;
}

/**
 * Converts a quantity to kilograms, rounded to 2 decimals to match
 * NUMERIC(14, 2). Rounding is done on a fixed-point string to avoid the
 * float artefacts of `Math.round(x * 100) / 100`.
 */
export function toKilograms(value: number, unit: MassUnit): number {
  return Number((value * TO_KILOGRAMS[unit]).toFixed(2));
}
