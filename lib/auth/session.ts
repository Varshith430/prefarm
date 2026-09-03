/**
 * Server-side sessions.
 *
 * A sign-in mints a 256-bit random token that is returned to the browser in an
 * httpOnly cookie. Only its SHA-256 is stored, so the `sessions` table cannot
 * be used to impersonate anyone if it leaks. Because the row is the source of
 * truth (unlike a self-contained JWT), a session can be revoked the moment a
 * password changes or a device is lost.
 */

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "agritech_session";

/** How long a new session lasts. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A session is extended, at most this often, while it is being used. Writing
 * on every request would put a row update in front of every authenticated
 * call; an hour of granularity costs nothing and keeps active users signed in.
 */
const REFRESH_AFTER_MS = 60 * 60 * 1000;

/** The token is high-entropy random, so a fast digest is the right primitive. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  /** The raw token. Returned once, at creation; never recoverable afterwards. */
  token: string;
  expiresAt: Date;
}

/** Creates a session row and returns the token to hand to the browser. */
export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<IssuedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: userAgent?.slice(0, 400) ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  /** The caller's role in each organization they belong to. */
  memberships: { organizationId: string; role: string }[];
  expiresAt: Date;
}

/**
 * Looks up a token and returns the signed-in user, or null when the token is
 * unknown or expired. Expired rows are deleted on sight rather than left for
 * the sweep, so a stale cookie cannot be replayed.
 */
export async function resolveSessionToken(
  token: string,
): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { memberships: { select: { organizationId: true, role: true } } } },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {
      // Already gone (a concurrent request cleaned it up) — nothing to undo.
    });
    return null;
  }

  // Sliding expiry: using the session keeps it alive, idling lets it lapse.
  if (Date.now() - session.lastUsedAt.getTime() > REFRESH_AFTER_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      })
      .catch(() => {
        // A refresh is an optimisation; failing it must not fail the request.
      });
  }

  const { user } = session;

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    memberships: user.memberships,
    expiresAt: session.expiresAt,
  };
}

/** Deletes one session by its token. Silent when the token is unknown. */
export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Revokes every session for a user, optionally sparing the current one. Called
 * after a password change: whoever knew the old password is signed out.
 */
export async function revokeUserSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
  });
  return count;
}

/** Housekeeping: clears sessions that have already lapsed. */
export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Cookie handling
// ---------------------------------------------------------------------------

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    // `lax` still sends the cookie on top-level navigation, so a link into the
    // app keeps the user signed in, while cross-site POSTs get nothing.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function setSessionCookie(session: IssuedSession): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", cookieOptions(new Date(0)));
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
