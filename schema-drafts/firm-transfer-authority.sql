-- ISOLATED DRAFT. Apply only after firm-preview-boundary.sql in a disposable
-- database. Not registered in migrate.mjs, not deployed, no enrollment/backfill.
-- These facts require an authorized provisioning/control-plane writer. This
-- ledger cannot verify Firebase revocation or provider contracts by itself.
ALTER TABLE firm_workspaces ADD COLUMN incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE firm_workspaces ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE firm_members ADD COLUMN incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE firm_members ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE firm_contact_assignments ADD COLUMN incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE firm_contact_assignments ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE firm_list_assignments ADD COLUMN incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE firm_list_assignments ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE firm_lead_assignments ADD COLUMN incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE firm_lead_assignments ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version>0);
CREATE FUNCTION firm_authority_bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.incarnation := gen_random_uuid()::text; NEW.version := 1;
 ELSE NEW.incarnation := OLD.incarnation; NEW.version := OLD.version + 1; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER firm_workspace_version BEFORE INSERT OR UPDATE ON firm_workspaces FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();
CREATE TRIGGER firm_member_version BEFORE INSERT OR UPDATE ON firm_members FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();
CREATE TRIGGER firm_contact_version BEFORE INSERT OR UPDATE ON firm_contact_assignments FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();
CREATE TRIGGER firm_list_version BEFORE INSERT OR UPDATE ON firm_list_assignments FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();
CREATE TRIGGER firm_lead_version BEFORE INSERT OR UPDATE ON firm_lead_assignments FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();

CREATE TABLE firm_transfer_fences (
 firm_id TEXT NOT NULL, source_uid TEXT NOT NULL, target_uid TEXT NOT NULL,
 source_fenced BOOLEAN NOT NULL DEFAULT false, sessions_revoked BOOLEAN NOT NULL DEFAULT false,
 workers_fenced BOOLEAN NOT NULL DEFAULT false, target_active BOOLEAN NOT NULL DEFAULT false,
 target_email_verified BOOLEAN NOT NULL DEFAULT false,
 evidence_digest TEXT NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
 reviewed_by TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text, version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(firm_id,source_uid,target_uid), CHECK(source_uid<>target_uid),
 FOREIGN KEY(firm_id,source_uid) REFERENCES firm_members(firm_id,user_id),
 FOREIGN KEY(firm_id,target_uid) REFERENCES firm_members(firm_id,user_id),
 FOREIGN KEY(firm_id,reviewed_by) REFERENCES firm_members(firm_id,user_id)
);
CREATE TRIGGER firm_fence_version BEFORE INSERT OR UPDATE ON firm_transfer_fences FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();
CREATE TABLE firm_transfer_rights (
 firm_id TEXT NOT NULL, record_kind TEXT NOT NULL CHECK(record_kind IN ('contact','list','lead')), record_id TEXT NOT NULL,
 source_uid TEXT NOT NULL,target_uid TEXT NOT NULL,decision TEXT NOT NULL DEFAULT 'review' CHECK(decision IN ('allowed','denied','review')),
 reference_digest TEXT NOT NULL CHECK(reference_digest ~ '^[a-f0-9]{64}$'),reviewed_by TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,incarnation TEXT NOT NULL DEFAULT gen_random_uuid()::text,version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(firm_id,record_kind,record_id,source_uid,target_uid), CHECK(source_uid<>target_uid),
 FOREIGN KEY(firm_id,source_uid) REFERENCES firm_members(firm_id,user_id),
 FOREIGN KEY(firm_id,target_uid) REFERENCES firm_members(firm_id,user_id),
 FOREIGN KEY(firm_id,reviewed_by) REFERENCES firm_members(firm_id,user_id)
);
CREATE TRIGGER firm_rights_version BEFORE INSERT OR UPDATE ON firm_transfer_rights FOR EACH ROW EXECUTE FUNCTION firm_authority_bump_version();
CREATE TABLE firm_transfer_receipts (
 firm_id TEXT NOT NULL,actor_uid TEXT NOT NULL,idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 receipt JSONB NOT NULL CHECK(jsonb_typeof(receipt)='object'),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(firm_id,actor_uid,idempotency_key),
 FOREIGN KEY(firm_id,actor_uid) REFERENCES firm_members(firm_id,user_id),
 CHECK(receipt ?& ARRAY['firmId','actorUid','idempotencyKey']),
 CHECK((jsonb_typeof(receipt->'firmId')='string' AND jsonb_typeof(receipt->'actorUid')='string' AND jsonb_typeof(receipt->'idempotencyKey')='string'
   AND receipt->>'firmId'=firm_id AND receipt->>'actorUid'=actor_uid AND receipt->>'idempotencyKey'=idempotency_key) IS TRUE)
);
CREATE FUNCTION firm_receipts_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Transfer receipts are append only' USING ERRCODE='55000'; END $$;
CREATE TRIGGER firm_receipts_no_update_delete BEFORE UPDATE OR DELETE ON firm_transfer_receipts FOR EACH ROW EXECUTE FUNCTION firm_receipts_immutable();
CREATE TRIGGER firm_receipts_no_truncate BEFORE TRUNCATE ON firm_transfer_receipts FOR EACH STATEMENT EXECUTE FUNCTION firm_receipts_immutable();
