-- Compute catalog totals once at migration/import time, not on dashboard refresh.
CREATE TABLE IF NOT EXISTS employer_plan_catalog_summary (
  id INTEGER PRIMARY KEY CHECK (id=1),
  plans INTEGER NOT NULL,
  filings INTEGER NOT NULL,
  latest_plan_year INTEGER,
  imported_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO employer_plan_catalog_summary(id,plans,filings,latest_plan_year,imported_at)
SELECT 1,count(DISTINCT (payload->>'ein',payload->>'plan_number'))::int,
  count(*)::int,max(plan_year),max(imported_at) FROM employer_plan_catalog
ON CONFLICT(id) DO UPDATE SET plans=EXCLUDED.plans,filings=EXCLUDED.filings,
  latest_plan_year=EXCLUDED.latest_plan_year,imported_at=EXCLUDED.imported_at,calculated_at=now();
