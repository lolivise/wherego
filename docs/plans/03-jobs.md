# Phase 3 — Jobs

**Estimate** 2 weeks · **Depends on** Phase 1 (patients exist), Phase 2 (the engine)
**Blocks** Phase 4, Phase 7
**Spec** [`../PLAN.md`](../PLAN.md) §5.3, §5.4, §5.6, §6.5, §11.1, §11.4

---

## Goal

Wire the pure engine to the real world: one Durable Object that serializes every write, the daily
commit cron, the nightly maintenance cron, and an alerting path that has a destination.

**This is the first phase whose output runs unattended against real patients.** Every task here
either produces a scheduling decision nobody watches, or is a detector that fires when one of
those decisions is wrong.

---

## Prerequisites

- Phase 2's exit gate closed — simulation green at all three roster sizes.
- Open question 5 answered: how does the doctor want leave handled, pre-blocked or reactive? It
  decides whether P3-11's absences screen is a Phase 4 nicety or a Phase 3 necessity.
- `LINE_ALERT_RECIPIENT` and `HEALTHCHECK_PING_URL` in 1Password and synced to the Worker (P0-10,
  P0-11).
- The **dev** LINE channel is the only channel any of this touches until Phase 5.

---

## Tasks

### P3-01 · `PlanCoordinator` — the Durable Object, and the only writer

**D1 has no interactive transactions.** You cannot `BEGIN`, read state, compute in JavaScript,
write, and `COMMIT`; D1 offers `batch()` — a fixed statement list with no JS in between — or a
single statement. So "re-run the full validation inside the write transaction" is not implementable
against D1 directly.

**`visits.row_version` alone does not save it.** It guards the *one row being moved*, while the
invariants that matter are cross-row: day capacity (R5) and the 28-day cap (R2) both depend on rows
nobody is writing. Two concurrent moves into the same day each validate against a 7-visit day and
both commit, producing the 9-visit day `CAPACITY_EXCEEDED` says can never exist — and §6.3's
property test passes the whole time, because it runs against the pure package where the race does
not exist.

- **A single Durable Object, `PlanCoordinator`, is the only writer.** Its single-threaded execution
  makes read → validate → write genuinely atomic.
- `apply` runs **inside the DO**, re-reads state fresh, re-runs the full §6 validation, and aborts
  if any `block` appeared since preview. **The preview is a UI affordance, never the authority.**
- It holds the in-memory `PlanState` so `preview` doesn't re-read the world on every drag.
- `visits.row_version` and `plan_days.row_version` remain as defence in depth and to detect a stale
  client. `plan_days.row_version` is bumped on **any** change to the day, so a validation that
  merely *read* that day's capacity has something to guard against.
- **Reads may bypass the DO and hit D1 directly. Only writes are serialized.**
- Route every existing write — including Phase 1's import Save — through it.

Spec: §2, §6.5.

### P3-02 · The plan-run lease

Lives in **DO state**, not in a table. `lease_until`, 10-minute TTL, reclaimable once passed.

This is what makes "non-stale" a definition rather than a word: a crashed run previously left
`plan_runs.status = 'running'` forever and blocked every future run. Deployment refuses to start
while a live lease is held (§11.5).

Spec: §6.5, §11.5.

### P3-03 · Locking semantics

Every applied change sets `visits.locked = 1`. The optimizer plans around it and never moves it.
Users can unlock; recorded in `audit_log`. Accepted `override` violations are stored in
`override_ack` with the actor.

**The lock auto-clears once `scheduled_on < today`** — otherwise, after a few months of
hand-tuning, most visits are locked and the optimizer is decorative.

Spec: §6.5.

### P3-04 · The commit cron

```
cron = "0 0 * * 1-5"      # UTC = Mon–Fri 08:00 Asia/Taipei
```

Taipei is fixed UTC+8 with no DST, so 08:00 local is 00:00 UTC on the same date and weekdays match.
**Do not "fix" this with offset arithmetic later.**

Wrap P2-08's pure decision function:

```
lease = acquirePlanLease()          # 10-min TTL
if not lease: exit                  # another run is genuinely active
... run the P2-08 algorithm over `targets`, earliest uncommitted first ...
writeDecisionTrace(); gapAudit(); pingExternalMonitor()
```

Per run, write a `plan_runs` row: `trigger`, `run_date`, `target_days` (JSON array — a run may
commit several), `mandatory_count`, `optional_count`, `appended_count`, `blocked_count`,
`overdue_count`, `unplaced_count`, `route_km`, `gap_alert`, `stats_json`.

There is no rolling-horizon re-plan and no separate freeze horizon — **the 14-day lead is the
freeze.**

Spec: §5.3, R9.

### P3-05 · The decision trace

`plan_runs.stats_json` records, per run: the candidate set, each visit's classification **and
why**, the chosen day, the cost breakdown by term, and the reason for **every** non-placement.

With no staging environment this trace is the only forensic tool available. The class of bug found
in review — a planner writing states its own validator declares impossible — becomes obvious the
first time someone reads one.

Spec: §5.3 *Decision trace*.

### P3-06 · Gap audit, in **both** jobs

Verify each working day in `[today, today + commit_lead_days]` has a committed `plan_days` row;
alert on any gap.

**It runs in the commit job and, on a different schedule, in the nightly job.** A detector that
only executes inside the job it audits is worthless precisely when it is needed: a deterministically
failing commit run is detected by nothing, forever.

Spec: §5.3 *Gap audit*, §5.6 item 6.

### P3-07 · The nightly maintenance cron — nine items

```
cron = "0 18 * * *"       # UTC = 02:00 Asia/Taipei, daily
```

1. **Auto-complete — but never on a day the doctor did not work, and never before asking.**

   Every `planned` visit with `scheduled_on < today` becomes `completed`, `completed_on =
   scheduled_on`, `auto_completed = 1`, listed on the dashboard for 14 days as 「自動結案」.

   Without this, one forgotten 完成 tap silently removes a patient from all future scheduling —
   `completed_on` never gets set, the next cycle is never generated, and there is no visible
   symptom until someone notices the patient has not been seen in months. But unqualified, the
   consequence is that the system's recorded truth becomes *"every scheduled visit occurred, on the
   scheduled date"* regardless of reality — and `completed_on` anchors the next 56-day cycle, so a
   visit that did not happen produces a next-due date computed from a fictional event. Three
   guards:

   **(a)** The 07:00 push leads with yesterday's un-tapped visits as an explicit 「昨日未回報」
   confirm/correct prompt (Phase 5 delivers the push; build the query and the flag here). The
   correction happens at the moment someone can still remember, rather than depending on the same
   person who didn't tap 完成 to review a dashboard list that is almost always correct.

   **(b) Suppress on absence days (R16).** A visit on a `doctor_absences` day is marked `missed`
   and routed to urgent placement, **never auto-completed**. A single week of leave would otherwise
   fabricate ~23 completed visits and corrupt ~23 cycle anchors in one night, inside a 14-day
   correction window a doctor catching up after leave will not open.

   **(c) Escalate.** Three consecutive `auto_completed = 1` visits for the same patient raises a
   dashboard item — that is the signal reporting has stopped working entirely, not that three
   visits went smoothly.

   Honours `settings.auto_complete_enabled`.

2. **Geocode sweep** — retry `pending`, cache-first, 3-attempt cap (delivered in P1-12; confirm it
   runs here).
3. **Rule audit** — run the §6 validator over the whole published schedule. An edited
   `registered_on` or a lapsed `authorized_until` can retroactively invalidate planned visits.
   Findings go to the dashboard and are pushed if they affect the next 7 days.
4. **Authorization sweep** — flag patients whose `authorized_until` passes within 30 days;
   block-flag any planned visit on or after it.
5. **Session cleanup** — delete expired `line_sessions` and `line_events` older than 7 days.
6. **Gap audit** (P3-06).
7. **R14 — the "nobody is invisible" assertion.** Count schedulable patients with no `planned`
   prescription visit and no named exception (`overdue`, `blocked`, geocode failure, expired
   authorization, explicitly `skipped`). **Push when non-zero.**

   Roughly thirty lines, and the backstop for every scheduler bug not yet found. Every other
   subsystem announces its problems; the scheduler's failure mode is a patient who is simply not on
   any day, and nothing else in the design counts them.
8. **Holiday-table staleness** — alert when `max(holidays.day) < today + 90`. A stale table
   silently books a closed day.
9. **Heartbeat** — on success, ping the external monitor.

Spec: §5.6.

### P3-08 · Alerting — three layers, because an in-Worker detector cannot detect its own absence

**R15: no unattended job fails silently.**

1. **Every `scheduled()` handler catches at the top level**, writes `plan_runs.status = 'failed'`
   with `error_text`, and **pushes to `LINE_ALERT_RECIPIENT`**.
2. **Every successful run pings healthchecks.io.** This is the only observer outside the failure
   domain — an in-Worker heartbeat cannot detect its own non-execution.
3. The Monday weekly digest (Phase 5) converts every silent failure mode into a number a clinician
   will read.

Build a minimal LINE push helper here — channel access token, one recipient, plain text. The full
bot is Phase 5; this is the alert path and it must exist before the crons do.

Pushes that must fire: run failure, `unplaced_count > 0`, `blocked` or `overdue` non-empty, R14
assertion non-zero, holiday staleness, rule-audit findings inside 7 days.

Spec: R15, §5.6 item 9, §10.3.

### P3-09 · Urgent placement, wired

P2-09's pure planner behind three automatic triggers (import Save, 未遇, blocked/overdue from a
commit run), each landing in the queue **with a push**.

**Every placement requires human confirmation.** The automatic planner never overrides a rule.

**The approval standard, because this is the highest-consequence human decision in the project:**
the approval screen shows, per patient, days overdue, the proposed day, the resulting interval
since their last visit, and any `warn` violations. It requires **the doctor — not the nurse** — and
the approval is written to `audit_log` with the full proposed set.

The screen itself is Phase 4; the endpoint, the proposal payload and the audit write are here.

Spec: §5.4.

### P3-10 · Overdue recovery semantics

- 未遇 sets `status = 'missed'` and raises an urgent-placement item.
- `PRESCRIPTION_OUT_OF_WINDOW` is an **override** violation, not a hard block: a person can place
  outside ±5 by explicitly acknowledging it, recorded in `visits.override_ack` and `audit_log`.
- A missed visit does **not** advance the cycle; the retry row carries `attempt_no = 2` and the
  missed row is retained.

Spec: §5.4, §5.1.

### P3-11 · `doctor_absences` — the write path

Endpoints to mark and clear absence days. Absence days are non-working for planning **and**
suppress auto-completion (R16). **Marking a day that already has visits on it routes them to urgent
placement.**

The screen is Phase 4; the model, the endpoints and the planner integration are here, because P3-07
item 1(b) depends on them.

Spec: §7 *Doctor absences*, §5.6.

### P3-12 · `test:worker` — Worker-level integration tests

`@cloudflare/vitest-pool-workers`, running the actual Worker against **real Miniflare D1** in CI:
migrations, route handlers, a **signed** LINE webhook body, the import Save path, the Access
default-deny allowlist assertion, and **the cron handlers seeded with synthetic patients**.

It needs no credentials, so it preserves `ci.yml`'s best property. Without it, `pnpm test` covers
the one layer that was already provably safe and none of the layers that are not — and the cron
handlers are the only unattended code in the system with the highest patient consequence.

Concurrency test: two simultaneous moves into the same 7-visit day must produce one success and one
rejection, never an 8th and 9th visit.

Spec: §11.1, §11.4 item 2.

---

## Acceptance criteria

- [ ] Every write path in the codebase goes through `PlanCoordinator`. Grep for direct `D1` writes
      outside the DO and find none.
- [ ] Two concurrent moves into the same day at 7/8 produce exactly one committed visit.
- [ ] A crashed run's lease is reclaimable after 10 minutes; a live lease blocks a second run.
- [ ] The commit cron runs unattended for **five consecutive working days** against a synthetic
      roster in local Miniflare, committing the earliest uncommitted day each time.
- [ ] Skipping a day's run (simulate a failure) leaves a gap that the **next** run fills — no
      permanent hole.
- [ ] A deliberately thrown error in the commit handler produces `plan_runs.status = 'failed'`
      with `error_text`, a LINE push to the dev channel, and **no** healthchecks ping.
- [ ] healthchecks.io reports the check as late when the cron is disabled.
- [ ] `stats_json` explains, for a run with a non-placement, exactly why that visit was not placed.
- [ ] A visit scheduled on a `doctor_absences` day is marked `missed`, **not** `completed`, and
      appears in urgent placement.
- [ ] Three consecutive auto-completions for one patient raise a dashboard item.
- [ ] Deleting every `planned` visit for one schedulable patient makes the R14 assertion fire with
      a count of 1 and push.
- [ ] Emptying `holidays` beyond today+90 fires the staleness alert.
- [ ] `pnpm test:worker` runs in CI with no credentials and covers all three cron handlers.

---

## Exit gate

**Five consecutive unattended runs, and a deliberately failed run that produces both a LINE push
and a late healthchecks check.**

The second half of that gate is the one to insist on. Every other detector in this system lives
inside the thing being detected; proving that the external one works is the only evidence that a
silent total failure would ever be noticed.
