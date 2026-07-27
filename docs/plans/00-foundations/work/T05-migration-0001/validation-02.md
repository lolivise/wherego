# Validation 02 — T05 Migration 0001

**Verdict** PASS WITH NOTES (0 HIGH, 0 MEDIUM, 2 LOW — one corrected, one accepted) · **Date** 2026-07-26 · **Attempt** 2

Two agents, two lenses: one doing nothing but checking the fix's hardcoded lists against §3 by hand,
one attacking the fix for defects it introduced. **All four bugs from validation-01 confirmed fixed
by independent attack, not by inspection.**

## What was run

| | |
|---|---|
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | clean · clean · **110 passed (110)**, re-run by the harness |
| `diff` migration vs `docs/PLAN.md` §3 | **identical** — unchanged throughout the fix, sha1 `c668e492…` |
| Mutation testing | ~25 mutations across both lenses plus the harness's own, all on `/tmp` copies or an isolated repo mirror |
| Tree state | `git status --short` identical before and after, both agents |

## Re-check of every bug from validation-01

| | | |
|---|---|---|
| **B1** HIGH · fence unanchored | **fixed** | The original attack no longer moves the extraction. A variant I had not considered was also tried — a **duplicate `## 3. Data model` heading** placed earlier with its own short fence. `findIndex` does take the first heading, but the `>200`-line and dual-sentinel checks then fail loudly on the stub, and containment fails independently. No false pass in either variant |
| **B2** MEDIUM · additions undetected | **fixed** | Extra column on a non-`patients` table → B2b; on `patients` → R7b; extra index → B2a; extra trigger → B2a; a table made by `CREATE TABLE … AS SELECT` → R1 and B2a. **All caught independently of R6** |
| **B3** MEDIUM · duplicate-line misreport | **fixed** | The verdict is now computed by `.includes()`, so it cannot be wrong. The `plan_days` PK mutation names the true line. See N2 for a narrower residue in the *diagnostic* |
| **B4** LOW · false rationale comment | **fixed**, then corrected again — see N1 |

## The hardcoded lists — the fix's own biggest risk

A wrong hardcoded list passes forever and looks authoritative. All three categories were transcribed
from §3 **by hand, independently**, and diffed against the literals — deliberately *not* derived from
the migration or from `PRAGMA`, which would only have proven the two agree.

- **Fifteen `PRAGMA table_info` lists** — `doctors` 7, `visits` 20, `plan_days` 9, `plan_runs` 18,
  `csv_imports` 13, `geocode_cache` 7, `line_recipients` 11, `doctor_absences` 3, `line_events` 2,
  `road_distances` 5, `deploys` 5, `line_sessions` 5, `holidays` 2, `settings` 3, `audit_log` 7.
  **All correct.** No missing name, extra name, typo or transposition.
- **The `sqlite_master` object set** — 16 tables + 1 view + 7 indexes = 24. Correct; §3 contains
  exactly those seven index statements and no trigger.
- **R7b's 23 columns for `patients`** — re-checked, correct.

Load-bearing in both directions: add-and-remove probes on five tables, ten mutations, all fired.

## Findings

### N1 · LOW · The replacement rationale comment carried a wrong count — **corrected**

**Where** `tools/guards/schema-0001.test.ts:380`

B4 was a rationale comment that was false about the migration. Its replacement said the file has
**64** lines with a trailing `--` comment. The true figure is **57**.

**The error was mine, not the fix agent's.** I measured it with `grep -cE '^[^-].*--'`, which also
counts indented whole-line comments because their first character is a space rather than a dash, and
I passed 64 into the fix brief. Confirmed independently three ways: 57 lines have code before a
trailing `--`, 7 are indented pure comments, 57 + 7 = 64.

**Corrected in place after the lens reported**, because it is a comment-only change with no logic and
because leaving a wrong number inside the comment that exists to replace a wrong number is not a
defensible thing to ship. Re-verified after the edit: the count now matches the file, the comment's
other claim — that no `--` appears inside a string literal — still holds, and the suite is 110 green.
`validation-01.md` keeps the original 64 as the record of what was found at the time.

### N2 · LOW · R6's failure diagnostic can point at the wrong line — **accepted, not fixed**

**Where** `tools/guards/schema-0001.test.ts:344-361`, the `if (!contained)` block

`migrationLines.indexOf(anchorLine)` takes the *first* occurrence of §3's opening line. If that exact
line were ever duplicated earlier in the migration, the diff message would anchor on the decoy and
report an unrelated location.

**The verdict is never affected** — `contained` comes from `.includes()`, so this cannot produce a
false pass. It degrades only the error message, and only during a failure.

Accepted rather than fixed: the precondition is duplicating one distinctive comment line
(`-- Single doctor today, modelled as a table so a second one is a data change.`) inside a file that
is asserted byte-identical to §3, so it cannot arise without §3 itself changing first. Recorded so a
future reader knows the residue exists rather than rediscovering it.

## The coverage boundary — the most useful output of this run

Every mutation was run against all 42 independent checks. The column that matters is the second one.

| Mutation | Caught by | Survives R6 being disabled? |
|---|---|---|
| Column TYPE changed (`REAL`→`TEXT`) | R6 only | **Yes — undetected** |
| `NOT NULL` dropped | R6 only | **Yes — undetected** |
| `DEFAULT` changed | R6 only | **Yes — undetected** |
| CHECK value list **widened** | R6 only | **Yes — undetected** |
| Index on wrong columns, right name | R6 only | **Yes — undetected** |
| `PRIMARY KEY` narrowed | R6 only | **Yes — undetected** |
| Column reordered within a table | R6 only | **Yes — undetected** |
| View's `WHERE` changed | R6, **Scenario 7** | No |
| Foreign key removed | R6, **Scenario 8** | No |
| Index renamed | R6, **R3, B2a** | No |

**Roughly half of these are caught by R6 and nothing else.** B2a/B2b/R7b are a strong independent net
for *added or missing* objects and columns, but they say nothing about a column's type, default or
nullability, nor about an index's actual key list. And Scenario 6 proves only that the *old* invalid
values are still rejected — **nothing proves the allowed set is exactly the intended one**, which is
why a widened CHECK slips past everything but R6.

That is a defensible design — the contract chose byte-identity with §3 as the backstop and made
B2a/B2b additive — but it means **R6 must never be weakened.** Loosening it to ignore whitespace, or
scoping it to part of §3, would silently reopen all seven rows above. Worth a comment on R6 itself
before someone "simplifies" it.

## Not bugs

- **`CREATE TEMP VIEW` is invisible** to every structural check — temp objects live in
  `sqlite_temp_master`. Real but negligible: temp objects do not persist across connections, and a
  migration has no reason to create one. Noted for completeness.
- **Naming an object `sqlite_autoindex_evil` to dodge B2a's filter is not exploitable** — SQLite
  refuses any `sqlite_`-prefixed name outright, so the migration fails to load and every check fails
  loudly. Likewise a name collision across object types is impossible; SQLite raises "already
  exists". Both hypotheses tested and closed.
- **Standing rules** — fixtures synthetic and confirmed clean; `patients` has exactly §3's 23 columns
  with R7a/R7b enforcing the six-columns rule mechanically; expand-only not implicated in an initial
  migration.

## Coverage gaps

1. **`node:sqlite` is not D1.** SQLite 3.51.2 under Node, not Cloudflare's build.
2. **Wrangler's statement splitter has never seen this file** — `0001` is comment-dense and
   `exec()` is a different parser. **T06 applies it for real**, and that is where this closes.
3. **The seven R6-only rows in the table above.** This is now stated rather than latent, which is the
   difference between a known boundary and a surprise.
4. **R7's residual clause** — "no real name, address or patient value anywhere in the file" — has no
   automated check and was confirmed by reading.
