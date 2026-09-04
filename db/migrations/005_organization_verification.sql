-- Platform administration and organization verification.
--
-- Two columns, because verification needs somebody empowered to grant it:
-- `users.is_platform_admin` is the only privilege on the platform that is not
-- scoped to one tenant, and it is deliberately a column rather than a role in
-- `organization_members`, which can only ever describe membership of a single
-- organization.
--
-- IMPORTANT: this flag must never be settable through the user-facing update
-- endpoint. `updateUserSchema` accepts email, full name, and phone only; adding
-- it there would make platform administration self-service.
ALTER TABLE users ADD COLUMN is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- NULL means unverified, which is where every organization starts. A timestamp
-- rather than a boolean so the record says *when* it was granted; revoking is
-- setting it back to NULL.
ALTER TABLE organizations ADD COLUMN verified_at TIMESTAMPTZ;

-- Serves both directions: the admin queue (verified_at IS NULL) and the
-- marketplace filter (verified_at IS NOT NULL).
CREATE INDEX organizations_verified_at_idx ON organizations(verified_at);
