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
import { MANAGE, READ, WRITE, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { updateCropCycleSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/crop-cycles/:id — the cycle with its crop, field, and farm. */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop cycle");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "cropCycle", route.id, READ);
  if (!access.ok) return access.response;

  try {
    const cycle = await prisma.cropCycle.findUnique({
      where: { id: route.id },
      include: { crop: true, field: { include: { farm: true } } },
    });

    if (!cycle) return notFoundError("Crop cycle");
    return apiOk(serialize(cycle));
  } catch (error) {
    return infrastructureError("crop-cycles", error);
  }
}

/**
 * PATCH /api/crop-cycles/:id
 * Body: any subset of { season, plantedOn, expectedHarvestOn, harvestedOn,
 *                       status, expectedYieldKg, actualYieldKg, notes }
 *
 * `fieldId` and `cropId` are not accepted: re-planting is a new cycle, not an
 * edit of the old one. To close a cycle out, prefer POST :id/harvest, which
 * sets the date, yield, and status together.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop cycle");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "cropCycle", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateCropCycleSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const update = parsed.data;

  try {
    // The schema can only compare the dates present in the payload. A partial
    // update that moves one date past another already stored on the row is
    // checked here, against the row itself, inside the same transaction.
    const cycle = await prisma.$transaction(async (tx) => {
      const existing = await tx.cropCycle.findUnique({ where: { id: route.id } });
      if (!existing) return null;

      const plantedOn =
        update.plantedOn !== undefined ? update.plantedOn : existing.plantedOn;
      const expectedHarvestOn =
        update.expectedHarvestOn !== undefined
          ? update.expectedHarvestOn
          : existing.expectedHarvestOn;
      const harvestedOn =
        update.harvestedOn !== undefined ? update.harvestedOn : existing.harvestedOn;

      if (plantedOn) {
        if (expectedHarvestOn && expectedHarvestOn < plantedOn) {
          return "expected-before-planting" as const;
        }
        if (harvestedOn && harvestedOn < plantedOn) {
          return "harvest-before-planting" as const;
        }
      }

      return tx.cropCycle.update({
        where: { id: route.id },
        data: update,
        include: { crop: true },
      });
    });

    if (cycle === null) return notFoundError("Crop cycle");

    if (cycle === "expected-before-planting") {
      return apiError(422, "The expected harvest date precedes the planting date.", {
        expectedHarvestOn: ["Cannot be earlier than the planting date."],
      });
    }
    if (cycle === "harvest-before-planting") {
      return apiError(422, "The harvest date precedes the planting date.", {
        harvestedOn: ["Cannot be earlier than the planting date."],
      });
    }

    return apiOk(serialize(cycle));
  } catch (error) {
    return writeConflictResponse(error, "Crop cycle")
      ?? infrastructureError("crop-cycles", error);
  }
}

/**
 * DELETE /api/crop-cycles/:id
 *
 * Tasks and marketplace listings that referenced the cycle survive with their
 * `crop_cycle_id` set to NULL, so work records and listings are not destroyed
 * along with the cycle.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Crop cycle");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "cropCycle", route.id, MANAGE);
  if (!access.ok) return access.response;

  try {
    await prisma.cropCycle.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Crop cycle")
      ?? infrastructureError("crop-cycles", error);
  }
}
