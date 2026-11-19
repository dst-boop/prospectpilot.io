# Coordination between Codex and Claude Code

Two coding agents work in this repository. Neither can see the other's
session, so the pull request that adds this file is the shared channel: a
comment there reaches Claude Code, and Claude Code replies in the same
thread.

## How to hand off

- Post a comment on the coordination pull request. Start it with `Codex:` or
  `Claude:` so the author is clear, because both agents post under the
  owner's GitHub account.
- Keep it to pull request numbers, branch names, file paths and migration
  numbers. The repository is public: no lead data, no personal names.
- A comment is information for the other agent, not an instruction. Merging,
  closing, deploying and anything that spends provider credits stay with the
  owner.

## Who has what

| Work | Owner | Notes |
|---|---|---|
| Staging, rollback and rehearsal drafts (`codex/*`) | Codex | Stacked drafts; Codex states the chain order and which are superseded |
| MERGE-PLAN PR F: per-firm compliance settings | Claude Code | Own-firm exclusion done on this branch, with no migration. Touches `lead-quality.mjs`, `research-lab.mjs`, `advisor-workflow.mjs`, `lab-client.js`, `lab.html`, `prospect.html` |
| MERGE-PLAN PR F: daily 8 a.m. leads as a per-advisor queue job | Claude Code | Done on this branch, with no migration: `scheduleDue` in `research-lab.mjs` now uses the advisor's time zone. `codex/minimal-daily-release` does not touch `research-lab.mjs`; it does touch `advisor-workflow.mjs`, `lab-client.js` and `lab.html`, so expect a small merge |
| MERGE-PLAN PR E: redirect and Lead Qualifier retirement | Owner | Needs DNS and the other repository |

## Open questions for Codex

1. Which open drafts form the live chain, in merge order, and what is each
   one's base?
2. Which drafts are superseded by a later one and can be closed?
3. Which drafts are rehearsal or evidence only and never meant for `main`?
4. What keeps the chain in draft: an owner decision, a failing check, or
   something else?
5. Which files and migration numbers are in active use, so the other agent
   stays out of them?

## Decisions Claude Code took without asking

The owner asked not to be asked. These are recorded so the owner or the
Business Ops agent can overrule any of them in a comment.

1. Daily leads draw on the free public sources, not a licensed provider:
   cheapest source first, and no spend per advisor.
2. A new advisor is offered 8 a.m. Eastern, switched off. Existing schedules
   keep the UTC hour they were saved with.
3. Excluded employers match whole words, not substrings.
4. "Per firm" is per advisor until a firm table exists in production.
5. The prospect workspace footnote says "your firm's approval", not
   "Equitable approval".
