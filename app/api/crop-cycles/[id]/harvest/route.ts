import {
  apiError,
  apiOk,
  infrastructureError,
  notFoundError,
  parseRouteId,
  readJsonBody,
  validationError,
  writeConflictResponse,
} from "@/lib/api";
import { WRITE, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { toKilograms } from "@/lib/units";
import { harvestCropCycleSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Largest value that fits NUMERIC(14, 2). */
const MAX_YIELD_KG = 10 ** 12;

/**
 * POST /api/crop-cycles/:id/harvest
 * Body: { harvestedOn, actualYield, unit?, notes? }
 *
 * Closing a cycle is its own endpoint rather than a PATCH: it is a state
 * transition that must set the date, the yield, and the status together, and
 * it is the one write that needs the stored planting date to validate against.
 */
export async function POST(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop cycle");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "cropCycle", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = harvestCropCycleSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { harvestedOn, actualYield, unit, notes } = parsed.data;

  // `actual_yield_kg` is kilograms by definition, so the submitted weight is
  // converted before it is stored, never after.
  const actualYieldKg = toKilograms(actualYield, unit);

  if (actualYieldKg >= MAX_YIELD_KG) {
    return apiError(400, "The converted yield is too large to store.", {
      actualYield: [`Must be under ${MAX_YIELD_KG} kg once converted from ${unit}.`],
    });
  }

  try {
    // Read and write in one transaction: the planting date the harvest is
    // validated against must be the one still on the row when it is updated.
    const cycle = await prisma.$transaction(async (tx) => {
      const existing = await tx.cropCycle.findUnique({ where: { id: route.id } });
      if (!existing) return null;

      // Mirrors CHECK (harvested_on >= planted_on).
      if (existing.plantedOn && harvestedOn < existing.plantedOn) {
        return "before-planting" as const;
      }

      return tx.cropCycle.update({
        where: { id: route.id },
        data: {
          harvestedOn,
          actualYieldKg,
          status: "harvested",
          ...(notes !== undefined ? { notes } : {}),
        },
        include: { crop: true },
      });
    });

    if (cycle === null) return notFoundError("Crop cycle");

    if (cycle === "before-planting") {
      return apiError(422, "The harvest date precedes this cycle's planting date.", {
        harvestedOn: ["Cannot be earlier than the planting date."],
      });
    }

    return apiOk(serialize(cycle));
  } catch (error) {
    return writeConflictResponse(error, "Crop cycle")
      ?? infrastructureError("crop-cycles", error);
  }
}
