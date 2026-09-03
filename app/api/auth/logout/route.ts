import { infrastructureError } from "@/lib/api";
import {
  clearSessionCookie,
  destroySessionByToken,
  readSessionCookie,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout
 *
 * Deletes the session row and clears the cookie. Always answers 204, whether
 * or not there was a session to end: signing out is not a question a caller
 * should get a different answer to depending on their state.
 */
export async function POST() {
  try {
    const token = await readSessionCookie();
    if (token) await destroySessionByToken(token);
    await clearSessionCookie();

    return new Response(null, { status: 204 });
  } catch (error) {
    return infrastructureError("auth-logout", error);
  }
}
