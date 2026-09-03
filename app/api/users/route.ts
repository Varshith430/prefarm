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
  requireOwnerSomewhere,
  requireUser,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createUserSchema, userQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/users
 * Body: { email, fullName, phone? }
 *
 * This creates a platform user record with no password, which is how a
 * colleague is added before they set one for themselves — self-service sign-up
 * goes through POST /api/auth/register instead. Restricted to organization
 * owners, since it writes to the shared user table; granting the new account
 * access to anything is a separate step through
 * PUT /api/organizations/:id/members.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const allowed = requireOwnerSomewhere(auth.session);
  if (!allowed.ok) return allowed.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createUserSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { email, fullName, phone } = parsed.data;

  try {
    const user = await prisma.user.create({
      data: { email, fullName, phone: phone ?? null },
    });

    return apiCreated(serialize(user), `/api/users/${user.id}`);
  } catch (error) {
    // Unique violation — only `email` is unique on this table.
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return apiError(409, "A user with this email already exists.", {
        email: ["Already registered."],
      });
    }
    return infrastructureError("users", error);
  }
}

/**
 * GET /api/users?organizationId=&search=&limit=&offset=
 *
 * This is a colleague directory, not a platform-wide user list: it only
 * returns people who share an organization with the caller. `organizationId`
 * narrows to one of those organizations; `search` matches full name or email
 * case-insensitively.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = userQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, search } = parsed.data;

  const scope = scopeToMemberships(auth.session, parsed.data.organizationId);
  if (!scope.ok) return scope.response;

  const where = {
    memberships: { some: scope.where },
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return apiOk(serialize(users), {
      pagination: paginationMeta(limit, offset, users.length, total),
    });
  } catch (error) {
    return infrastructureError("users", error);
  }
}
