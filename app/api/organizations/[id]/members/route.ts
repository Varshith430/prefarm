import {
  apiError,
  apiOk,
  infrastructureError,
  parseRouteId,
  readJsonBody,
  validationError,
  writeConflictResponse,
} from "@/lib/api";
import { ADMIN, READ, requireOrgRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { removeMembershipSchema, upsertMembershipSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/organizations/:id/members — the roster, with each member's user.
 * Any member may see who else is in their organization.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requireOrgRole(route.id, READ);
  if (!auth.ok) return auth.response;

  try {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: route.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });

    return apiOk(serialize(members));
  } catch (error) {
    return infrastructureError("memberships", error);
  }
}

/**
 * PUT /api/organizations/:id/members
 * Body: { userId, role? }
 *
 * Owners only: the roster decides who can see and change the tenant's data, so
 * granting a role is itself an owner-level act.
 *
 * Idempotent by design: `(organization_id, user_id)` is the primary key, so
 * adding a member who is already on the roster changes their role instead of
 * failing. The organization always comes from the path — an `organizationId`
 * in the body is ignored rather than allowed to target another tenant.
 */
export async function PUT(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requireOrgRole(route.id, ADMIN);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = upsertMembershipSchema.safeParse({
    ...(typeof body.value === "object" && body.value !== null ? body.value : {}),
    organizationId: route.id,
  });
  if (!parsed.success) return validationError(parsed.error);

  const { organizationId, userId, role } = parsed.data;

  try {
    const member = await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, role },
      update: { role },
      include: { user: true },
    });

    return apiOk(serialize(member));
  } catch (error) {
    // P2003 here means the organization or the user does not exist.
    return writeConflictResponse(error, "Organization")
      ?? infrastructureError("memberships", error);
  }
}

/**
 * DELETE /api/organizations/:id/members
 * Body: { userId }
 *
 * Owners only. The user id travels in the body rather than the path because
 * membership is a composite key, not a resource with an id of its own.
 */
export async function DELETE(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requireOrgRole(route.id, ADMIN);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = removeMembershipSchema.safeParse({
    ...(typeof body.value === "object" && body.value !== null ? body.value : {}),
    organizationId: route.id,
  });
  if (!parsed.success) return validationError(parsed.error);

  const { organizationId, userId } = parsed.data;

  try {
    // Removing the last owner would leave the organization unadministrable.
    const [membership, ownerCount] = await prisma.$transaction([
      prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      }),
      prisma.organizationMember.count({
        where: { organizationId, role: "owner" },
      }),
    ]);

    if (!membership) return apiError(404, "This user is not a member of the organization.");

    if (membership.role === "owner" && ownerCount <= 1) {
      return apiError(409, "An organization must keep at least one owner.", {
        userId: ["This is the organization's only owner."],
      });
    }

    await prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Membership")
      ?? infrastructureError("memberships", error);
  }
}
