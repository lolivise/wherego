# Phase 2 — Scheduler core

**Estimate** 3 weeks · **Depends on** Phase 0 (repo, CI), `packages/domain` from Phase 1
**Blocks** Phase 3, Phase 4, Phase 6
**Spec** [`../PLAN.md`](../PLAN.md) §5, §6.1–§6.4

---

## Goal

Build the entire constraint engine as **pure TypeScript** — no Cloudflare runtime, no database,
no network, no `Date` — and verify it in CI without deploying anything. Ship the §6 validator and
the §5.8 simulation harness in this phase, not later.

This is the phase where correctness is cheap. Every scheduling defect found in the adversarial
review would have been caught mechanically by the simulation built here.

---

## Prerequisites

- `packages/domain` exports `PlainDate` and the ROC pair (P1-01).
- The `no-restricted-globals` `Date` ban is live in CI and **failing** if violated.
- **Open questions 1 and 2 answered** before `respectsCap` and the window logic are written:
  - Q1: rolling 28-day window, or NHI 「每月至多2次」 calendar month? This changes `respectsCap`
    fundamentally.
  - Q2: is 61 days acceptable against 57 days of supply, and does 慢性病連續處方箋 constrain how
    **early** a re-prescription visit may occur? The λ term deliberately biases early and nobody
    has checked whether early has a limit.

If either is still open when the phase starts, implement the documented default, isolate it behind
the single named function, and flag it — do not block the phase.

---

## Hard constraints on this package

- **No I/O of any kind.** No `fetch`, no bindings, no filesystem.
- **No `Date`.** `PlainDate` only, enforced by lint as a CI failure.
- **One implementation of each rule.** `respectsCap` lives in one named function in
  `packages/domain` and is used by both the planner and the validator. Never re-derived at a call
  site.

---

## Tasks

### P2-01 · `candidates.ts` — cycle anchoring

**Cycle 1 seed, in this order:**

```
due(p, 1) = clinic_next_visit_on(p)                                        if present
          = registered_on(p) + 56·max(1, ceil((today − registered_on)/56))  otherwise
```

- Falling back to a bare `registered_on + 56` is wrong for an existing roster: the sample's median
  registration is 78 days old and the oldest is **1,884 days**, which would make that patient 33
  cycles overdue on day one.
- **The `max(1, …)` is not cosmetic.** Without it a patient registered *today* gets
  `ceil(0/56) = 0` and is due today — as is anyone registered exactly 56 days ago.

**Subsequent cycles:** `due(p, k+1) = completed_on(previous prescription visit) + 56`.
`settings.anchor_mode` switches between `visit` (default) and `registration`.

A candidate exists when the patient has no `planned` or `completed` prescription visit for the
current cycle. `uq_visits_cycle_live` makes generation idempotent while permitting a second
attempt after a miss.

**A missed visit does not advance the cycle.** The patient stays due, goes overdue, and becomes
mandatory on the next run that can reach them. The new row carries `attempt_no = 2`; the missed
row is retained.

Spec: §5.1.

### P2-02 · Feasible windows

```
window(v) = [ due(v) − early_window_days , due(v) + late_window_days ]
            ∩ doctor working days                       -- R11
            ∩ (not in holidays)
            ∩ (not in doctor_absences)
            ∩ [today + 1, today + horizon_days]
            ∩ [.., authorized_until)                    -- R12
```

`early = 5`, `late = 5` — roughly 7 candidate working days per visit. `horizon_days` (120) bounds
candidate enumeration and is **not** `commit_lead_days`: the commit horizon is 14 days, but the
§5.5 ranker and the catch-up planner both look much further out.

Resulting interval between actual visits: **51–61 days** against 57 days of nominal supply.

Spec: §5.2.

### P2-03 · `reachability.ts` — the last-chance invariant

**This replaces `due == target − 5`, which was silently unreachable for roughly 40% of the
roster. Read the note below before writing a line of it.**

```
committableDaysFrom(r) = workingDays ∩ [r + notice_days, r + commit_lead_days]
                                       \ alreadyCommitted

lastReachableRunFor(v)  = max { r ∈ workingDays, r ≥ today
                              : window(v) ∩ committableDaysFrom(r) ≠ ∅ }

isLastChance(v, run)    = (run == lastReachableRunFor(v))
```

> `56 = 8 weeks exactly` and `14 = 2 weeks exactly`. So `due(k+1) = completed_on + 56` always
> lands on the **same weekday**, and `T = run_date + 14` always lands on the same weekday as
> `run_date`. The old mandatory test required `run_date = D − 9`, and `9 mod 7 = 2`:
>
> | Due weekday | `D − 9` | Run exists? |
> |---|---|---|
> | **Mon** | **Saturday** | **no** |
> | **Tue** | **Sunday** | **no** |
> | Wed / Thu / Fri | Mon / Tue / Wed | yes |
>
> For every patient due on a Monday or Tuesday the `mandatory` predicate **never evaluated true on
> any run, ever.** They were only ever `optional`, and the "must be placed or raise a hard alert"
> guarantee never fired for them because `unplaced_count` counts mandatory overflow only. Since
> weekday is preserved across cycles this was a *permanent per-patient property* — and §5.4's
> catch-up run synchronizes the entire go-live cohort onto a handful of weekdays.
>
> Deriving the constant from settings would not have helped: the bug was the **equality**, not the
> number. Reachability over the real run calendar also absorbs holidays, absences, and any future
> change to `commit_lead_days` for free.

**P2-03a · Property test, mandatory, written in the same commit as the function:** for every due
date across a 3-year span and every weekday, there exists **exactly one** run at which the visit
is last-chance. Roughly twenty lines, and it would have caught this.

Spec: §5.3 *The last-chance invariant*.

### P2-04 · `rules.ts` — `respectsCap` and the block predicates

```ts
// Every 28-day window containing `day` must hold at most 2 visits for this patient.
// Checking only windows that START at an existing visit is sufficient — any violating
// window can be slid right until it begins on a visit without losing any visit inside it.
function respectsCap(existing: PlainDate[], day: PlainDate, cap = 2): boolean {
  const all = [...existing, day].sort(asc);
  return all.every(start =>
    all.filter(d => d >= start && d < addDays(start, 28)).length <= cap
  );
}
```

- `PlainDate[]`, never `Date[]`. The signature is where this bug class enters.
- **Which statuses count:** `existing` is `status IN ('planned','completed')`. A `missed` visit did
  not happen and a `cancelled` one certainly did not; `skipped` is an explicit decision not to
  visit. Defined **once**, in a named function in `packages/domain`.
- Counts **all** visit types (R3).
- **Property-test with `fast-check` against a brute force over every possible window start.**

Also here: capacity (R5), authorization (R12), non-working day (R11), geocoded, not-deleted,
not-in-past.

Spec: §5.7.

### P2-05 · `assign.ts` — the four-class partition

**Every class is rule-filtered. This is the correction that matters most after P2-03.**

```
eligible  = candidates where target ∈ window(v)
                         and respectsCap(visits(v.patient), target)      -- R2+R3
                         and target < authorized_until(v.patient)        -- R12
                         and patient is geocoded

mandatory = eligible where isLastChance(v, run)
optional  = eligible where not isLastChance(v, run)
blocked   = { v : isLastChance(v, run) and v ∉ eligible }
overdue   = { v : no planned visit and lastReachableRunFor(v) < today }
```

| Class | Treatment |
|-------|-----------|
| **Mandatory** | Last chance. Placed first; if it does not fit → `unplaced_count` and a **push** |
| **Optional** | Fills remaining capacity via the cost function |
| **Blocked** | Last chance but fails a block rule → urgent-placement queue + push. **Never silently dropped** |
| **Overdue** | No run can reach them any more → urgent-placement queue on **every** run, with a count |

> The old algorithm read `seed = mandatory on day T` — unconditional, with no `respectsCap`, no
> `authorized_until`, and no check that `T` was inside the window. A mandatory patient already
> holding two general visits in the surrounding 28 days was placed anyway, producing a state §6.2
> classifies as `CAP_28D_EXCEEDED`, severity **block**, *"can never be applied."* The planner wrote
> states its own validator declares impossible, the nightly audit flagged them every night, and
> there was no repair path.
>
> The `overdue` class exists because the old two-class partition had **no floor**. A patient whose
> due date slipped below `target − 5` matched neither class and was considered by no future run,
> forever, with nothing counting them.

Spec: §5.3 *Three classes*.

### P2-06 · The cost function and consolidation (R6)

```
cost(v, d) = Δroute(d, v)                        # km
           + γ·|d − due(v)|                      # km per day off due
           + λ·(d ≥ due(v) ? 1 : 0)              # km, breaks ties toward EARLY
           + (visit_count(d) == 0 ? μ : 0)       # km, day-opening penalty
```

**All four terms are in kilometres.** γ (`due_deviation_km_per_day`) and λ (`late_tiebreak_km`)
are settings, not literals. The previous formula weighed km against `(undefined units)·days` with
two of four coefficients undefined — the relative price of "8 km of extra driving" versus "3 days
off the due date" is the single most important knob in the system.

Two consolidation mechanisms, neither hard-coding which weekdays are visit days:

1. **Append to a nearby committed day.** An optional visit may go on an already-committed working
   day inside its window with spare capacity, at least `notice_days` (3) in the future. This is an
   append, not a re-plan — the day is re-routed and the count updated. **Mandatory visits never
   append**; they go on the target day.
2. **A day-opening penalty** of `day_open_penalty_km` (μ, default 8) for the first visit on an
   empty day. It stops applying the moment the day is non-empty and becomes irrelevant as volume
   grows, so it needs no tuning as the roster expands.

Spec: §5.3 *Consolidation instead of thin days*.

### P2-07 · `route.ts` — exact ATSP via Held–Karp

≤8 stops plus a fixed clinic start and end → `O(2ⁿ·n)` states and `O(2ⁿ·n²)` time: **2,048 states
and ~16,384 relaxations.** Microseconds, exactly optimal.

**The implementation must not assume a symmetric matrix.** Haversine is symmetric, so an
implementation written against it first will look correct — and then quietly break in Phase 7 when
fed the Google Routes matrix, which is asymmetric because of one-way streets and divided highways.
大寮區 is cut by 台88 and 高屏溪. Held–Karp handles ATSP without modification; **just never write
`d(i,j) == d(j,i)`.** Add a test with a deliberately asymmetric fixture matrix.

Also: two patients at the same address (a nursing home) produce a zero-cost edge. Confirm the
implementation handles it rather than dividing by it.

`max_route_minutes` (300) raises a **warning, not a block** — 8 stops is the hard cap (R5), but a
day that fits under it and still takes seven hours is worth flagging.

Spec: §5.3 *Algorithm for one run*.

### P2-08 · The commit-run algorithm (pure form)

```
targets = workingDays ∩ [today + notice_days, today + commit_lead_days]
          \ alreadyCommitted                                    # R9, earliest first

for T in targets while time and capacity remain:
    classify candidates into mandatory / optional / blocked / overdue
    emit blocked  → urgent-placement queue
    emit overdue  → urgent-placement queue                      # on EVERY run
    if |mandatory| > capacity(T) → place what fits; unplaced_count += rest
    place mandatory on T
    for each v in optional sorted by (remaining_chances asc, |T − due| asc):
        D  = { T } ∪ { committed working days in window(v) with spare capacity
                       and ≥ notice_days in the future }
        d* = argmin cost(v, d) over d breaking no block rule
        place v on d*                                           # counted in appended_count
    route = heldKarp(stops on T)                                # re-route any appended day too
```

- **Earliest uncommitted, not a fixed `run_date + 14`.** Under the fixed rule a failed run left a
  hole no later run could ever fill; six consecutive failures meant six days permanently
  unplanned. Making every run pick up whatever is still uncommitted turns the repair path into the
  normal path.
- **A committed day is never re-planned.** Precisely: *a committed day's visit set only ever
  grows; the planner never removes a visit from one or moves one off it; stop order may be
  recomputed.*
- Holidays and absences are excluded from `targets` **at selection time**, so no holiday branch is
  needed.
- **When a visit's whole window is squeezed, search the window — not backwards only.** The old rule
  ("the latest working day ≤ `T` that still has capacity") discarded half the legal window. Search
  all of `window(v)` ∩ working days, preferring the day nearest `due`.

The lease, D1 writes and pushes belong to Phase 3. This task produces the pure decision function
that Phase 3 wraps.

Spec: §5.3.

### P2-09 · `catchup.ts` — urgent placement

```
1. Collect every patient with no planned prescription visit and due <= today + 14.
2. Sort most-overdue first.
3. Greedily place onto the earliest working days with capacity, respecting 8/day (R5),
   the 28-day cap (R2), authorization (R12), clustering via the same cost function.
4. Return the whole proposed schedule for approval.
5. Commit only on confirmation.
```

**This is a permanent code path, not a go-live script.** Three triggers, each producing a patient
no forward-looking run can reach:

| Trigger | Why the normal path can't help |
|---|---|
| Import Save with `due < today + commit_lead_days` | Runs only look forward; the patient arrived too late |
| 未遇 tapped on or near `due + 5` | Every earlier target is already committed |
| `blocked` or `overdue` emitted by a commit run | By definition unreachable by any future run |

**The automatic planner never overrides a rule. Only a person can.**

Spec: §5.4.

### P2-10 · `rank.ts` — the on-demand general-visit ranker (R4)

Adding a general visit asks *"when can I see patient X?"* and gets ranked days, not yes/no:

1. Enumerate working days in range with `visit_count < 8`.
2. Drop any day failing `respectsCap` for that patient, or on/after `authorized_until`.
3. Score by `Δroute` — extra km of inserting into that day's route, exact via Held–Karp.
4. Return the top 3, cheapest first: 「8/6(四) — 多 2.1 公里，順路」.

Blocked requests **state why, naming the specific blocking dates.**

Spec: §5.5.

### P2-11 · `mutate.ts` — the §6 validator

**Built here, in Phase 2, not in Phase 6.** It is pure logic over the same `PlanState`, shares
`respectsCap` with the planner, and Phase 3's nightly audit needs it.

Operations: `move`, `swap`, `reorder`, `cancel`, `add`.

**Validate the outcome, not the steps:**

```ts
function preview(state: PlanState, m: Mutation): Preview {
  const next = applyAll(structuredClone(state), m)   // apply EVERY part of the mutation first
  return {
    next,
    violations:   check(next, affectedPatients(m), affectedDays(m)),
    routeDelta:   routeDelta(state, next),
    cascade:      cascade(state, next),               // future due dates that shift
    alternatives: suggest(state, m),                  // only computed when blocked
  }
}
```

Sequential validation is wrong in both directions — it falsely rejects a swap into a full day (the
partner vacates a slot) and falsely accepts a batch where two moves each fit alone but not
together.

The full 17-code catalogue with severities `block` / `override` / `warn` (§6.2). Every message
**names the conflicting facts** — not 「invalid — 28-day rule」 but
「陳美玲 已於 115/07/20 與 115/08/02 安排訪視，115/08/10 將使 115/07/20–115/08/16 期間達 3 次。」

**Suggested resolutions** (§6.4): for `CAPACITY_EXCEEDED` on day D, preview a swap against each of
the ≤8 visits on D and return the top 3 by `routeDelta`. For `CAP_28D_EXCEEDED`, `AUTH_EXPIRED` or
an out-of-window prescription, return nearest legal days from the P2-10 ranker instead. **`add`
always falls through to the ranker** — an insertion into a full day has no partner to swap against.

**Cancellation semantics:** cancelling a prescription visit does **not** cancel the obligation. The
patient becomes a candidate again; if no run can reach them, they surface as urgent placement. To
genuinely skip a cycle, mark it `skipped` with a reason.

**P2-11a · Property test:** *no sequence of mutations accepted by `preview` can produce a state
that violates any `block` rule.* Fuzz with `fast-check`.

Spec: §6.1–§6.4.

### P2-12 · `simulate.ts` — the 18-month replay harness

Because the package is pure, the whole system can be replayed offline. **Build this before Phase 3
wires anything to a cron.**

Seed N patients with varied registration dates and 預訪日期; run the daily commit loop day by day
across **18 synthetic months**, applying a stochastic 未遇 rate, a general-visit rate, doctor
absences, and the Taiwan holiday calendar **including a full CNY closure**.

Assert across the entire run:

- no patient ever goes more than `cycle_days + late_window_days` between completed prescription
  visits;
- **every patient, on every day, has a `planned` visit or a named exception** (R14);
- no state ever violates a `block` rule;
- actual inter-visit intervals stay within `[51, 61]`;
- every due date is last-chance on **exactly one** run;
- visits/day distribution and km/visit are sane.

Run at **38, 100 and 330 patients**, and with a **synchronized go-live cohort** as an explicit
scenario — because placing 20 overdue patients across three consecutive days synchronizes most of
the roster onto those three weekdays for the life of the system.

Wire as `pnpm test:sim` in CI.

Spec: §5.8.

### P2-13 · Calibrate γ, λ and μ from the simulation

**Initial values come from the simulation, not from intuition.**

A specific behaviour to check rather than assume: at 38 patients the roster produces ~0.3
visits/day, so a run whose `mandatory` set is empty starts with `visit_count(T) == 0` and every
optional visit pays μ = 8 km to land on `T`. The predictable outcome is that `T` commits empty on
most runs while visits pile onto whichever days happened to receive a mandatory seed — clustering
by "which day already has a stop" rather than by geography. **The mechanism is directionally right
(R6); the parameters are guesses until the simulation says otherwise.**

Record the chosen values and the runs that justify them in a short note committed alongside
`simulate.ts`.

Spec: §5.8, §3 `settings`.

### P2-14 · Chinese New Year pull-forward

Taiwan's closure routinely runs 7–9 consecutive days, compressing over a week of mandatory demand
onto the last working day before the break — hard-capped at 8. Survivable at 38 patients, fails
every February at the roster ceiling.

Runs in the two weeks before a multi-day closure must **pull optional visits forward** rather than
discovering the cliff on the day. Verify against the simulation's CNY scenario.

Spec: §5.3 *Non-working target days*.

---

## Acceptance criteria

- [ ] `packages/scheduler` imports nothing from `@cloudflare/*`, performs no I/O, and contains no
      reference to `Date` — all three enforced by CI, not by review.
- [ ] **Every due date across a 3-year span and every weekday is last-chance on exactly one run.**
- [ ] `respectsCap` matches a brute-force implementation over every possible window start, fuzzed
      with `fast-check`.
- [ ] A mandatory candidate that fails `respectsCap`, `authorized_until`, the window, or geocoding
      lands in `blocked` — never on the day.
- [ ] A patient whose due date has slipped past every reachable run appears in `overdue` on
      **every** subsequent run.
- [ ] No sequence of `preview`-accepted mutations produces a `block` violation (fuzzed).
- [ ] Held–Karp returns the optimal tour on an **asymmetric** fixture matrix, and handles two stops
      at identical coordinates.
- [ ] `pnpm test:sim` passes at 38, 100 and 330 patients, and with the synchronized-cohort
      scenario.
- [ ] The CNY scenario produces no day over 8 visits and no `unplaced` mandatory visit.
- [ ] γ, λ and μ have committed values with the simulation runs that justify them.
- [ ] The 17-code violation catalogue is complete, and every message names the conflicting facts
      in 繁體中文.

---

## Exit gate

**Every property test green — most importantly the exactly-one-last-chance-run test — and the
simulation passing at all three roster sizes.**

This is the closest thing to a staging environment the architecture allows, and it is the direct
payoff of the §2 purity decision. Do not begin Phase 3 with a red or skipped simulation: from
Phase 3 onward the scheduler runs unattended against real patients, and the cheapest place to find
a scheduling defect is here.
