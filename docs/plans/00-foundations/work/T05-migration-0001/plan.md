# Implementation plan — T05 Migration 0001, the full §3 schema

**Task** [`../../tasks/T05-migration-0001.md`](../../tasks/T05-migration-0001.md) · **Spec** `docs/PLAN.md` §3 (L142–428), §11.4
**Written** 2026-07-26 · **Revision** 1

## What exists now

**No SQL exists anywhere in the repo.** T05 writes the first.

| Fact | Where | Consequence for this task |
|------|-------|---------------------------|
| `migrations/` holds only `README.md` | `migrations/README.md` | Its closing line — *"No migration is written by this task. Migration `0001` arrives with T05"* — becomes false and must be updated |
| `migrations/` is deliberately **not** a pnpm workspace member | `pnpm-workspace.yaml:2-4`, T01 acceptance R3 | A test file placed there would have no `tsconfig`, no type resolution and no lint coverage. The test cannot live next to the migration |
| Vitest include list is closed | `vitest.config.ts:11-15` — `packages/*/src/**`, `apps/api/src/**`, `tools/guards/**` | `tools/guards/**` is the only included path outside a package `src/` tree |
| `tools/` is a workspace member, `include: ["guards"]`, `types: ["node"]` | `tools/tsconfig.json`, `tools/package.json` | A test at `tools/guards/*.test.ts` typechecks, lints and runs with **zero config change** |
| `node:sqlite` is unflagged and typed | Node 24.14.1 · SQLite 3.51.2 · `@types/node` 24.13.3 exports `DatabaseSync` | Verified by probe: `sqlite_master` preserves both the partial index's `WHERE` clause and the view's enumerated column list |
| Four guards already live in `tools/guards/` | `scaffold`, `workspace-imports`, `scheduler-purity`, `date-ban` | Sets the file naming and test style this one copies |

**T04 does not exist**, so `wrangler.toml` does not exist, so the task file's stated proof
(`wrangler d1 migrations apply wherego --local`) cannot run. That is what question 1 below settles.

## Approach

### The migration is a verbatim copy of §3, in §3's own order

§3's statement order is already dependency-correct — `doctors` before `visits` references it,
`patients` before the view selects from it, `line_recipients` before `line_sessions` references it —
so **nothing is reordered and nothing is rewritten.** The file is §3's fenced SQL block with one
added header comment naming the spec section it came from.

This is not laziness, it is the point of criterion 9. The comments in §3 are the reason the schema
looks the way it does; the task file quotes two of them at length precisely because paraphrasing
them turns a defended decision into an arbitrary preference that the next reader optimizes away.

**No `IF NOT EXISTS`, anywhere.** Wrangler records applied migrations in `d1_migrations`; a second
application is a bug and must fail loudly rather than silently no-op.

### Decisions taken, with the alternative that lost

**`plan_runs` keeps its redundant `UNIQUE(id)`** alongside `id TEXT PRIMARY KEY`. It creates a
second autoindex that buys nothing. Carried anyway: *the spec wins* is a standing rule, the cost is
one unused index, and deviating from §3 inside migration 0001 puts the database and the
specification in disagreement on the first day of the project — after which every later reader has
to work out which one is authoritative. Rejected alternative: drop it and amend §3. Worth doing
someday; not worth doing as an uninstructed side effect of T05.

**`skip_reason` gets no CHECK constraint** — user decision, 2026-07-26, recorded below.

**The test harness runs with `PRAGMA foreign_keys = ON`.** D1 enforces foreign keys, so the
insert-driven criteria must run against parent rows that actually exist rather than orphans. The
fidelity direction is the safe one: if D1 turned out to be laxer than this, the test is merely
stricter than production, never looser.

### Criterion 9 is made mechanical rather than left to inspection

*"The migration's comments match §3's, not a paraphrase"* reads like an `inspection` criterion, and
`CONVENTIONS.md` warns that more than a couple of those means the task is not testable as written.
It does not have to be one.

The test parses `docs/PLAN.md`, extracts the §3 fenced `sql` block, and asserts that **every
non-empty line of it appears in the migration file, in order.** A paraphrased comment fails. A
dropped `CHECK` fails. A reordered statement fails. And it self-maintains: a later edit to §3 that
is not mirrored into a migration breaks the build, which is exactly the expand-only discipline §11.4
asks for.

### Why `sqlite_master`, not the file

Every structural criterion asserts against `sqlite_master` / `PRAGMA` **after applying the
migration**, never by reading the `.sql`. The file is what was written; the schema is what was
created, and the partial index's `WHERE` clause is precisely the thing that can be silently dropped
in between. The probe confirms SQLite stores it verbatim — so if it is ever absent, that is a real
finding and not a limitation of the assertion.

## Changes

| # | File | Change | Why |
|---|------|--------|-----|
| 1 | `migrations/0001_initial_schema.sql` | **new** — §3's SQL block verbatim, plus a two-line header naming §3 | The deliverable |
| 2 | `tools/guards/schema-0001.test.ts` | **new** — applies the migration to an in-memory `node:sqlite` DB and asserts structure, behaviour and §3-fidelity | The only proof available before T06 |
| 3 | `migrations/README.md` | edit — replace *"No migration is written by this task…"* with what `0001` is and how it is tested | It is now a false statement, and stale docs in the first migration directory set the tone for every later one |

Ordered so the repo is coherent after each step: 1 alone is a valid tracked artifact; 2 fails
without 1; 3 is documentation of both.

## Interfaces

**Migration path** `migrations/0001_initial_schema.sql` — wrangler's `NNNN_description.sql`
convention, which `wrangler d1 migrations apply` sorts lexicographically.

**Schema** — copied from `docs/PLAN.md` §3 L142–428. Not retyped here; the spec is the interface.
What the migration must contain, as a checklist for the builder:

- **16 tables** — `doctors`, `patients`, `visits`, `plan_days`, `plan_runs`, `csv_imports`,
  `geocode_cache`, `line_recipients`, `doctor_absences`, `line_events`, `road_distances`,
  `deploys`, `line_sessions`, `holidays`, `settings`, `audit_log`
- **1 view** — `schedulable_patients`, 14 columns enumerated, no `SELECT *`
- **6 named indexes** — `idx_patients_sched`, `idx_patients_dupe`, `idx_visits_day`,
  `idx_visits_patient`, `idx_visits_cycle`, `idx_plan_runs_date`
- **1 partial unique index** — `uq_visits_cycle_live`, with
  `WHERE cycle_index IS NOT NULL AND status IN ('planned','completed')`
- **8 CHECK constraints** — `patients.geocode_status`, `patients` `length(birth_mmdd) = 4`,
  `patients.address_source`, `visits.visit_type`, `visits.status`, `plan_runs.status`,
  `line_recipients.status`, `settings.tier`

**Test harness** `tools/guards/schema-0001.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';

function freshDb(): DatabaseSync;   // :memory:, PRAGMA foreign_keys = ON, migration applied
function objectSql(db, name): string | null;   // sqlite_master.sql for one object
```

Every test builds its own database. No shared state between cases — a `CHECK` test that leaves a
half-inserted row behind would make the next test's failure unattributable.

## Tests

`tools/guards/schema-0001.test.ts`, one group per acceptance criterion.

| # | Criterion | How it is proven |
|---|-----------|------------------|
| 1 | 16 tables exist | `sqlite_master WHERE type='table'`, compared as a **set** against the expected 16 — asserts both directions, so an extra table is a failure too |
| 2 | View enumerates columns | `objectSql('schedulable_patients')` contains all 14 column names and **does not match** `/SELECT\s+\*/i` |
| 3 | `uq_visits_cycle_live` is partial | Its stored SQL contains the exact `WHERE cycle_index IS NOT NULL AND status IN ('planned','completed')` clause |
| 4a | Two `planned` rows, same `(patient, 'prescription', k)` → **rejected** | Real inserts; the second throws `SQLITE_CONSTRAINT` |
| 4b | A `missed` row **plus** a `planned` row, same triple → **accepted** | Real inserts, both succeed. **This is the direction a table constraint would break** (§5.1, §6.4) — and per §3's own comment, the reason the index is partial at all |
| 5 | Two `plan_runs` with the same `run_date` | Both inserts succeed — proves the absent `UNIQUE(target_day)`, which §3 explains *prevented* retries |
| 6 | Two `general` visits, same patient, `cycle_index IS NULL` | Both succeed — the `WHERE` clause excludes them, deliberately and not by NULL accident |
| 7 | 8 CHECKs present | One violating insert per constraint, each asserted to throw. Table-driven |
| 8 | 6 named indexes exist | `sqlite_master WHERE type='index'`, by name |
| 9 | Comments match §3, not a paraphrase | Parse `docs/PLAN.md`, extract the §3 `sql` fence, assert every non-empty line appears in the migration **in order** |

Criteria 4b, 5 and 6 are the three that matter most: each proves an *absence* of over-constraint,
and each is the case a well-meaning later reader would "fix" by adding a table constraint.

## Risks

| # | Risk | What catches it |
|---|------|-----------------|
| 1 | **`node:sqlite` is not D1.** SQLite 3.51.2 under Node, not Cloudflare's build | Stated as a coverage gap, closed at T06 against real Miniflare D1. Core features only — partial indexes and views predate every SQLite version in service |
| 2 | **Wrangler's statement splitter has never seen this file.** `0001` is comment-dense; a splitter that mishandles `--` runs could mangle it. `node:sqlite`'s `exec()` is not the same parser | Unprovable here. Explicit coverage gap for T06, whose first act is applying this file for real. Noted in `migrations/README.md` |
| 3 | Criterion 9's in-order line match is brittle against innocent whitespace edits to §3 | Deliberate. Brittleness in the direction of *noticing* is the intent; the fix is one line, and the failure mode it prevents is a silently diverged schema |
| 4 | `node:sqlite` prints an `ExperimentalWarning` to stderr on every run | Cosmetic. Not suppressed — a suppressed warning is one nobody re-evaluates when the API changes |
| 5 | FK enforcement differs between `node:sqlite` (off by default) and D1 (on) | Harness sets `PRAGMA foreign_keys = ON` explicitly, and inserts real parent rows |

## Answered questions

- **2026-07-26 · The task's stated proof needs `wrangler.toml`, which T04 has not written and which
  is blocked behind manual T03. How is the schema proven?** Apply it to an in-memory database via
  Node 24's built-in `node:sqlite` and assert against `sqlite_master`/`PRAGMA`; re-verify against
  real D1 at T06. No new dependency, no wrangler, runs inside `pnpm test` today. The two coverage
  gaps this leaves — a different SQLite build, and wrangler's own statement splitter — are recorded
  rather than glossed. Rejected: waiting for T03/T04, which stalls the only unblocked agent task on
  the board behind a dashboard visit; and `better-sqlite3`, a native module that trips pnpm 11's
  build-script approval gate T10 already carries a criterion for. (user)

- **2026-07-26 · §3 declares `skip_reason TEXT, -- required when status = 'skipped'` — a
  requirement stated in a comment with nothing enforcing it. Add a CHECK, given that adding one
  later is a full table rebuild under expand-only?** No. The migration stays a verbatim copy of §3.
  Enforcement lives in the application layer alongside R1–R16, where it can produce a real error
  message rather than an opaque constraint failure. Deviating from the spec in migration 0001 means
  the database and §3 disagree from day one. (user)

## Out of scope

| Excluded | Where it is actually done |
|----------|---------------------------|
| Seed rows — `doctors`, `holidays`, `settings` | **T09.** `settings` ships empty; §3's structural/operational comment block is carried, the rows are not |
| Applying the migration to remote D1 | **T18** |
| Applying it through wrangler at all, and the `d1_migrations` bookkeeping table | **T06**, which is the local loop and the first real application |
| `wrangler.toml`, the D1 binding, `database_id` | **T04** |
| Any `packages/domain` type mirroring these tables | Phase 1 |
| Q1 — rolling 28-day window vs NHI calendar month | **Phase 2.** It changes `respectsCap`, not this schema |
| The Google Maps ToS caching answer | **T12.** `geocode_cache.fetched_at` already exists in §3, so whichever way it lands, **this migration does not change** |
