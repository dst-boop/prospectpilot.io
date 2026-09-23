# Advisor workflow — September 12, 2026

This release turns the home page into a daily worklist and retains the newer contact directory, source integrations, account access and research fixes from `codex/contact-workspace` at `9b1f892`.

## A useful daily flow

1. Open ProspectPilot. Start with **Follow-ups due**; the next-action list sorts due dates before evidence completeness.
2. Open a prospect. The brief explains its priority, saved notes, and missing evidence. Contact shortcuts appear only for a current reviewed route; restricted and ambiguous records do not expose a shortcut.
3. Record **No answer**, **Connected**, **Follow-up agreed**, **Meeting booked**, **Not interested**, or **Do not contact**. Save an agreed time in your local timezone. This updates the existing lead follow-up fields and appends an activity record. No outreach or calendar invitations are sent.
4. Use **Choose directory contacts** to select up to 100 existing professional contacts and add them to the worklist. Qualification remains unverified; suppressed contacts are omitted. No export/re-upload step is needed.
5. Select prospects missing contact details and export the provider-matching CSV. It includes professional identifiers and the next research task. Import the returned provider file through the existing import workflow; no provider subscription is bundled or purchased.
6. Expand **Discover prospects & measure source performance** when more prospects are needed. Research schedules, budgets, source results, qualification criteria and cost accounting remain available.

## Evidence and outcomes

Initial-conversation status requires reviewed age, US residence and contact evidence. It is not full qualification: retirement and net-worth gaps remain explicit. The current five-criterion rules are preserved. Logged conversations and unique people with meetings are retrospective manual records, not automatic dial counts, proven conversion lift, or future yield forecasts.

Follow-up notes and dates use the existing research lead fields, so they remain visible in older lead-management screens. Contact-directory links honor directory suppression in worklist/detail views; marking a linked research record Do not contact suppresses the directory contact too. Reopening research cannot clear suppression. Other directory edits are brought across by adding the contact again; this is not a complete bidirectional CRM sync.

Activity writes enforce lead access, use a transaction and idempotency key, and reject stale workflow signatures. Deleting a lead removes its activity/link records. The worklist calculates current evidence for a bounded working set of 2,000 records and discloses when more records exist; search narrows that set.

## Deployment

This session verified that production is serving `review-20260910125624-2012`, with the professional contact workspace. This new advisor workflow has **not** been deployed from this session. Google Cloud browser access timed out, and authenticated local Cloud tooling was unavailable. The local browser also could not open the loopback preview. Do not interpret source publication or passing tests as live deployment or visual browser verification.

Use the established Cloud Shell environment with access to `lead-qualifier-505002`:

```bash
git clone --branch codex/advisor-workspace https://github.com/dst-boop/prospectpilot.io.git prospectpilot-advisor-workspace
cd prospectpilot-advisor-workspace
bash release.sh
```

Migration **013** is additive; the existing runner applies earlier pending migrations first. The script preserves the established service configuration and verifies `advisor_workspace_version=advisor-workflow-1` and the exact new release identifier through the custom domain. Catalog reingestion is not required for this interface/workflow release.

Functional validation covers ordering, live evidence expiry, persistence, duplicate saves, stale updates, ownership boundaries, suppression across linked workspaces, CSV escaping, migration replay and existing application regressions. Browser layout verification and actual production yield remain outstanding.
