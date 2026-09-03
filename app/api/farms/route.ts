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
  requireUser,
  resolveOrganizationId,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createFarmSchema, farmQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/farms
 * Body: { name, organizationId?, location?, areaHectares?, status? }
 *
 * The farm is created in the caller's organization. `organizationId` is only
 * needed when they belong to more than one, and is checked against their
 * memberships either way — it can select among their tenants, never target
 * somebody else's.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createFarmSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, location, areaHectares, status } = parsed.data;

  const target = resolveOrganizationId(auth.session, parsed.data.organizationId, WRITE);
  if (!target.ok) return target.response;

  const organizationId = target.organizationId;

  try {
    const farm = await prisma.farm.create({
      data: {
        organizationId,
        name,
        location: location ?? null,
        areaHectares,
        status,
      },
    });

    return apiCreated(serialize(farm), `/api/farms/${farm.id}`);
  } catch (error) {
    if (isPrismaKnownError(error)) {
      // UNIQUE (organization_id, name)
      if (error.code === "P2002") {
        return apiError(
          409,
          `This organization already has a farm named "${name}".`,
          { name: ["Already used within this organization."] },
        );
      }
      // The organization was proven to exist by the membership check above,
      // so a foreign key failure here means it was deleted mid-request.
      if (error.code === "P2003") {
        return apiError(409, "The organization was removed while this request ran.");
      }
    }
    return infrastructureError("farms", error);
  }
}

/**
 * GET /api/farms?organizationId=&status=&limit=&offset=
 *
 * Scoped to the caller's memberships: naming an `organizationId` narrows to
 * that one tenant if they belong to it, and omitting it lists the farms of
 * every organization they are in.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = farmQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, status } = parsed.data;

  const scope = scopeToMemberships(auth.session, parsed.data.organizationId);
  if (!scope.ok) return scope.response;

  const where = {
    ...scope.where,
    ...(status ? { status } : {}),
  };

  try {
    // Counted in the same round trip so `total` cannot drift from the page.
    const [farms, total] = await prisma.$transaction([
      prisma.farm.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.farm.count({ where }),
    ]);

    return apiOk(serialize(farms), {
      pagination: paginationMeta(limit, offset, farms.length, total),
    });
  } catch (error) {
    return infrastructureError("farms", error);
  }
}
