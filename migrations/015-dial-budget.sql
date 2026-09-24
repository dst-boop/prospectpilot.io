-- The daily dial limit has to roll over in the advisor's own day. At UTC
-- midnight it would reset at 5pm on the west coast, handing one working
-- afternoon two budgets -- the opposite of what the limit is for.
--
-- Captured from the browser when the profile is saved rather than guessed from
-- a metro name, and defaulted to UTC so an unset profile still has a boundary.
ALTER TABLE advisor_profiles ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT 'UTC';
