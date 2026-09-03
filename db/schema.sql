-- AgriTech platform database schema
-- Target: PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE organization_type AS ENUM (
    'farm', 'cooperative', 'buyer', 'processor', 'distributor',
    'retailer', 'input_supplier', 'logistics', 'service_provider'
);
CREATE TYPE membership_role AS ENUM ('owner', 'manager', 'operator', 'viewer');
CREATE TYPE farm_status AS ENUM ('active', 'archived');
CREATE TYPE field_status AS ENUM ('active', 'fallow', 'archived');
CREATE TYPE crop_cycle_status AS ENUM ('planned', 'growing', 'harvested', 'cancelled');
CREATE TYPE sensor_type AS ENUM ('soil_moisture', 'temperature', 'humidity', 'ph', 'rainfall', 'light');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE movement_type AS ENUM ('purchase', 'usage', 'adjustment', 'transfer');
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'sold', 'archived');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    organization_type organization_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    -- NULL means the account has no password yet and cannot be signed into.
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-side sessions, so a sign-in can be revoked. `token_hash` is a SHA-256
-- of the session token; the token itself is never stored.
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

CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role membership_role NOT NULL DEFAULT 'viewer',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    area_hectares NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (area_hectares >= 0),
    status farm_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE TABLE fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    area_hectares NUMERIC(12, 3) NOT NULL CHECK (area_hectares > 0),
    soil_type TEXT,
    status field_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (farm_id, name)
);

CREATE TABLE crops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    variety TEXT,
    typical_days_to_harvest INTEGER CHECK (typical_days_to_harvest > 0),
    UNIQUE (organization_id, name, variety)
);

CREATE TABLE crop_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE RESTRICT,
    season TEXT NOT NULL,
    planted_on DATE,
    expected_harvest_on DATE,
    harvested_on DATE,
    status crop_cycle_status NOT NULL DEFAULT 'planned',
    expected_yield_kg NUMERIC(14, 2) CHECK (expected_yield_kg >= 0),
    actual_yield_kg NUMERIC(14, 2) CHECK (actual_yield_kg >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expected_harvest_on IS NULL OR planted_on IS NULL OR expected_harvest_on >= planted_on),
    CHECK (harvested_on IS NULL OR planted_on IS NULL OR harvested_on >= planted_on)
);

CREATE TABLE sensors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sensor_type sensor_type NOT NULL,
    unit TEXT NOT NULL,
    external_id TEXT,
    installed_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (field_id, name),
    UNIQUE (external_id)
);

CREATE TABLE sensor_readings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    value NUMERIC(14, 5) NOT NULL,
    UNIQUE (sensor_id, recorded_at)
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    field_id UUID REFERENCES fields(id) ON DELETE CASCADE,
    crop_cycle_id UUID REFERENCES crop_cycles(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_at TIMESTAMPTZ,
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'normal',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (completed_at IS NULL OR status = 'done')
);

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    movement_type movement_type NOT NULL,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference TEXT,
    notes TEXT
);

CREATE TABLE marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    crop_cycle_id UUID REFERENCES crop_cycles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    quantity_kg NUMERIC(14, 2) NOT NULL CHECK (quantity_kg > 0),
    price_per_kg NUMERIC(12, 2) NOT NULL CHECK (price_per_kg >= 0),
    available_from DATE,
    status listing_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Offers are made by an organization, not a person: the whole buying side
-- needs to see them, and every authorization check resolves an owning
-- organization. `buyer_id` records who placed it and is nulled when that
-- person leaves, so the offer outlives them.
CREATE TABLE offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    buyer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Denominated in the listing's unit (kilograms), with the precision and
    -- scale of marketplace_listings.price_per_kg and quantity_kg.
    price_per_unit NUMERIC(12, 2) NOT NULL CHECK (price_per_unit >= 0),
    quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
    status offer_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organizations_type_idx ON organizations(organization_type);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX fields_farm_id_idx ON fields(farm_id);
CREATE INDEX crop_cycles_field_id_idx ON crop_cycles(field_id);
CREATE INDEX crop_cycles_status_idx ON crop_cycles(status);
CREATE INDEX sensors_field_id_idx ON sensors(field_id);
CREATE INDEX sensor_readings_sensor_recorded_idx ON sensor_readings(sensor_id, recorded_at DESC);
CREATE INDEX tasks_organization_status_idx ON tasks(organization_id, status);
CREATE INDEX tasks_due_at_idx ON tasks(due_at);
CREATE INDEX inventory_movements_item_occurred_idx ON inventory_movements(inventory_item_id, occurred_at DESC);
CREATE INDEX marketplace_listings_status_idx ON marketplace_listings(status);
CREATE INDEX offers_listing_created_idx ON offers(listing_id, created_at DESC);
CREATE INDEX offers_buyer_organization_idx ON offers(buyer_organization_id);
CREATE INDEX offers_status_idx ON offers(status);

-- One live offer per buyer per listing: a better bid replaces the standing
-- one, but a buyer whose offer was rejected may make a new one.
CREATE UNIQUE INDEX offers_one_pending_per_buyer_idx
    ON offers(listing_id, buyer_organization_id)
    WHERE status = 'pending';

-- Keep updated_at consistent for entities edited over time.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER farms_set_updated_at
BEFORE UPDATE ON farms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER marketplace_listings_set_updated_at
BEFORE UPDATE ON marketplace_listings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER offers_set_updated_at
BEFORE UPDATE ON offers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
