# Restricted staging SQL role preparation
Prepared only. No Cloud SQL execution. Separate initializer/runtime passwords are generated in memory, persisted to distinct fixed staging secrets before SQL creation, and never displayed. Bootstrap secret version1 goes only into a psql child environment, not argv/files. PostgreSQL receives SCRAM verifier. Process environments and SQL audit logs still require appropriate operator security.

Run `python3 test_roles.py` for five no-network tests.

Before live role setup, run `python3 rehearse-nonsuperuser.py --synthetic-postgres` against ONLY fresh disposable PostgreSQL16 on 127.0.0.1:55439, database prospectpilot_test, postgres password synthetic-ci-only. It creates random test-only operator/init/runtime roles and DB, proves actual nonsuperuser CREATEDB/CREATEROLE behavior and SCRAM logins, tests temporary initializer SET membership cleanup on success and CREATE DATABASE failure, and deletes its own fixture. Never target Cloud SQL. It calls the same ownership helper as the live operator.

Live script requires both successful proof attestations:
- STAGING_NATIVE_ROLE_PROOF_COMMIT=89b18830e039a83b78bd427ddd01a33c2f9e242c
- STAGING_NON_SUPERUSER_ROLE_PROOF=pg16-nonsuperuser-v1
- STAGING_CONFIRMED_PROXY_TARGET=prospectpilot-stg-261118:us-central1:prospectpilot-stg-db

Attest only after actual exact-source native results and independent review. Dedicated approved Cloud SQL proxy must be bound 127.0.0.1:55438 to that exact instance. The script verifies Cloud API and SQL fresh-state inventory, but cannot cryptographically identify a local proxy from SQL alone. No parallel provisioning actors.

Fixed live names: DB prospectpilot_stg_app; SQL roles prospectpilot_stg_init and prospectpilot_stg_runtime; secrets prospectpilot-stg-initializer-password and prospectpilot-stg-runtime-password. Existing app DB/roles/secrets stop execution. Do not recreate/overwrite or blindly retry partial state.

Temporary ownership step grants initializer role to bootstrap postgres WITH SET TRUE, INHERIT FALSE, creates DB owned by initializer, then finally revokes only its own explicit GRANTED BY operator grant, verifies exact preexisting ADMIN-only baseline restoration and effective SET false. Runtime receives no role memberships. The automatically-created ADMIN-only membership from the bootstrap grantor is preserved. Preexisting SET/INHERIT or own-grant baseline is rejected. If cleanup fails, stop and inspect/revoke explicitly before proceeding. No runtime app grants, migrations, IAM, initialization or deployment happen here. #154 reviewed application grants remain a separate step after successful #152 initialization.

Before creating any secrets, verify runtime service account has no inherited project-wide Secret Accessor. Give it access only to its dedicated runtime password, never bootstrap/initializer password. Do not broaden Cloud SQL roles if the non-superuser proof or actual Cloud SQL capabilities fail.
