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
  requireUser,
  revokeUserSessions,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password
 * Body: { currentPassword, newPassword, revokeOtherSessions? }
 *
 * Changing a password rotates the caller's own session as well, so the token
 * that was live while the old password was in force stops working. Other
 * devices are signed out too unless `revokeOtherSessions` is false — a
 * password change is what someone does when they think it has been seen.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = changePasswordSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { currentPassword, newPassword, revokeOtherSessions } = parsed.data;
  const userId = auth.session.user.id;

  try {
    // Selecting `passwordHash` explicitly overrides the client-wide omit;
    // `select` and `omit` cannot both be given on one query.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) return apiError(401, "Sign in to continue.");

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return apiError(403, "Your current password is incorrect.", {
        currentPassword: ["Incorrect."],
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Every session is dropped, including this request's, and a fresh one is
    // issued — so the caller stays signed in on this device and nowhere else.
    const revoked = await revokeUserSessions(
      userId,
      revokeOtherSessions ? undefined : auth.session.sessionId,
    );

    let signedOutElsewhere = revoked;

    if (revokeOtherSessions) {
      const session = await createSession(userId, request.headers.get("user-agent"));
      await setSessionCookie(session);
      // The caller's own session was among those revoked; it is not "elsewhere".
      signedOutElsewhere = Math.max(revoked - 1, 0);
    }

    return apiOk({ changed: true, signedOutElsewhere });
  } catch (error) {
    return infrastructureError("auth-password", error);
  }
}
