import {
  apiCreated,
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  paginationMeta,
  readJsonBody,
  searchParamsToObject,
  validationError,
} from "@/lib/api";
import {
  READ,
  WRITE,
  requireResourceRole,
  requireUser,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createCropCycleSchema, cropCycleQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/crop-cycles
 * Body: { fieldId, cropId, season, plantedOn?, expectedHarvestOn?,
 *         harvestedOn?, status?, expectedYieldKg?, actualYieldKg?, notes? }
 *
 * The tenant comes from the parent field. The crop is checked separately: it
 * must be one of the caller's own or a platform-wide one, so a cycle cannot be
 * used to point at another tenant's private crop.
 *
 * The date ordering rules (`expected_harvest_on >= planted_on` and
 * `harvested_on >= planted_on`) are checked by the Zod schema before the
 * insert, so a violation is a 400 with a field error rather than a raw
 * constraint failure from Postgres.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createCropCycleSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const {
    fieldId,
    cropId,
    season,
    plantedOn,
    expectedHarvestOn,
    harvestedOn,
    status,
    expectedYieldKg,
    actualYieldKg,
    notes,
  } = parsed.data;

  const fieldAccess = await requireResourceRole(auth.session, "field", fieldId, WRITE);
  if (!fieldAccess.ok) return fieldAccess.response;

  const cropAccess = await requireResourceRole(auth.session, "crop", cropId, READ);
  if (!cropAccess.ok) return cropAccess.response;

  try {
    const cycle = await prisma.cropCycle.create({
      data: {
        fieldId,
        cropId,
        season,
        plantedOn: plantedOn ?? null,
        expectedHarvestOn: expectedHarvestOn ?? null,
        harvestedOn: harvestedOn ?? null,
        status,
        expectedYieldKg: expectedYieldKg ?? null,
        actualYieldKg: actualYieldKg ?? null,
        notes: notes ?? null,
      },
      include: { crop: true },
    });

    return apiCreated(serialize(cycle), `/api/crop-cycles/${cycle.id}`);
  } catch (error) {
    // Both the field and the crop were proven to exist by the checks above.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(409, "The field or crop was removed while this request ran.");
    }
    return infrastructureError("crop-cycles", error);
  }
}

/**
 * GET /api/crop-cycles?fieldId=&farmId=&cropId=&season=&status=&limit=&offset=
 *
 * Always scoped through the parent field's farm to the caller's memberships.
 * `farmId` lists a farm's whole planting plan without walking its fields
 * first; both it and `fieldId` are authorized on their own, so naming another
 * tenant's is a 403 rather than a silently empty page.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = cropCycleQuerySchema.safeParse(
    searchParamsToObject(url.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, fieldId, farmId, cropId, season, status } = parsed.data;

  if (fieldId) {
    const access = await requireResourceRole(auth.session, "field", fieldId, READ);
    if (!access.ok) return access.response;
  }
  if (farmId) {
    const access = await requireResourceRole(auth.session, "farm", farmId, READ);
    if (!access.ok) return access.response;
  }

  const scope = scopeToMemberships(auth.session, undefined);
  if (!scope.ok) return scope.response;

  const where = {
    ...(fieldId ? { fieldId } : {}),
    field: { farm: { ...scope.where, ...(farmId ? { id: farmId } : {}) } },
    ...(cropId ? { cropId } : {}),
    ...(season ? { season } : {}),
    ...(status ? { status } : {}),
  };

  try {
    const [cycles, total] = await prisma.$transaction([
      prisma.cropCycle.findMany({
        where,
        include: { crop: true },
        // Planned cycles have no planting date yet; `nulls: "last"` keeps them
        // from crowding out the dated ones at the top of a descending sort.
        orderBy: [
          { plantedOn: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.cropCycle.count({ where }),
    ]);

    return apiOk(serialize(cycles), {
      pagination: paginationMeta(limit, offset, cycles.length, total),
    });
  } catch (error) {
    return infrastructureError("crop-cycles", error);
  }
}
