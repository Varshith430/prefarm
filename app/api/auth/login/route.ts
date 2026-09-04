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
import { consume, peek, reset } from "@/lib/rate-limit";
import { serialize } from "@/lib/serialize";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Five failures per address per hour; the sixth is refused. */
const MAX_FAILURES = 5;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Attempts are counted per email address rather than per IP, because the
 * people using this share addresses: mobile networks put whole regions behind
 * a handful of carrier-grade NAT addresses, so an IP limit would lock out a
 * village to slow one attacker.
 *
 * The trade-off is that someone who knows an address can lock its owner out
 * for an hour by failing five times. That is the accepted cost here; the fix
 * if it becomes a problem is a second, much looser IP limit alongside this
 * one, or a challenge after the first few failures — not swapping the key.
 */
function rateLimitKey(email: string): string {
  return `login:${email}`;
}

function tooManyAttempts(retryAfterSeconds: number): Response {
  return Response.json(
    {
      ok: false,
      error: "Too many sign-in attempts. Try again later.",
    },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfterSeconds),
        "cache-control": "no-store",
      },
    },
  );
}

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
  const key = rateLimitKey(email);

  // Checked before any database or hashing work: a caller who is already over
  // the limit should cost nothing to refuse.
  //
  // Note this counts failures for addresses that have no account too. Limiting
  // only real accounts would turn the 429 itself into an oracle — "this one is
  // rate-limited, so it exists".
  const before = peek(key, MAX_FAILURES, WINDOW_MS);
  if (before.limited) {
    return tooManyAttempts(before.retryAfterSeconds);
  }

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
      const after = consume(key, MAX_FAILURES, WINDOW_MS);

      // The fifth failure is still answered as a wrong password — it is the
      // sixth attempt that is refused. This branch catches the narrower case
      // of requests racing each other past the check above, where a later one
      // finds the window already full by the time it records its own failure.
      return after.limited
        ? tooManyAttempts(after.retryAfterSeconds)
        : apiError(401, "Incorrect email or password.");
    }

    // A successful sign-in clears the history: the failures were someone
    // mistyping, not an attack.
    reset(key);

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
