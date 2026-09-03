import {
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  notFoundError,
  parseRouteId,
  readJsonBody,
  validationError,
  writeConflictResponse,
} from "@/lib/api";
import { ADMIN, READ, requireOrgRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { slugify } from "@/lib/slug";
import { updateOrganizationSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/organizations/:id
 *
 * Includes members with their user records — an organization page needs the
 * roster, and it is bounded by the tenant's own headcount.
 *
 * Any member may read; a caller who does not belong to the organization gets
 * 403 rather than the row.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requireOrgRole(route.id, READ);
  if (!auth.ok) return auth.response;

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: route.id },
      include: {
        members: {
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!organization) return notFoundError("Organization");
    return apiOk(serialize(organization));
  } catch (error) {
    return infrastructureError("organizations", error);
  }
}

/**
 * PATCH /api/organizations/:id
 * Body: any subset of { name, description, organizationType, slug }
 *
 * Owners only. Renaming does not re-derive the slug: it is the organization's
 * stable public identifier, and changing it silently would break existing
 * links. A caller that wants a new slug sends one.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requireOrgRole(route.id, ADMIN);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateOrganizationSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, description, organizationType, slug } = parsed.data;

  if (slug !== undefined && !slugify(slug)) {
    return apiError(400, "The slug contains no usable characters.", {
      slug: ["Use lowercase letters, numbers, and single hyphens."],
    });
  }

  try {
    const organization = await prisma.organization.update({
      where: { id: route.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(organizationType !== undefined ? { organizationType } : {}),
        ...(slug !== undefined ? { slug } : {}),
      },
    });

    return apiOk(serialize(organization));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, `The slug "${slug}" is already taken.`, {
        slug: ["Already taken."],
      });
    }
    return writeConflictResponse(error, "Organization")
      ?? infrastructureError("organizations", error);
  }
}

/**
 * DELETE /api/organizations/:id
 *
 * Owners only, and a hard delete of the tenant's entire data set: farms,
 * fields, crop cycles, sensors, readings, tasks, inventory, and listings all
 * cascade from here.
 *
 * Crops are the exception and have to be unwound by hand. `crops` cascades
 * from the organization, but `crop_cycles.crop_id` is ON DELETE RESTRICT, and
 * Postgres does not order a cascade so that the cycles are gone before the
 * crops they point at. Left to the cascade this fails with a foreign key
 * violation, so the cycles under this tenant's fields are deleted first, then
 * its crops, then the organization itself — all in one transaction, so a
 * failure part-way through leaves the tenant intact.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requireOrgRole(route.id, ADMIN);
  if (!auth.ok) return auth.response;

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: route.id },
        select: { id: true },
      });
      if (!organization) return false;

      await tx.cropCycle.deleteMany({
        where: { field: { farm: { organizationId: route.id } } },
      });
      await tx.crop.deleteMany({ where: { organizationId: route.id } });
      await tx.organization.delete({ where: { id: route.id } });
      return true;
    });

    if (!deleted) return notFoundError("Organization");
    return new Response(null, { status: 204 });
  } catch (error) {
    // The RESTRICT can still fire if another tenant's crop cycle references a
    // crop owned by this one — nothing in the schema prevents that.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(
        409,
        "A crop owned by this organization is used by crop cycles outside it.",
        { id: ["Reassign or delete those crop cycles first."] },
      );
    }
    return writeConflictResponse(error, "Organization")
      ?? infrastructureError("organizations", error);
  }
}
