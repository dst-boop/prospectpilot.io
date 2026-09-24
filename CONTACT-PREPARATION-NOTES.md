# Contact preparation and ZoomInfo imports

The contact workspace now offers **Prepare contact** as an action. It checks the email domain, applies existing suppression and calling restrictions, saves a professional source brief, and prepares conversation questions and a neutral introduction when the available data permits. It does not send messages or independently verify identity, employment, mailbox ownership, or permission to contact.

ZoomInfo imports preserve provider IDs, accuracy scores, dates, and route-specific DNC flags. Unsupported phone values are retained in source history and excluded from active phone fields instead of rejecting an otherwise usable contact. Conflicting identities remain separate review items. Later imports cannot silently clear a DNC flag.

Preparation uses revision checks before and after the domain lookup so a late result cannot overwrite a correction or suppression. Saved briefs become stale when the contact changes.

The supplied cold-prospecting presentation informed preparation and discovery questions. The implementation does not infer age, wealth, account ownership, or outreach permission from professional data.

Validation: 225 tests passed, zero failed, one real-Postgres integration test skipped without its database configuration. The build and local browser workflow passed. A local validation of the supplied 112-row export accepted 111 records, retained one identity conflict for review, and rejected no rows for phone formatting. The source file was unchanged. No production import or outreach was performed.
