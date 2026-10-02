-- Preserve legacy net-worth observations; never convert them to account balances.
-- The new criterion lives in lab_observations and inherits its owner isolation
-- and existing forget-person deletion coverage. No qualification is reset here.
ALTER TABLE lab_observations DROP CONSTRAINT IF EXISTS lab_observations_field_check;
ALTER TABLE lab_observations ADD CONSTRAINT lab_observations_field_check
  CHECK(field IN ('age','residence','retirement','contact','net_worth','movable_assets'));
