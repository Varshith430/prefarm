import { MembershipRole } from "@/app/generated/prisma/enums";
import {
  apiError,
  infrastructureError,
  isPrismaKnownError,
  readJsonBody,
  validationError,
} from "@/lib/api";
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { availableSlug, slugify } from "@/lib/slug";
import { registerSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register
 * Body: { email, fullName, password, phone?, organization?: { name, organizationType } }
 *
 * Creates the account and signs it in, returning a session cookie. When an
 * `organization` is included it is created in the same transaction and the new
 * user becomes its owner, so signing up to run your own farm is one request
 * rather than three.
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = registerSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { email, fullName, password, phone, organization } = parsed.data;

  // Hashing is deliberately slow, so it happens before the transaction is
  // opened rather than holding a connection for the duration.
  const passwordHash = await hashPassword(password);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, fullName, phone: phone ?? null, passwordHash },
      });

      if (!organization) return { user, organization: null };

      // The slug is derived from the name; a collision takes a short random
      // suffix rather than failing a sign-up the caller cannot fix.
      const slug = await availableSlug(
        slugify(organization.name) || "org",
        async (candidate) =>
          (await tx.organization.findUnique({
            where: { slug: candidate },
            select: { id: true },
          })) !== null,
      );

      if (!slug) throw new Error("Could not find a free slug for the organization.");

      const record = await tx.organization.create({
        data: {
          name: organization.name,
          slug,
          organizationType: organization.organizationType,
          members: { create: { userId: user.id, role: MembershipRole.owner } },
        },
      });

      return { user, organization: record };
    });

    const session = await createSession(
      created.user.id,
      request.headers.get("user-agent"),
    );
    await setSessionCookie(session);

    return Response.json(
      {
        ok: true,
        data: {
          user: serialize(created.user),
          organization: created.organization ? serialize(created.organization) : null,
        },
      },
      { status: 201, headers: { location: `/api/users/${created.user.id}` } },
    );
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      // Only `email` and `slug` are unique here, and the slug is retried above.
      return apiError(409, "An account with this email already exists.", {
        email: ["Already registered."],
      });
    }
    return infrastructureError("auth-register", error);
  }
}
