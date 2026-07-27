# Validation 01 — T05 Migration 0001

**Verdict** BUGS FOUND (1 HIGH, 2 MEDIUM, 1 LOW) · **Date** 2026-07-26 · **Attempt** 1

Three agents, three lenses, none shown `execution.md`. **The migration itself is not in question — every
finding below is in the guard that protects it.** Two independent lenses confirmed the schema is
byte-identical to §3 and behaves correctly as a running database; the third found that the suite
proving it is weaker than it looks.

## What was run

| | |
|---|---|
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | clean · clean · **93 passed (93)** — re-run by the harness, not taken from any agent |
| `diff <(sed -n '143,427p' docs/PLAN.md) <(tail -n +5 migrations/0001_initial_schema.sql)` | **identical**. Independently reproduced by two agents, one using `awk` + `cmp` (MD5 `ea03f51e…` both sides) |
| Mutation testing | 13 mutations across three operators. 7 by the harness, plus the agents' own |
| Third parties | **None touched.** No mock needed, none built |
| `wrangler d1 migrations apply` | **Not run** — `wrangler.toml` is T04, blocked behind manual T03. Known and accepted |

Concurrency hazard caught mid-run: two agents were mutating `0001_initial_schema.sql` in place
simultaneously. Both were redirected to scratch copies and given the canonical sha1s to verify
against before reporting. Both confirmed a clean tree at the end; the harness re-verified with
`shasum` and `diff`.

### Acceptance criteria

| | Criterion | | Evidence |
|---|---|---|---|
| R1 | sixteen tables, both directions | ✅ | Dropping `audit_log` → red; adding a 17th → red |
| R2 | view enumerates 14 columns, no `SELECT *` | ✅ | **A 13-column view that avoids `SELECT *` also fails** — not the weak proxy it could have been |
| R3 | partial index `WHERE` clause | ✅ | Removing the clause → red |
| R4 | six named indexes | ✅ | Dropping `idx_visits_cycle` → that case red, other five green |
| R5 | eight CHECKs | ✅ | Each removed individually → its Scenario 6 case red. §3 has exactly eight; verified by grep |
| R6 | §3 fidelity, in order | ⚠️ | Passes, and catches every single-line edit tried — **but see B1 and B3** |
| R7a | banned names confined to comments | ✅ | A column named `身分證號` outside a comment → red. **But see B4** |
| R7b | `patients` has exactly 23 columns | ✅ | List hand-checked against §3 by two agents. 24th → red; removing `notes` → red |
| S1–S8 | all eight scenarios | ✅ | Converting the partial index to a plain table constraint turns **S2 and S3** red, which is the defect they exist for |

Every criterion was proven **falsifiable by mutation**, not by the existence of a test bearing its
name.

### The schema exercised as a database, not read as a document

The full non-happy-path history is representable simultaneously: cycle 1 completed; cycle 2 planned
→ missed → re-planned as attempt 2 → completed; cycle 3 planned → cancelled → re-planned. Five rows
coexisting is exactly what §5.1 and §6.4 require and what a plain table constraint would forbid.
Re-proposing a live obligation is rejected; the same re-proposal succeeds once the earlier row is
`missed`. A crashed `running` row accepts a retry on the same `run_date`. All five of §3's
`REFERENCES` clauses bite under `PRAGMA foreign_keys = ON`. `cycle_index = 0` is correctly treated
as present, not as absent — the NULL-vs-zero trap did not land.

---

## Bugs

### B1 · HIGH · R6 selects the first `` ```sql `` fence in the document, unanchored

**Where** `tools/guards/schema-0001.test.ts:301-304`

**Reproduce** — copy `docs/PLAN.md` to a scratch path, insert any `` ```sql `` fence before `## 3.
Data model`, then run R6's extraction logic against the scratch copy and the **real, correct**
migration:

```
fence found at line 142 — extracted 2 lines:
["CREATE TABLE doctors (",");"]
R6 verdict against the REAL, correct migration: PASS
```

**Expected / actual** R6 should verify the migration against §3. It verifies it against whichever
`` ```sql `` fence appears first, with no anchor to the section, no uniqueness check, and no
minimum-size sanity check. Today §3's fence is the first one, so it works — by luck of document
order, not by construction.

**Why it matters** Adversarial testing established that **R6 is doing most of the real work.** Every
single-line schema edit tried — a `REAL`→`TEXT` column type, a dropped `NOT NULL`, a changed
`DEFAULT`, an index built on the wrong columns under the right name, a `PRIMARY KEY` losing a
column — is caught by R6 and by *nothing else*. One innocuous future edit to the spec, adding an
illustrative SQL example anywhere above §3, silently reduces R6 to validating a two-line stub and
takes all of that protection with it. The suite stays green. It is a silent failure of the guard
that everything else leans on, which is why this is HIGH rather than a latent nicety.

**Fix direction** Anchor extraction to the `## 3. Data model` heading, and assert the extracted
block both exceeds a sane minimum length and contains a sentinel from the end of §3 (e.g.
`CREATE TABLE audit_log (`). A guard that cannot tell it is guarding the wrong thing is not a guard.

### B2 · MEDIUM · Nothing detects an *added* schema object

**Where** `tools/guards/schema-0001.test.ts` — absence, not a line

**Reproduce** — each of these, applied to the migration, leaves the **real suite fully green at
32/32**:

| Mutation | Result |
|---|---|
| extra column `phone_number` on `doctors` | `Tests 32 passed (32)` |
| extra index `idx_doctors_active` | `Tests 32 passed (32)` |
| **extra view `leaky AS SELECT * FROM patients`** | `Tests 32 passed (32)` |
| extra trigger on `doctors` | `Tests 32 passed (32)` |

**Expected / actual** R1 compares tables in both directions and R7b compares `patients`' columns in
both directions. Nothing else does. R4 asserts its six indexes *exist*, never that there are only
six. R2 inspects only the view *named* `schedulable_patients`. No test looks at triggers at all.
**Fifteen of the sixteen tables have no column-set protection.**

**Why it matters** Two of these are not hypothetical. A view doing `SELECT * FROM patients` is
precisely what §3's comment on `schedulable_patients` exists to forbid, and it can be added without
a single test noticing. An extra column on `visits` or `plan_days` is how the six-columns rule
erodes — R7b guards `patients`, which is the right table to guard first, but a seventh column of
patient data could equally arrive on `visits`. And under the expand-only rule (§11.4), a column that
gets added unnoticed is expensive to remove later.

**Fix direction** Assert the complete `sqlite_master` object set — `SELECT type, name FROM
sqlite_master` compared both directions against an expected list, which catches extra indexes,
views, triggers and tables in one assertion. Then extend the R7b column-set treatment to the
remaining fifteen tables.

### B3 · MEDIUM · R6's in-order scan can be absorbed by a duplicate line and then misreport

**Where** `tools/guards/schema-0001.test.ts:311-320`

**Reproduce** §3 contains two pairs of identical lines, confirmed:

```
  PRIMARY KEY (doctor_id, day)      → plan_days, and doctor_absences
  route_km        REAL,             → plan_days, and plan_runs
```

Mutate `plan_days`' `PRIMARY KEY (doctor_id, day)` to `PRIMARY KEY (doctor_id)`. The suite does go
red — but R6 reports the missing line as
`-- One row per job invocation (§5.3). A run commits one or more days.`, which is not the line that
changed and points at the wrong table.

**Expected / actual** `indexOf(expectedLine, cursor)` skips past the mutated copy, matches the
surviving duplicate several hundred lines later, races the cursor forward, and fails somewhere
unrelated.

**Why it matters** No false pass today — but whoever debugs this failure is sent to the wrong
statement in a schema where every table's shape is load-bearing. It is also one coincidental
duplicate away from a genuine false pass, and §3 will accumulate more duplicate lines as it grows.

**Fix direction** The migration is supposed to be byte-identical, so the line-by-line scan is
weaker than the requirement. Assert §3's block is a **contiguous substring** of the migration and
report the first differing line. That is simpler, strictly stronger, and eliminates this bug by
construction. Keep blank lines rather than filtering them.

### B4 · LOW · R7a's own rationale comment is factually wrong

**Where** `tools/guards/schema-0001.test.ts:335-343`

**Reproduce** The comment reads *"the migration in this repo has no inline `--` comments to strip."*
`grep -cE '^[^-].*--' migrations/0001_initial_schema.sql` → **64**.

**Expected / actual** `stripCommentLines` removes only lines *beginning* with `--`, so 64 lines of
trailing commentary are treated as executable DDL. No false pass today, because no banned string
currently sits in a trailing comment.

**Why it matters** Two ways. A future trailing comment containing one of the six names causes a
**false failure** — and `里` is the standard Taiwanese village/neighbourhood unit, genuinely likely
to appear in future address commentary. Worse, the false rationale is exactly what a future
maintainer would read when deciding whether the parser needs tightening, and it tells them not to
bother.

---

## Not bugs, but worth saying

- **Scenario 4 is not load-bearing, and two lenses found this independently.** Because SQLite treats
  NULLs as pairwise-distinct under `UNIQUE`, two `general` visits insert fine even under a
  mis-scoped plain constraint — so Scenario 4 passes either way. This is not a defect: `acceptance.md`
  states Scenario 4's purpose correctly, and R3 carries the actual mechanical proof. Recorded so
  nobody later mistakes it for the guard that Scenarios 2, 3 and 5 are.
- **The four success-asserting scenarios all survive deleting `uq_visits_cycle_live` outright.** An
  absent constraint permits everything. The rejection-asserting scenarios (1, 6, 8) and R3 are what
  catch a missing index. Correctly understood in the contract already.
- **`plan_runs.error_text`, boolean `INTEGER` columns with no `CHECK (x IN (0,1))`, and JSON `TEXT`
  columns with no `json_valid()`** — all documented in §3's prose and unenforced in its DDL. **Rejected
  as bugs against T05:** the migration is a verbatim copy, and copying faithfully is the task. Adding
  a constraint §3 does not have would put the database and the spec in disagreement.

## Carried forward — findings about §3 itself, not about T05

- **`csv_imports.status` has no `CHECK`, while every other status column in the schema does** —
  `patients.geocode_status`, `visits.status`, `plan_runs.status` and `line_recipients.status` are all
  constrained; `csv_imports.status` (`parsed | saved | abandoned`) is not. Same for
  `line_sessions.awaiting`, `doctors.working_days` and `patients.geocode_confidence`. Verified: §3
  contains exactly eight CHECKs. This is an asymmetry in the specification. **Phase 1 owns
  `csv_imports`** and should decide there whether it is deliberate.
- **`NOT NULL` columns accept the empty string.** `patients.name` and `patients.address_raw` both
  take `''`. §3 specifies no length check. The real write path is the CSV importer, so **Phase 1** is
  where an empty name must be rejected — R7 already makes 出生日期 and the other three required.

## Coverage gaps

1. **`node:sqlite` is not D1.** SQLite 3.51.2 under Node, not Cloudflare's build. Core features only,
   but the engines are not identical.
2. **Wrangler's statement splitter has never seen this file.** `0001` is comment-dense and
   `node:sqlite`'s `exec()` is a different parser. **T06's first act is applying this file for real**,
   and that is where it gets proven.
3. **R7's residual clause — "no real name, address or patient value anywhere in the file" — has no
   automated check** and was confirmed by reading. The evidence table does not claim otherwise.
4. **The true coverage boundary is B2's list**, and until B2 is fixed it belongs here: extra columns
   on fifteen of sixteen tables, extra indexes, extra views and any trigger are all invisible to this
   suite.
