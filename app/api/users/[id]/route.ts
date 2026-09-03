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
import { organizationIdsFor, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { updateUserSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id — the user plus the organizations they belong to.
 *
 * Readable by the user themselves, and by anyone who shares an organization
 * with them. Someone outside gets 404 rather than 403: user ids are not
 * tenant-scoped, so confirming that one exists would leak the platform's
 * membership to anybody who can guess a UUID.
 *
 * The organizations listed are narrowed to those the caller can see, so this
 * cannot be used to map out which other tenants a colleague works for.
 */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "User");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const visibleOrgs = organizationIdsFor(auth.session);
  const isSelf = route.id === auth.session.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: route.id },
      include: {
        memberships: {
          where: isSelf ? undefined : { organizationId: { in: visibleOrgs } },
          include: { organization: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!user) return notFoundError("User");

    // A stranger is indistinguishable from a nonexistent id.
    if (!isSelf && user.memberships.length === 0) return notFoundError("User");

    return apiOk(serialize(user));
  } catch (error) {
    return infrastructureError("users", error);
  }
}

/**
 * PATCH /api/users/:id — Body: any subset of { email, fullName, phone }
 *
 * Self only. An organization owner controls someone's role through the
 * membership endpoint, not their name, phone number, or sign-in address.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "User");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (route.id !== auth.session.user.id) {
    return apiError(403, "You can only change your own account.");
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateUserSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { email, fullName, phone } = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id: route.id },
      data: {
        ...(email !== undefined ? { email } : {}),
        ...(fullName !== undefined ? { fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
      },
    });

    return apiOk(serialize(user));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, "A user with this email already exists.", {
        email: ["Already registered."],
      });
    }
    return writeConflictResponse(error, "User") ?? infrastructureError("users", error);
  }
}

/**
 * DELETE /api/users/:id
 *
 * Self only — this closes your own account. Removing somebody else from an
 * organization is DELETE /api/organizations/:id/members, which takes away
 * their access without destroying the person's platform account.
 *
 * Memberships and sessions cascade away with the user. Tasks and inventory
 * movements do not: their `assigned_to` / `recorded_by` columns are set to
 * NULL, so the work history survives the person leaving.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "User");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (route.id !== auth.session.user.id) {
    return apiError(403, "You can only close your own account.");
  }

  try {
    await prisma.user.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "User") ?? infrastructureError("users", error);
  }
}
