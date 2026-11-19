# Same-name plan sponsors: preserve filing identity

Synthetic reproduction on the #129 base: two filings named “Same Name Company”
with different reported EINs and separated-participant counts 15 and 40 produced
only the 40-count filing. The selector grouped by normalized sponsor name; the
research queue also deduplicated by name. No production data was inspected.

This change:
- Chooses a representative plan within reported EIN + normalized name, preserving
  distinct EIN candidates. Missing EINs remain separate filing candidates.
- Selects latest filing before eligibility filters. Incomplete plan identifiers
  cannot collapse unrelated records into a shared null plan identity.
- Keeps the requested per-plan ranking signal. Counts/assets are never summed.
- Computes same-name ambiguity before location/plan filters, so filtering to one
  mailing state does not establish an entity match.
- For ambiguous/incomplete names, queues one name-research task with a bounded
  list of selected filing candidates. It chooses no single plan/EIN/location and
  does not assign a supplied website to an unresolved entity. This avoids silently
  dropping candidates or buying duplicate identical name searches.
- Explicit-name fallbacks recheck name ambiguity independently of discovery
  filters. A capped evidence result remains unresolved rather than treated as
  proof of a unique entity. Fallback candidates may be outside the requested filters.
- Carries candidate identity keys through recent-research rotation. A recorded
  EIN does not suppress a different EIN. Legacy name-only history cannot identify
  which namesake was researched.
- Shows reported EINs in plan evidence and candidate-by-candidate context in run
  details. Name matches remain unconfirmed evidence, not person participation,
  individual balances, or corporate affiliation.

Limits: these are reported filing identities, not independently verified corporate
identities. Selected candidates are not a complete entity inventory; result limits
and filters still apply. Name-based sources may find people at namesake employers:
review their employer association before relying on any candidate filing. Existing
qualification and outreach-permission gates are unchanged. No migration, provider
configuration, merge, deployment, or production validation is included.
