import { apiError, apiOk, infrastructureError } from "@/lib/api";
import { getCurrentSession } from "@/lib/auth";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session
 *
 * The current user and the organizations they belong to, with their role in
 * each — what a client needs to decide what to render. 401 when signed out.
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return apiError(401, "Not signed in.");

    return apiOk({
      user: serialize(session.user),
      memberships: session.memberships,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    return infrastructureError("auth-session", error);
  }
}
