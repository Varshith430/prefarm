-- Adds organization classification and a free-text description.
-- Enum values stay lowercase to match the nine enums already in schema.sql.

CREATE TYPE organization_type AS ENUM (
    'farm',
    'cooperative',
    'buyer',
    'processor',
    'distributor',
    'retailer',
    'input_supplier',
    'logistics',
    'service_provider'
);

ALTER TABLE organizations ADD COLUMN description TEXT;

-- The temporary default backfills any existing rows; it is dropped afterwards
-- so the column matches schema.sql, where it is NOT NULL with no default.
ALTER TABLE organizations
    ADD COLUMN organization_type organization_type NOT NULL DEFAULT 'farm';

ALTER TABLE organizations ALTER COLUMN organization_type DROP DEFAULT;

CREATE INDEX organizations_type_idx ON organizations(organization_type);
