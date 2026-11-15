-- Add a separately reviewed research signal; no qualification values are changed.
ALTER TABLE lab_observations DROP CONSTRAINT IF EXISTS lab_observations_field_check;
ALTER TABLE lab_observations ADD CONSTRAINT lab_observations_field_check
CHECK(field IN ('age','residence','retirement','contact','net_worth','movable_assets','personal_event'));
