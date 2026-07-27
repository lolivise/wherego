# Fix 01 — T05 Migration 0001

**Against** [`validation-01.md`](validation-01.md) · **Date** 2026-07-26 · **Agent** sonnet

**`migrations/0001_initial_schema.sql` was not touched.** sha1 `c668e492242e9c7bfa1d0022db2aced48b0ae6e5`
before and after, and still byte-identical to `docs/PLAN.md` §3 — re-verified by the harness after
every mutation probe. Every bug in validation-01 was in the guard, so every fix is in the guard.

| Bug | Verdict | Fix |
|-----|---------|-----|
| **B1** HIGH · R6 fence unanchored | **fixed** | `schema-0001.test.ts` — extraction anchors on the `## 3. Data model` heading, then takes the fence after it. Plus two sanity assertions: the block must exceed 200 lines and must contain **both** `CREATE TABLE doctors (` and `CREATE TABLE audit_log (` — start and end sentinels, so a truncated or wrong block cannot pass quietly |
| **B2** MEDIUM · additions undetected | **fixed** | Two new groups. **B2a** asserts the whole `sqlite_master` object set — 16 tables + 1 view + 7 indexes, as `type:name` tuples so a same-named object of a different type also fails, both directions, `sqlite_autoindex_*` excluded. **B2b** asserts `PRAGMA table_info` column sets for the other fifteen tables, both directions, hand-transcribed from §3 |
| **B3** MEDIUM · duplicate-line misreport | **fixed** | The cursor-advancing `indexOf` scan is gone. R6 now asserts §3's raw block — blank lines included — is a **contiguous substring** of the migration, and on failure walks forward from §3's first line to report the first genuinely differing line with 1-indexed positions in both files |
| **B4** LOW · false rationale comment | **fixed** | The claim that the migration has no inline `--` comments is deleted (there are 64). `stripCommentLines` now truncates each line at its first `--`, covering trailing comments too. Verified no `--` occurs inside a string literal, so no SQL parser is needed |

## Rejected, in writing

Recorded so the next validation does not re-report them:

- **`plan_runs.error_text` unenforced when `status='failed'`; boolean `INTEGER` columns with no
  `CHECK (x IN (0,1))`; JSON `TEXT` columns with no `json_valid()`.** All three are documented in
  §3's prose and absent from §3's DDL. **The migration is a verbatim copy and that is the task.**
  Adding a constraint §3 does not have would put the database and the specification in disagreement
  from migration 0001 — the same argument that kept `plan_runs`' redundant `UNIQUE(id)` and refused
  a `skip_reason` CHECK. Not defects in T05.
- **Scenario 4 is not load-bearing against a mis-scoped plain `UNIQUE`.** True, found independently
  by two lenses, and *correct as written* — `acceptance.md` states Scenario 4's purpose accurately and
  R3 carries the mechanical proof. Recorded, not changed.

## Carried forward — findings about §3, not about T05

Neither is actionable here; both belong to the phase that owns the importer.

- `csv_imports.status` has no `CHECK` while every other status column in the schema does.
  `line_sessions.awaiting`, `doctors.working_days` and `patients.geocode_confidence` are the same
  shape. **Phase 1.**
- `NOT NULL` columns accept `''`. §3 specifies no length check; the CSV importer is the real write
  path. **Phase 1.**

## Fail-then-pass evidence — re-run by the harness, not taken from the agent

The four mutations that passed **green at 32/32** before this fix:

| Mutation | Before | After |
|---|---|---|
| extra column `phone_number` on `doctors` | 32 passed | **2 failed** (B2b + R6) |
| extra index `idx_doctors_active` | 32 passed | **1 failed** (B2a) |
| extra view `leaky AS SELECT * FROM patients` | 32 passed | **1 failed** (B2a) |
| extra trigger on `doctors` | 32 passed | **1 failed** (B2a) |

R6 correctly stays green for the appended index, view and trigger — appending after §3's block does
not break contiguous containment, and B2a is the assertion that owns those. The extra *column* trips
both, because it also breaks byte-identity with §3.

**B3** — mutating `plan_days`' `PRIMARY KEY (doctor_id, day)` while leaving the identical
`doctor_absences` line intact now reports:

```
first differing line — docs/PLAN.md:264: "  PRIMARY KEY (doctor_id, day)"
first differing line — migration:126:    "  PRIMARY KEY (doctor_id)"
```

The actual mutated line, in both files. Previously it blamed
`-- One row per job invocation (§5.3)…`, several hundred lines away.

**B1** — an illustrative `` ```sql `` fence inserted into a *scratch copy* of `docs/PLAN.md` above §3
(the real spec was never edited):

```
old logic → fence at line 142 | extracted 2 lines   | >200? false | audit_log sentinel? false
new logic → fence at line 149 | extracted 285 lines | >200? true  | audit_log sentinel? true
```

The old extraction collapses to a two-line stub and would have passed against any migration. The
anchored one is unaffected, and the two sanity assertions catch it even if the anchor ever fails.

## Checks

| Command | Result |
|---------|--------|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm test` | **110 passed (110)** — up from 93. The guard file went 32 → 49; all 32 originals retained and passing |
| `diff` migration vs §3 | identical |

## Re-validation

Handed back to `/validate-task` as **attempt 2**. The highest-risk new content is B2b's fifteen
hand-transcribed column lists — a wrong list enshrines an error permanently and passes forever, so
one validation lens is pointed at exactly that.
