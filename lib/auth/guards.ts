/**
 * Authentication and authorization guards for route handlers.
 *
 * Each guard returns either the caller's session or a ready-made error
 * response, in the same `{ ok }` shape as the other route helpers, so a
 * handler starts with:
 *
 *     const auth = await requireUser();
 *     if (!auth.ok) return auth.response;
 */

import { MembershipRole } from "@/app/generated/prisma/enums";
import { apiError } from "@/lib/api";

import { readSessionCookie, resolveSessionToken, type ResolvedSession } from "./session";

/**
 * Privilege tiers used across the API. Callers name the tier rather than a
 * literal role, so the policy is stated once here instead of being spread
 * across thirty route handlers:
 *
 * - READ    — any member of the organization may look.
 * - WRITE   — create and update day-to-day records (tasks, crop cycles,
 *             readings, stock movements). Excludes `viewer`.
 * - MANAGE  — destructive or structural changes: deleting farms, fields,
 *             sensors, or listings, each of which cascades.
 * - ADMIN   — the organization itself: renaming it, changing the roster,
 *             deleting the tenant.
 */
export const READ = MembershipRole.viewer;
export const WRITE = MembershipRole.operator;
export const MANAGE = MembershipRole.manager;
export const ADMIN = MembershipRole.owner;

/** Roles ordered from most to least privileged. */
export const ROLE_RANK: Record<MembershipRole, number> = {
  [MembershipRole.owner]: 3,
  [MembershipRole.manager]: 2,
  [MembershipRole.operator]: 1,
  [MembershipRole.viewer]: 0,
};

export type GuardResult =
  | { ok: true; session: ResolvedSession }
  | { ok: false; response: Response };

/**
 * Reads the session cookie and resolves it. Returns null rather than an error
 * for anonymous callers, so a handler can serve them differently.
 */
export async function getCurrentSession(): Promise<ResolvedSession | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  return resolveSessionToken(token);
}

/** 401 unless the request carries a valid session. */
export async function requireUser(): Promise<GuardResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, response: apiError(401, "Sign in to continue.") };
  }
  return { ok: true, session };
}

/** The caller's role in one organization, or null if they are not a member. */
export function roleIn(
  session: ResolvedSession,
  organizationId: string,
): MembershipRole | null {
  const membership = session.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  return (membership?.role as MembershipRole) ?? null;
}

/** Every organization the caller belongs to. */
export function organizationIdsFor(session: ResolvedSession): string[] {
  return session.memberships.map((membership) => membership.organizationId);
}

export type AuthorizationResult =
  | { ok: true }
  | { ok: false; response: Response };

/**
 * Checks a session against one organization. 403 when the caller is not a
 * member, or is a member without enough privilege.
 *
 * A non-member gets 403 rather than 404. These ids travel in request bodies,
 * so answering "not found" would hide nothing a caller could not already learn
 * by guessing, while making a legitimate permissions problem look like a bug.
 */
export function authorizeOrg(
  session: ResolvedSession,
  organizationId: string,
  minimumRole: MembershipRole = READ,
): AuthorizationResult {
  const role = roleIn(session, organizationId);

  if (!role) {
    return {
      ok: false,
      response: apiError(403, "You are not a member of this organization."),
    };
  }

  if (ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    return {
      ok: false,
      response: apiError(
        403,
        `This action requires the ${minimumRole} role; you have ${role}.`,
      ),
    };
  }

  return { ok: true };
}

/**
 * 401 when signed out, 403 when the caller lacks `minimumRole` in the given
 * organization. The one-shot form of `requireUser` followed by `authorizeOrg`.
 */
export async function requireOrgRole(
  organizationId: string,
  minimumRole: MembershipRole = READ,
): Promise<GuardResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const allowed = authorizeOrg(auth.session, organizationId, minimumRole);
  if (!allowed.ok) return allowed;

  return auth;
}

export type OrgTarget =
  | { ok: true; organizationId: string }
  | { ok: false; response: Response };

/**
 * Decides which organization a write is aimed at, and proves the caller may
 * write there.
 *
 * A request may still name an `organizationId` — a user can belong to several
 * tenants, so the session alone cannot say which one a new farm belongs to —
 * but it is never taken on trust: an id the caller is not a member of is a
 * 403, not a write. When the caller belongs to exactly one organization the
 * field can be left out entirely and that one is used, which is the common
 * case; a caller in several must say which, or the request is ambiguous.
 */
export function resolveOrganizationId(
  session: ResolvedSession,
  requested: string | null | undefined,
  minimumRole: MembershipRole = WRITE,
): OrgTarget {
  if (requested) {
    const allowed = authorizeOrg(session, requested, minimumRole);
    if (!allowed.ok) return allowed;
    return { ok: true, organizationId: requested };
  }

  const ids = organizationIdsFor(session);

  if (ids.length === 0) {
    return {
      ok: false,
      response: apiError(
        403,
        "You do not belong to an organization yet. Create one, or ask an owner to add you.",
      ),
    };
  }

  if (ids.length > 1) {
    return {
      ok: false,
      response: apiError(
        400,
        "You belong to more than one organization; name the one this applies to.",
        { organizationId: ["Required when you are a member of several organizations."] },
      ),
    };
  }

  const allowed = authorizeOrg(session, ids[0], minimumRole);
  if (!allowed.ok) return allowed;

  return { ok: true, organizationId: ids[0] };
}

/**
 * Narrows a list query to the organizations the caller may read: the one they
 * asked for, if they belong to it, or all of theirs when they asked for none.
 * Returns the `where` fragment to spread into the query.
 */
export function scopeToMemberships(
  session: ResolvedSession,
  requested: string | null | undefined,
): { ok: true; where: { organizationId: string | { in: string[] } } } | { ok: false; response: Response } {
  if (requested) {
    const allowed = authorizeOrg(session, requested, READ);
    if (!allowed.ok) return allowed;
    return { ok: true, where: { organizationId: requested } };
  }

  return { ok: true, where: { organizationId: { in: organizationIdsFor(session) } } };
}

/**
 * For actions that are not scoped to one tenant but must not be open to any
 * signed-in stranger — creating a platform user record, for instance. Requires
 * the caller to be an owner somewhere.
 */
export function requireOwnerSomewhere(session: ResolvedSession): AuthorizationResult {
  const isOwner = session.memberships.some(
    (membership) => membership.role === MembershipRole.owner,
  );

  if (!isOwner) {
    return {
      ok: false,
      response: apiError(403, "Only an organization owner may do this."),
    };
  }

  return { ok: true };
}
