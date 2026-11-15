-- ISOLATED DRAFT: not registered in migrate.mjs or packaged for production.
-- Apply only to an empty disposable test database after the ordinary migrations.
-- No backfill, grants, role changes, legacy-table changes or automatic enrollment.
CREATE TABLE firm_workspaces (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 160 AND id = btrim(id)),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'suspended' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE firm_members (
  firm_id TEXT NOT NULL REFERENCES firm_workspaces(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL CHECK (length(user_id) BETWEEN 1 AND 160 AND user_id = btrim(user_id)),
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 160),
  role TEXT NOT NULL DEFAULT 'advisor' CHECK (role IN ('owner','supervisor','advisor')),
  status TEXT NOT NULL DEFAULT 'suspended' CHECK (status IN ('active','departed','suspended')),
  approved_by TEXT NOT NULL CHECK (length(btrim(approved_by)) BETWEEN 1 AND 160),
  approval_reference TEXT NOT NULL CHECK (length(btrim(approval_reference)) BETWEEN 1 AND 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (firm_id,user_id)
);
-- One resource belongs to at most one firm. Multi-firm membership does not make
-- a member's entire UID-owned inventory available to either firm.
CREATE TABLE firm_contact_assignments (
  contact_id TEXT PRIMARY KEY REFERENCES prospect_contacts(id) ON DELETE RESTRICT,
  firm_id TEXT NOT NULL,
  advisor_uid TEXT NOT NULL,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('firm_created','explicit_assignment')),
  rights_reference TEXT NOT NULL CHECK (length(btrim(rights_reference)) BETWEEN 1 AND 500),
  reviewed_by TEXT NOT NULL CHECK (length(btrim(reviewed_by)) BETWEEN 1 AND 160),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id,advisor_uid) REFERENCES firm_members(firm_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX firm_contact_assignments_advisor ON firm_contact_assignments(firm_id,advisor_uid,contact_id);
CREATE TABLE firm_list_assignments (
  list_id TEXT PRIMARY KEY REFERENCES prospect_lists(id) ON DELETE RESTRICT,
  firm_id TEXT NOT NULL,
  advisor_uid TEXT NOT NULL,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('firm_created','explicit_assignment')),
  rights_reference TEXT NOT NULL CHECK (length(btrim(rights_reference)) BETWEEN 1 AND 500),
  reviewed_by TEXT NOT NULL CHECK (length(btrim(reviewed_by)) BETWEEN 1 AND 160),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id,advisor_uid) REFERENCES firm_members(firm_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX firm_list_assignments_advisor ON firm_list_assignments(firm_id,advisor_uid,list_id);
CREATE TABLE firm_lead_assignments (
  lead_id TEXT PRIMARY KEY REFERENCES discovery_leads(id) ON DELETE RESTRICT,
  firm_id TEXT NOT NULL,
  advisor_uid TEXT NOT NULL,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('firm_created','explicit_assignment')),
  rights_reference TEXT NOT NULL CHECK (length(btrim(rights_reference)) BETWEEN 1 AND 500),
  reviewed_by TEXT NOT NULL CHECK (length(btrim(reviewed_by)) BETWEEN 1 AND 160),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id,advisor_uid) REFERENCES firm_members(firm_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX firm_lead_assignments_advisor ON firm_lead_assignments(firm_id,advisor_uid,lead_id);
