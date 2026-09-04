import {
  apiOk,
  infrastructureError,
  paginationMeta,
  searchParamsToObject,
  validationError,
} from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { adminOrganizationQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/organizations?unverified=true&organizationType=&search=
 *
 * Every organization on the platform, for a platform administrator. This is
 * the one list endpoint that is not narrowed to the caller's memberships —
 * reviewing tenants you do not belong to is what the role is for — so it sits
 * under /api/admin rather than beside the tenant-scoped endpoints, where it
 * would be the exception that invites a mistake.
 *
 * Oldest first: the queue should be worked from the organization that has been
 * waiting longest.
 */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = adminOrganizationQuerySchema.safeParse(
    searchParamsToObject(url.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, unverified, organizationType, search } = parsed.data;

  const where = {
    ...(unverified === undefined
      ? {}
      : { verifiedAt: unverified ? { equals: null } : { not: null } }),
    ...(organizationType ? { organizationType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [organizations, total] = await prisma.$transaction([
      prisma.organization.findMany({
        where,
        include: {
          // Who to talk to about this organization, and how big it is.
          members: {
            where: { role: "owner" },
            include: { user: { select: { id: true, fullName: true, email: true } } },
            orderBy: { joinedAt: "asc" },
          },
          _count: { select: { members: true, farms: true, listings: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.organization.count({ where }),
    ]);

    return apiOk(serialize(organizations), {
      pagination: paginationMeta(limit, offset, organizations.length, total),
    });
  } catch (error) {
    return infrastructureError("admin-organizations", error);
  }
}
