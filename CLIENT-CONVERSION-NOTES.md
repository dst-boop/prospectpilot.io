# Recording a client, and naming the rules a release is running

## The gap

The funnel ended at the second conversation. That measured whether the work
continued, never whether it arrived anywhere, and it left the one outcome every
touch before it was for unrecordable. It also capped what source economics could
say: with no conversion in the log, the cost of a source can be stated per lead
or per meeting and no further.

## Became a client

A new outcome, `became_client`, status **Client**.

- **Refused without a logged conversation.** The record must already hold
  `connected`, `follow_up`, `meeting_booked` or `meeting_held`. A touch that
  reached nobody is not a conversation, so a `no_answer` does not satisfy it.
  This keeps the strongest figure in the report tied to the work that produced
  it; a client marked on an untouched record would be measured against a funnel
  that skipped them.
- **Its own bucket.** Clients leave the worklist into a **Clients** view rather
  than the closed drawer holding disqualified and restricted people, so
  filtering "closed" does not show somebody their new clients beside the people
  who told them no. They are excluded from provider enrichment exports.
- **Not a contact restriction.** Nothing here suppresses the record. A client is
  a relationship; suppression is for people who may not be contacted.
- **Prospecting stops.** Touch outcomes are refused on a client until the record
  is explicitly reopened, so a client cannot spend dials and touches from a
  budget meant for prospects. `reopen` is the way back and already existed.
- **No follow-up date.** Terminal, like the other closing outcomes.
- **No migration.** The activity log stores the outcome as text, so this is a
  new value in a column that exists. No released database changes.

## Counted, not rated

The scoreboard gains `clients_recorded`: a count, scope `conversions`, **no
target**.

A rate was considered and rejected. A client who signs this month was very
likely met before the window opened, so dividing by the prospects added or met
inside it places an arrival over the wrong cohort and reads as a conversion rate
this application cannot measure. A target would have to come from the firm's own
history rather than from here.

Zero clients is a true zero — none were recorded — unlike the five rates, whose
empty denominators have to read as unmeasured. Conversions are counted once per
person however many times the outcome was logged, and dated by the log: the
record holds no separate signing date, and dating them by anything else would be
a guess presented as a measurement.

The scoreboard renderer previously printed `target` and whatever sat in the
field, and marked anything it could not compare as met. A figure with no target
now renders without one and claims nothing.

## The release gate could not see the pacing rules

`GET /version` reported `quality_version`, `advisor_workspace_version` and
`contact_workspace_version`. All three were already live before pacing shipped,
so a release carrying new cadence rules verified identically to the one it
replaced — only the opaque release identifier moved. `cadence_version` is now on
the endpoint and asserted by `release.sh`.

This does not change the release of `515422f`, which is queued and unaffected:
the gate applies to the release that carries this branch.

## Validation

281 application tests pass, zero fail, one real-PostgreSQL integration test
skipped without its database configured (277 before this work). `node build.mjs`
passes.

Verified end to end against the synthetic demo server over HTTP, not only in
unit tests: the outcome refused on a record with no conversation and again after
only a `no_answer`; accepted after `connected`; the prospect moved from `ready`
to `clients` with the worklist's `today` count falling and `closed` unchanged;
the record left unsuppressed with no follow-up date; a later prospecting touch
refused; `reopen` restoring the record to `ready` and a touch accepted again;
the enrichment export returning its header and no client row; and the scoreboard
reporting one client against a null target. Synthetic fictional records only. No
outreach was sent and no production deployment was performed.
