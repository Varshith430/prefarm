-- Lets a buyer take back a bid the seller has not answered yet.
--
-- A fourth value rather than reusing 'rejected': that word means the seller
-- said no, and a buyer changing their mind is a different event that both
-- sides need to be able to tell apart afterwards.
--
-- The partial unique index (offers_one_pending_per_buyer_idx) is scoped to
-- 'pending', so a withdrawn offer does not block the buyer from bidding again.
ALTER TYPE offer_status ADD VALUE IF NOT EXISTS 'withdrawn';
