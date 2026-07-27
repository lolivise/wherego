# Acceptance criteria — T05 · Migration 0001, the full §3 schema

**Task** [`../../tasks/T05-migration-0001.md`](../../tasks/T05-migration-0001.md) ·
**Plan** [`plan.md`](plan.md) · **Spec** `docs/PLAN.md` §3, §5.1, §6.4, §9, §11.4
**Status** `agreed — FROZEN 2026-07-26` · **Date** 2026-07-26

> **This file is the contract.** `/build-task` builds to it; `/validate-task` judges against it.
> Changing it to make a validation pass is laundering a defect — it requires the user and a line in
> `progress.md`.

---

## Purpose

**As WhereGo** we need the entire §3 schema to exist as one initial migration that applies cleanly
to an empty database, **so that** Phases 1 and 2 build against the final table shape instead of
performing expand-only gymnastics on a schema that is still arriving — and so that the three
deliberate *absences* of constraint in §3 are proven present rather than assumed.

---

## Requirements

Structural facts, asserted against the **created schema** (`sqlite_master` / `PRAGMA`) after
applying the migration — never by reading the `.sql` file. The file is what was written; the schema
is what was created, and the partial index's `WHERE` clause is exactly the thing that can be lost
in between.

| # | Requirement |
|---|-------------|
| **R1** | Exactly **sixteen** tables exist: `doctors`, `patients`, `visits`, `plan_days`, `plan_runs`, `csv_imports`, `geocode_cache`, `line_recipients`, `doctor_absences`, `line_events`, `road_distances`, `deploys`, `line_sessions`, `holidays`, `settings`, `audit_log`. Compared as a **set** — an unexpected seventeenth table fails |
| **R2** | `schedulable_patients` exists; its stored SQL **enumerates all fourteen columns** and contains no `SELECT *` |
| **R3** | `uq_visits_cycle_live` exists and its stored SQL contains the clause `WHERE cycle_index IS NOT NULL AND status IN ('planned','completed')` — it is a **partial** index, not a table constraint |
| **R4** | All six named indexes exist: `idx_patients_sched`, `idx_patients_dupe`, `idx_visits_day`, `idx_visits_patient`, `idx_visits_cycle`, `idx_plan_runs_date` |
| **R5** | All eight `CHECK` constraints from §3 are present: `patients.geocode_status`, `patients` `length(birth_mmdd) = 4`, `patients.address_source`, `visits.visit_type`, `visits.status`, `plan_runs.status`, `line_recipients.status`, `settings.tier` |
| **R6** | Every non-empty line of §3's fenced `sql` block in `docs/PLAN.md` appears in the migration file, **in the same order**. The comments are carried verbatim, not paraphrased |
| **R7** | *(amended — see below)* The six excluded CSV column names — `身分證號`, `性別`, `主診斷`, `照護階段`, `機構簡稱`, `里` — appear in the migration **only inside `--` comment lines**: never as an identifier, a default, or a `CHECK` value in executable DDL. **And** `PRAGMA table_info(patients)` returns exactly §3's twenty-three columns, compared as a set in **both directions** — a seventh patient column fails whatever it is named. No real name, address or patient value appears anywhere in the file |

R6 is what stops the task's central instruction from degrading into good intentions. R7 is the six-
columns rule made mechanical in the first artifact that could break it.

> ### Amendment — 2026-07-26, on the user's decision
>
> **R7 as originally frozen was unsatisfiable.** It banned the six strings outright, while R6
> mandates §3 verbatim — and §3 L155 reads
> `-- 身分證號, 性別, 主診斷, 照護階段, 機構簡稱 and 里 are NOT read and NOT stored (R13).`
> That line is the *only* occurrence of any banned string in the migration, and it exists to
> **declare** the exclusion. The two requirements contradicted each other and the contract could not
> be satisfied by any correct implementation. Found at build; the agent refused both bad exits —
> paraphrasing the comment, and special-casing the check — and left it failing, which is the
> behaviour the harness wants.
>
> The amendment is **strictly stronger than what it replaces**, not a relaxation. The original
> string ban protected less than it appeared to: a genuine seventh column would be named
> `national_id` or `diagnosis`, not `身分證號`, and the substring scan would never have seen it. The
> new column-set assertion catches it whatever it is called.

---

## Scenarios

### Scenario 1: A second live obligation for the same prescription cycle is rejected

```
Given the migration has been applied to an empty database
And a doctor, a patient, and a visit with visit_type 'prescription', cycle_index 3, status 'planned' exist
When a second visit is inserted for the same patient with visit_type 'prescription', cycle_index 3, status 'planned'
Then the insert is rejected with a constraint violation
And the visits table still contains exactly one row
```

### Scenario 2: A missed attempt plus a live one for the same cycle is accepted

**This is the direction a plain `UNIQUE(patient_id, visit_type, cycle_index)` would break, and per
§3's own comment it is the entire reason the index is partial.** §5.1: *a missed visit does not
advance the cycle — the patient stays due and becomes mandatory on the next run that can reach
them.*

```
Given the migration has been applied to an empty database
And a doctor, a patient, and a visit with visit_type 'prescription', cycle_index 3, status 'missed' exist
When a second visit is inserted for the same patient with visit_type 'prescription', cycle_index 3, status 'planned', attempt_no 2
Then the insert succeeds
And the visits table contains exactly two rows for that (patient_id, 'prescription', 3)
```

### Scenario 3: A cancelled attempt plus a live one for the same cycle is accepted

§6.4: *cancelling does not cancel the obligation — the patient becomes a candidate again.*

```
Given the migration has been applied to an empty database
And a visit with visit_type 'prescription', cycle_index 3, status 'cancelled' exists for a patient
When a second visit is inserted for that patient with visit_type 'prescription', cycle_index 3, status 'planned'
Then the insert succeeds
```

### Scenario 4: General visits are unconstrained

`cycle_index IS NULL` is excluded by the index's `WHERE` clause. §3 states this is deliberate, not
an accident of NULL semantics — so it is asserted rather than assumed.

```
Given the migration has been applied to an empty database
And a general visit with cycle_index NULL exists for a patient
When a second general visit with cycle_index NULL is inserted for the same patient
Then the insert succeeds
And the visits table contains exactly two rows
```

### Scenario 5: A crashed plan run can be retried on the same date

§3: a `UNIQUE(target_day)` constraint *prevented* retries rather than enabling them — a run that
inserted its row and then crashed left `status='running'` occupying the slot forever.

```
Given the migration has been applied to an empty database
And a plan_runs row exists with run_date '2026-08-03' and status 'running'
When a second plan_runs row is inserted with run_date '2026-08-03' and status 'ok'
Then the insert succeeds
And the plan_runs table contains exactly two rows
```

### Scenario 6: Each CHECK constraint rejects a violating row and writes nothing

```
Given the migration has been applied to an empty database
When a row violating any one of the eight §3 CHECK constraints is inserted
Then the insert is rejected with a constraint violation
And that table's row count is unchanged
```

Run once per constraint, table-driven — eight cases, each naming the column and the offending
value. A geocode_status of `'unknown'`, a `birth_mmdd` of `'123'`, an `address_source` of `'api'`,
a `visit_type` of `'urgent'`, a visit `status` of `'done'`, a plan_run `status` of `'pending'`, a
recipient `status` of `'banned'`, a settings `tier` of `'derived'`.

### Scenario 7: The planner's view hides soft-deleted and un-geocoded patients

*"The planner reads through this and nothing else."* The filter is load-bearing, so it is exercised
rather than inferred from the DDL.

```
Given the migration has been applied to an empty database
And four patients exist: one with geocode_status 'ok', one 'manual', one 'pending', and one 'ok' with deleted_at set
When schedulable_patients is selected
Then exactly two rows are returned
And they are the 'ok' and 'manual' patients that are not soft-deleted
```

### Scenario 8: A visit referencing a patient that does not exist is rejected

D1 enforces foreign keys, so the harness runs with `PRAGMA foreign_keys = ON` and the `REFERENCES`
clauses are proven present rather than trusted.

```
Given the migration has been applied to an empty database with foreign key enforcement on
When a visit is inserted with a patient_id that matches no row in patients
Then the insert is rejected with a foreign key violation
And the visits table is empty
```

---

## Evidence

| Criterion | Method | Where |
|-----------|--------|-------|
| R1 · sixteen tables, as a set | `unit` | `tools/guards/schema-0001.test.ts` — `sqlite_master WHERE type='table'` |
| R2 · view enumerates columns | `unit` | Same — stored SQL contains 14 names, does not match `/SELECT\s+\*/i` |
| R3 · partial index clause | `unit` | Same — stored SQL of `uq_visits_cycle_live` |
| R4 · six named indexes | `unit` | Same — `sqlite_master WHERE type='index'` |
| R5 · eight CHECKs present | `unit` | Proven **behaviourally** by Scenario 6, not by string-matching the DDL |
| R6 · §3 fidelity, in order | `unit` | Same file — parses `docs/PLAN.md`, extracts the §3 `sql` fence, in-order containment |
| R7a · banned names confined to comments | `unit` | Same file — strip `--` comment lines, then assert none of the six appears in what remains |
| R7b · `patients` has exactly §3's columns | `unit` | `PRAGMA table_info(patients)` against an explicit 23-name list, both directions |
| Scenarios 1–8 | `unit` | Real inserts against an in-memory `node:sqlite` database, fresh per case |

Every criterion runs inside `pnpm test`. **No `manual`. No `inspection`. No mocks.**

Boundary and absence coverage, deliberately: Scenarios 2, 3, 4 and 5 all assert an **absence of
over-constraint** — each is the case a well-meaning later reader would "fix" by adding a table
constraint, and each would then fail. Scenarios 1, 6 and 8 assert that **nothing is written** when
a write is rejected, not merely that an error was raised.

---

## Explicitly not required

| Not required | Why / where it happens |
|--------------|------------------------|
| Applying the migration through `wrangler d1 migrations apply` | **T06.** `wrangler.toml` does not exist until T04, which is blocked behind manual T03 |
| Any assertion against real D1 | **T06** re-applies this file against Miniflare. See *Coverage carried forward* |
| Seed rows in `doctors`, `holidays`, `settings` | **T09.** `settings` ships empty; the structural/operational comment block is carried, the rows are not |
| The `d1_migrations` bookkeeping table | Created by wrangler at T06, not by this file |
| A `CHECK` enforcing `skip_reason` when `status = 'skipped'` | User decision, 2026-07-26 — §3 states it in a comment and enforcement lives in the application layer. See `plan.md` *Answered questions* |
| Removing `plan_runs`' redundant `UNIQUE(id)` | Carried verbatim; the spec wins. One unused autoindex |
| `row_version` optimistic-concurrency behaviour | Columns exist; nothing enforces them until §6.5 / Phase 6 |
| Idempotent re-application (`IF NOT EXISTS`) | Deliberately absent — a second application is a bug and must fail loudly |
| TypeScript types mirroring these tables | Phase 1, `packages/domain` |
| Rolling-28-day vs NHI-calendar-month (Q1) | **Phase 2.** Changes `respectsCap`, not this schema |
| The Google Maps ToS caching answer (T12) | `geocode_cache.fetched_at` already exists in §3 — **this migration does not change either way** |

---

## Needs a mock

**None.** No third party is touched. Nothing reaches the network. `node:sqlite` is built into Node
24 and requires no dependency.

## Manual checks

**None.** Every criterion is agent-provable.

---

## Coverage carried forward to T06

Stated here so it is not discovered as a surprise:

1. **`node:sqlite` is not D1.** SQLite 3.51.2 under Node, not Cloudflare's build. Partial indexes
   and views are core features present in every SQLite in service, but the engines are not
   identical.
2. **Wrangler's statement splitter has never seen this file.** `0001` is comment-dense, and
   `node:sqlite`'s `exec()` is not the same parser. If wrangler mangles a `--` run, this validation
   cannot see it. **T06's first act is applying this file for real**, which is where that gets
   proven.

## Notes

- Edge-case checklist: *invalid input* → Scenario 6; *failed retry* → Scenario 5; *empty state* →
  every scenario starts from an empty database; *concurrent change* → not applicable, `row_version`
  is unenforced until Phase 6; *sensitive data* → **R7**, mechanically enforced. *Expired*, *limit
  exceeded* and *unauthorised* have no surface in a schema migration.
- No fixture derives from `居家11506112.csv`. Every inserted row is synthetic and invented.
