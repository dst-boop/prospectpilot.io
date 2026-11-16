# Pilot outcome safety

This increment keeps an unsaved outcome/follow-up from being silently discarded
when an advisor closes the brief, presses Escape or opens another prospect.
A confirmation lets the advisor keep the draft or deliberately discard it.
A save in progress blocks those actions until the result is known. Successful
saves still close the brief and advance to the next prospect normally. Failed
saves retain the form. Edits restored to the original values are not dirty.

A browser navigation warning is best-effort; mobile OS termination, crashes and
some browser navigation paths may not fire it. Notes are not stored in local
storage or transmitted before Save. Evidence-review and edited message drafts
are outside this outcome-form guard; this is not a universal autosave facility.

Ready-state guidance and age background text now match advice-decision policy,
so they no longer instruct advisors to qualify prospects by age.

No database/schema/API change. Based on PR109; do not deploy this branch alone
over the current production version. Preserve the broader release gates.

Validation includes synthetic client state tests, the full application suite,
and a synthetic Chromium journey that cancels close/Escape, checks note
preservation, then saves the follow-up and checks server persistence. The browser
journey uses synthetic authentication and fictional records, not live accounts.
