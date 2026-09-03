-- Password credentials and server-side sessions.
--
-- `password_hash` is nullable: users created through POST /api/users (an
-- invite, or an import) have no credential until they set one, and a NULL hash
-- means "cannot sign in with a password" rather than "any password works".

ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Sessions are stored server-side so they can be revoked. The column holds a
-- SHA-256 of the session token, never the token itself: a leaked database
-- backup then does not hand over live sessions. A fast hash is right here —
-- the token is 256 bits of CSPRNG output, so there is nothing to brute-force
-- and nothing for a slow KDF to protect.
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);

-- Supports both the expiry check on every request and the sweep of dead rows.
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
