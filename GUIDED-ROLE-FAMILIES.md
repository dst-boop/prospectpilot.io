# Optional role-family proposal

Based on the #163 guide-clarity candidate (local 18fa37b, tree 4699307123df3bcc55dafad94151a7f179102e22). No provider connection, search, export, production change or paid usage.

The workplace recipe now offers an optional starting-group selector: office (Accounting, Human Resources, Information Technology), hands-on (Construction, Facilities Management), or all suggestions for Both. Nothing is preselected. A deliberate choice adds one proposed job-function criterion. This is an example group, not an exhaustive classification, seniority restriction or evidence of an old retirement plan. Existing manual titles and optional small-employer size remain intact. Changing audience/occupation clears the suggestion; unsupported/hidden values cannot create filters.

Location guidance requests supported city/state or ZIP/radius inputs without inventing region matches or county boundaries. Office location and headquarters are distinguished from residence. No field is transformed into an API identifier or a claimed executable Boolean query.

## Evidence
- Official GTM One category label: https://gtm.ai/docs/gtm-one/advanced-search/overview-of-the-filters-available-in-advanced-search
- November 18 free reference lookup returned the proposed job-function names. Those connector results do not verify actual-account UI menus or text-paste behavior. Long Island metro lookup returned no matches; no provider region ID is invented.
- Current user's edition, entitlements, actual filter acceptance and cohort quality remain unverified.

## Validation
- Focused model/client/auth/image tests: 56 passed, no failures/skips.
- Python: 8 passed. Build, JS syntax and diff checks passed. Unrelated generated login bundle churn was removed.
- Independent source review and re-review passed, including independently rerunning 56 focused tests.
- Synthetic browser runner now covers explicit Accounting selection/copy, occupation reset, Keep broad, and workplace mobile screenshots. Local execution was blocked by missing Chromium executable. Browser/visual results must not be claimed passed.
- Full-suite result is tracked separately by the coordinating task. This document does not claim final release readiness.

Fictional staging restrictions remain applied to copied/downloaded text. No rollout until the reviewed candidate passes applicable exact-head CI, browser/visual/staging and existing release gates.
