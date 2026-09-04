-- Per-device credentials for telemetry ingest.
--
-- Field gateways cannot hold a browser cookie, and giving one a person's login
-- would hand it that person's entire access. A sensor therefore carries its
-- own credential, scoped to exactly itself.
--
-- Only the SHA-256 of the token is stored, for the same reason as `sessions`:
-- a leaked database backup should not hand over the ability to inject
-- telemetry. The consequence is that the token is displayed once, when it is
-- issued, and cannot be recovered afterwards — a device that loses it is given
-- a new one through POST /api/sensors/:id/token, which keeps the sensor and
-- its reading history intact.
--
-- A fast digest is right here: the token is 128 bits of CSPRNG output, so
-- there is nothing to brute-force and nothing for a slow KDF to protect.
ALTER TABLE sensors ADD COLUMN device_token_hash TEXT UNIQUE;

-- When the current credential was issued, so an operator can tell a rotated
-- sensor from one still holding the token it was registered with.
ALTER TABLE sensors ADD COLUMN device_token_issued_at TIMESTAMPTZ;
