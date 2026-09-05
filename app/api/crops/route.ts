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
  WRITE,
  requireSellingOrg,
  requireUser,
  resolveOrganizationId,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createCropSchema, cropQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/crops
 * Body: { name, organizationId?, variety?, typicalDaysToHarvest? }
 *
 * Creates a crop belonging to the caller's organization. Platform-wide crops
 * (`organization_id IS NULL`) cannot be created here: they are visible to
 * every tenant, so making one is an administrative act and there is no
 * platform-administrator role yet. Omitting `organizationId` therefore means
 * "my organization", not "everyone's".
 *
 * Note that `UNIQUE (organization_id, name, variety)` does not stop duplicates
 * when `variety` is NULL — Postgres treats NULLs as distinct — so a caller
 * that cares should send a variety.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createCropSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, variety, typicalDaysToHarvest } = parsed.data;

  const target = resolveOrganizationId(auth.session, parsed.data.organizationId, WRITE);
  if (!target.ok) return target.response;

  const organizationId = target.organizationId;

  // Crops are the varieties an organization grows, so they belong to the
  // growing side of the market. A buyer has nothing to record here.
  const selling = requireSellingOrg(auth.session, organizationId);
  if (!selling.ok) return selling.response;

  try {
    const crop = await prisma.crop.create({
      data: {
        organizationId,
        name,
        variety: variety ?? null,
        typicalDaysToHarvest: typicalDaysToHarvest ?? null,
      },
    });

    return apiCreated(serialize(crop), `/api/crops/${crop.id}`);
  } catch (error) {
    if (isPrismaKnownError(error)) {
      if (error.code === "P2002") {
        return apiError(409, `A crop named "${name}" with this variety already exists.`, {
          name: ["Already defined for this organization."],
        });
      }
      // The organization was proven to exist by the membership check above.
      if (error.code === "P2003") {
        return apiError(409, "The organization was removed while this request ran.");
      }
    }
    return infrastructureError("crops", error);
  }
}

/**
 * GET /api/crops?organizationId=&includeShared=&search=&limit=&offset=
 *
 * Returns the caller's own crops plus the platform-wide ones, which is what a
 * crop picker needs. `organizationId` narrows to one of their tenants;
 * `includeShared=false` drops the platform-wide entries.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = cropQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, includeShared, search } = parsed.data;

  const scope = scopeToMemberships(auth.session, parsed.data.organizationId);
  if (!scope.ok) return scope.response;

  // Shared crops belong to no tenant, so they sit outside the membership
  // scope and are added back as an explicit alternative.
  const ownership = includeShared
    ? { OR: [scope.where, { organizationId: null }] }
    : scope.where;

  // Both clauses can carry an `OR`, so they are combined under `AND` rather
  // than spread into one object, where the second `OR` would replace the first.
  const where = {
    AND: [
      ownership,
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { variety: { contains: search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  try {
    const [crops, total] = await prisma.$transaction([
      prisma.crop.findMany({
        where,
        orderBy: [{ name: "asc" }, { variety: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.crop.count({ where }),
    ]);

    return apiOk(serialize(crops), {
      pagination: paginationMeta(limit, offset, crops.length, total),
    });
  } catch (error) {
    return infrastructureError("crops", error);
  }
}
