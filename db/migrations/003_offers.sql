-- Buyers' offers against marketplace listings.
--
-- Enum values stay lowercase to match the ten enums already in schema.sql,
-- which is also what the Zod schemas and the generated Prisma client expect.
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,

    -- An offer is made BY an organization, not by a person: the whole buying
    -- side needs to see and act on it, and every authorization check in the
    -- API resolves an owning organization. `buyer_id` records which member
    -- actually placed it, and is nulled rather than cascaded when they leave,
    -- so the offer survives the person — the same rule as tasks.assigned_to
    -- and inventory_movements.recorded_by.
    buyer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Denominated in the listing's unit, which is kilograms throughout: the
    -- precision and scale match marketplace_listings.price_per_kg and
    -- quantity_kg so an offer can be compared with the asking price without
    -- rounding. Zero is allowed on price (a giveaway) but not on quantity.
    price_per_unit NUMERIC(12, 2) NOT NULL CHECK (price_per_unit >= 0),
    quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),

    status offer_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The seller's view: every offer on one listing, newest first.
CREATE INDEX offers_listing_created_idx ON offers(listing_id, created_at DESC);

-- The buyer's view: everything this organization has bid on.
CREATE INDEX offers_buyer_organization_idx ON offers(buyer_organization_id);

CREATE INDEX offers_status_idx ON offers(status);

-- One live offer per buyer per listing. Improving a bid should replace the
-- standing one rather than add a second, but a buyer whose offer was rejected
-- is free to make a new one — which is why this is partial on 'pending'
-- instead of a plain UNIQUE constraint.
CREATE UNIQUE INDEX offers_one_pending_per_buyer_idx
    ON offers(listing_id, buyer_organization_id)
    WHERE status = 'pending';

CREATE TRIGGER offers_set_updated_at
BEFORE UPDATE ON offers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
