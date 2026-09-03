import {
  apiError,
  apiOk,
  infrastructureError,
  readJsonBody,
  validationError,
} from "@/lib/api";
import {
  createSession,
  hashPassword,
  needsRehash,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * A wrong password and an unknown address give the same 401 and take the same
 * time — `verifyPassword` runs a full derivation against a dummy hash when
 * there is no account — so this endpoint cannot be used to find out who has
 * signed up.
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { email, password } = parsed.data;

  try {
    // `passwordHash` is omitted from queries by default; this is the one place
    // that asks for it back. Memberships are deliberately NOT joined here: the
    // failing path would then do more database work for an address that exists
    // than for one that does not, which is the timing signal the dummy hash in
    // `verifyPassword` exists to suppress. They are loaded after the check.
    const user = await prisma.user.findUnique({
      where: { email },
      omit: { passwordHash: false },
    });

    const valid = await verifyPassword(password, user?.passwordHash ?? null);

    if (!user || !valid) {
      return apiError(401, "Incorrect email or password.");
    }

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      select: { organizationId: true, role: true },
    });

    // A successful sign-in is the only moment the plaintext is available, so
    // it is also when a hash made under weaker parameters can be upgraded.
    if (needsRehash(user.passwordHash)) {
      const upgraded = await hashPassword(password);
      await prisma.user
        .update({ where: { id: user.id }, data: { passwordHash: upgraded } })
        .catch(() => {
          // The sign-in still succeeded; the rehash can happen next time.
        });
    }

    const session = await createSession(user.id, request.headers.get("user-agent"));
    await setSessionCookie(session);

    // Built field by field rather than by stripping keys, so `passwordHash`
    // cannot reach the response by being forgotten in a spread.
    return apiOk({
      user: serialize({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }),
      memberships,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    return infrastructureError("auth-login", error);
  }
}
