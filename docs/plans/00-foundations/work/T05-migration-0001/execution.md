# Execution — T05 · Migration 0001

## Attempt 1 — 2026-07-26

**Agent** sonnet · **Outcome** complete (after one contract amendment mid-attempt)

### Changed

| File | Change |
|------|--------|
| `migrations/0001_initial_schema.sql` | **new** — §3 L143–427 copied byte-for-byte, plus a 3-line header naming the spec section. 16 tables, `schedulable_patients`, 6 named indexes, `uq_visits_cycle_live`, 8 CHECKs |
| `tools/guards/schema-0001.test.ts` | **new** — 32 cases covering R1–R7b and Scenarios 1–8. `node:sqlite`, one fresh `:memory:` database per case, `PRAGMA foreign_keys = ON` |
| `migrations/README.md` | edit — the closing line *"No migration is written by this task"* replaced with what `0001` is and how it is tested |

No configuration file was touched. `vitest.config.ts` and `tools/tsconfig.json` already covered
`tools/guards/**`, as the plan predicted.

### Checks

| Command | Result |
|---------|--------|
| `pnpm typecheck` | all 6 packages Done, 0 errors |
| `pnpm lint` | ESLint: No issues found |
| `pnpm test` | **93 passed (93)**, 5 files |
| `diff <(sed -n '143,427p' docs/PLAN.md) <(tail -n +5 migrations/0001_initial_schema.sql)` | **identical** — re-run by the harness, not taken from the agent |

All four re-run independently after the agent reported.

### The contract defect found at build

**R7 as frozen was unsatisfiable.** It banned the six excluded CSV column names outright; R6
mandates §3 verbatim; and §3 L155 is
`-- 身分證號, 性別, 主診斷, 照護階段, 機構簡稱 and 里 are NOT read and NOT stored (R13).` — the only
occurrence of any of them in the migration, present to **declare** the exclusion. No correct
implementation could satisfy both.

This was a defect in `acceptance.md`, not in the build. The agent refused both bad exits —
paraphrasing the comment, and special-casing the check to skip that line — and left 6 tests failing
with a written explanation. That is the behaviour the brief asks for, and the reason the *never
weaken a test* rule earns its place.

Amended on the user's decision, logged in `progress.md`, and **strictly stronger than what it
replaced**: R7a confines the six names to `--` comment lines; R7b asserts
`PRAGMA table_info(patients)` against a hardcoded 23-name list in both directions. Mutation 4 below
is the proof that mattered.

### Mutation testing — run by the harness, not by the agent

A green suite proves nothing until it has been seen to fail. Each mutation was applied to the
migration, the suite run, and the file restored and re-diffed against §3.

| Mutation | Went red | Reads as |
|----------|----------|----------|
| `uq_visits_cycle_live` loses its `WHERE` clause | **4** — R3, R6, **Scenario 2**, **Scenario 3** | The two absence-of-over-constraint scenarios fire exactly as designed. A plain table constraint is caught |
| `schedulable_patients` becomes `SELECT *` | 2 — R2, R6 | |
| `patients` grows a `里` column | 2 — R7a, R7b | |
| `patients` grows a `national_id` column | **1 — R7b only** | **The amendment justified.** The original substring ban would have caught nothing here; a real seventh column is named in English |
| One §3 comment paraphrased | 1 — R6 | Criterion 9 is a real assertion, not an inspection |
| `address_source` CHECK widened to accept `'api'` | 2 — R6, Scenario 6 `patients.address_source` | |

Scenario 4 correctly stayed green under mutation 1: SQLite treats NULLs as distinct in a unique
index, so general visits survive even a non-partial constraint. The test is right not to claim
otherwise.

One earlier probe — deleting the CHECK line outright — turned 26 tests red because it left a
trailing comma and broke the whole migration. A blunt red proves nothing about the specific guard,
so it was rerun surgically as the row above.

### Decided beyond the plan

Four, all cosmetic; **none changed the design**, so none is folded back into `plan.md`:

1. **Fixture values** — synthetic names (`測試患者`, `Dr. 測試醫師`) and dates. Nothing derives from
   or resembles `居家11506112.csv`, which no file here reads.
2. **Error-message matching** — `.toThrow(/constraint/i)` and `.toThrow(/foreign key/i)` rather than
   a bare `.toThrow()`, after probing what `node:sqlite` actually raises. Stricter than specified.
3. **R6 fence extraction** — first `` ```sql `` fence to the next closing fence, non-empty lines,
   strict in-order `indexOf` scan. Verified by the harness: line 142 is the first `` ```sql `` in
   `docs/PLAN.md` and closes at 428, so R6 extracts §3 and nothing else — a smaller block matching
   by accident was the failure mode worth ruling out.
4. **R7a strips whole `--` lines only** — no inline-comment handling, no SQL parser. The migration
   has no inline `--` comments. Recorded because it is a real limit: a banned name in a trailing
   comment after DDL would not be caught.

### Not done

Nothing in scope. Everything under `acceptance.md`'s *Explicitly not required* stayed unwritten —
no seed rows, no `wrangler.toml`, no `d1_migrations`, no TypeScript types.

**Validation has not run.** Executed is not working.
