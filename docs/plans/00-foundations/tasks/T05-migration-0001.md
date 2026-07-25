# T05 · Migration 0001 — the full §3 schema

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-04
**Spec** `docs/PLAN.md` §3 (lines 123–409) · **Depends on** T01 · **State** `todo`
**Execution** agent

## Outcome

`migrations/0001_*.sql` contains the entire §3 schema — sixteen tables, the
`schedulable_patients` view, every index including the partial unique index — and applies cleanly
to an empty D1.

## Scope

- **In:** one initial migration carrying the complete §3 schema and its explanatory comments.
- **Out:** seed rows (T09). Applying it to remote D1 (T18). Any schema change implied by an
  unanswered question — see *Open questions*.

## Detail

Write the entire §3 schema as **one** initial migration. Getting the whole shape in now avoids
expand-only gymnastics during Phases 1 and 2.

**Copy the SQL from `docs/PLAN.md` §3 verbatim, including the comments. Do not retype it and do not
paraphrase the comments.** From the plan (P0-04):

> Copy the explanatory comments from §3 into the migration. They are the reason the schema looks
> the way it does and they will not survive being paraphrased.

Tables: `doctors`, `patients`, `visits`, `plan_days`, `plan_runs`, `csv_imports`, `geocode_cache`,
`line_recipients`, `doctor_absences`, `line_events`, `road_distances`, `deploys`, `line_sessions`,
`holidays`, `settings`, `audit_log`.

View: `schedulable_patients` — **columns enumerated, never `SELECT *`.** §3's own comment:

> Columns are ENUMERATED deliberately: SQLite expands SELECT * at view-creation time, so under the
> expand-only migration rule (§11.4) a later ADD COLUMN would silently not appear here, producing a
> baffling "my new column is undefined in the planner" bug. Any migration touching `patients` must
> drop and recreate this view.

Indexes: `idx_patients_sched`, `idx_patients_dupe`, `idx_visits_day`, `idx_visits_patient`,
`idx_visits_cycle`, `idx_plan_runs_date`, and the partial unique index:

```sql
CREATE UNIQUE INDEX uq_visits_cycle_live ON visits(patient_id, visit_type, cycle_index)
  WHERE cycle_index IS NOT NULL AND status IN ('planned','completed');
```

**Not** a plain `UNIQUE(patient_id, visit_type, cycle_index)` table constraint. The reason, verbatim
from §3, because this is the single most reversible-looking decision in the schema and reversing it
breaks two whole features:

> A plain UNIQUE(patient_id, visit_type, cycle_index) would make the two most common non-happy
> paths structurally impossible: §5.1 ("a missed visit does not advance the cycle — the patient
> stays due and becomes mandatory on the next run that can reach them") and §6.4 ("cancelling does
> not cancel the obligation — the patient becomes a candidate again") both require a SECOND row for
> the same (patient, 'prescription', k). Under a table constraint the very next commit run throws
> on that INSERT. Constraining only LIVE obligations keeps generation idempotent while preserving
> the missed/cancelled attempt as an auditable row.
>
> General visits carry cycle_index IS NULL and are excluded by the WHERE clause, so they are
> unconstrained. This is deliberate, not an accident of NULL semantics.

**Not** `UNIQUE(target_day)` on `plan_runs`. Also verbatim:

> That constraint PREVENTED retries rather than enabling them: a run that inserted its row and then
> crashed left status='running' occupying the slot forever, and a manual retry violated the
> constraint. Idempotency comes from plan_days.committed and from uq_visits_cycle_live, which is
> where it belongs.

The `settings` table's comment block distinguishes **structural** keys (read-only in the UI, changed
only by migration) from **operational** ones, and explains why — `commit_lead_days` defines the
last-chance invariant, the freeze horizon and the gap-audit window simultaneously. Carry the whole
comment; T09 writes the rows.

## Acceptance criteria

- [ ] All sixteen tables exist after applying the migration to an empty database.
- [ ] `schedulable_patients` exists and its definition **enumerates columns** — the stored SQL
      contains no `SELECT *`.
- [ ] `uq_visits_cycle_live` exists and is a **partial** index: its stored SQL contains the
      `WHERE cycle_index IS NOT NULL AND status IN ('planned','completed')` clause.
- [ ] Two `planned` rows for the same `(patient_id, 'prescription', k)` are rejected; a `missed`
      row plus a `planned` row for that same triple is **accepted**. Both directions tested — the
      second is the one a table constraint would break.
- [ ] Two rows in `plan_runs` with the same `run_date` are accepted.
- [ ] Two `general` visits for the same patient (`cycle_index IS NULL`) are accepted.
- [ ] Every `CHECK` constraint in §3 is present, verified by inserting one violating row per check.
- [ ] The six named indexes exist.
- [ ] The migration's comments match §3's, not a paraphrase.

## Validation

Local only, no third party. Apply to a fresh Miniflare D1
(`wrangler d1 migrations apply wherego --local`), then assert against
`sqlite_master`/`PRAGMA` rather than by reading the file — the file is what was written, the
schema is what was created, and the partial-index clause is exactly the thing that gets silently
dropped in between. Drive the accept/reject cases above as real inserts. Synthetic rows only;
**the sample CSV is never used, never committed, never pasted into a fixture or an agent prompt.**

## Open questions

- **Q1 (clinic)** — rolling 28-day window vs NHI calendar month — changes `respectsCap` in Phase 2,
  not this schema. Noted so it is not re-raised here.
- **The Google Maps ToS caching answer (T12) is a schema gate**, per §9 and the ROADMAP decision
  register. If the answer is "time-limited", `geocode_cache.fetched_at` gains a reader and the
  nightly job gains a re-resolve sweep. `fetched_at` already exists in §3, so **this migration does
  not change** — but T12 must land before Phase 1 relies on "geocode once, cache forever".
