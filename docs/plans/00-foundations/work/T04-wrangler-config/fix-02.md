# Fix 02 — T04 `wrangler.toml`

**Date** 2026-07-26 · **Attempt** 2 · **Bugs addressed** B7–B11, all five
**Files changed** `tools/guards/wrangler-config.test.ts` **only**

Tests **168 → 181** repo-wide; 58 → 71 in this file. Nothing removed, skipped or loosened. Both
configuration files untouched, sha256 re-verified by the harness after every probe:

```
d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c  apps/api/wrangler.toml
1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e  apps/api/src/index.ts
```

## What was fixed

| Bug | Fix | Where |
|---|---|---|
| B7 | exactly one environment may set `vars.ENVIRONMENT`, it must be `env.local`, value `"local"` — any other environment setting the key **at all, to any value** is a violation. Scan counts **occurrences**, not files | `:270-298`, `:1013-1042` |
| B8 | quotes optional: `/ENVIRONMENT\s*[:=]\s*(?:["']local["']\|local\b)/g`, operator still required so prose does not match — with a negative test for that | `:1015` |
| B9 | comments stripped, class name matched with a word boundary, 501 asserted **inside** the brace-matched class body, `env.ASSETS.fetch(request)` asserted **returned** from the default export's fetch body | `:591-618`, `:1063-1130` |
| B10 | no environment may override `workers_dev`, at `vars` level or above | `:308-316` |
| B11 | `assertMutated(mutated, original, label)` — every literal-replacement mutation now fails with *"the mutation string has drifted from the real file"* instead of `expected X not to be X` | `:390-397` |

## Fail-then-pass, re-run by the harness

Applied to the real tree, run, reverted, checksums re-verified. Every one green before, red after.

| Defect condition | Result |
|---|---|
| `[env.staging.vars] ENVIRONMENT = "local"` appended | **4 red** |
| `[env.local.vars] workers_dev = true` | **3 red** |
| `tools/probe.env` containing unquoted `ENVIRONMENT=local` | **1 red** |
| class renamed to `PlanCoordinatorX` | **3 red** |
| `fetch` returns 200, `501` left in a comment | **2 red** |
| `env.ASSETS.fetch(request)` moved into `if (false) { … }` | **1 red** |

B7's message, in full, because the wording is the point of the fix:

> `exactly one environment must set vars.ENVIRONMENT, and it must be env.local set to exactly
> "local" — any OTHER environment setting ENVIRONMENT at all, whatever its value, is a violation,
> because T08's bypass is gated on the value rather than the environment's name`

B10's:

> `env.local must not override workers_dev — §9(b): a workers_dev = true under any environment
> reopens the *.workers.dev hostname that no Cloudflare Access application can cover`

## A defect the fix created and closed before reporting

Counting **occurrences** rather than files — B7's own fix — immediately broke R11 against the
**correct, untouched** file, because `wrangler.toml`'s explanatory comment quotes
`ENVIRONMENT = "local"` verbatim as prose. A second textual hit in the one file allowed exactly one.

Closed by stripping `#`, `//` and `/* */` comments before counting, in every scanned file rather
than only in TOML. The agent found this itself, fixed it, and reported it rather than letting the
suite go green by loosening the count back to per-file. Recorded because it is the same trap R5 and
R10 sprang earlier in this task — **a literal-string rule meeting a file that documents itself** —
and it has now caught three separate checks. That is a pattern, and it is in the boundary comment.

## Stated limitation, not hidden

**B9's dead-branch detection is a scoped heuristic, not control-flow analysis.** It strips literal
`if (false) { … }` blocks by brace matching, and nothing else. It catches the reproduction
`validation-02.md` names and nothing shaped differently — dead code after an unconditional `return`,
a variable that is always false, an unreachable `switch` branch. The agent said so plainly rather
than claiming general coverage, and it is written into both the function's own comment and the
file's coverage boundary.

That is the right trade. A real answer needs a parser, and adding a parser dependency to prove a
property about eight lines of stub code that **T07 replaces wholesale** would be a worse decision
than the gap.

## The coverage boundary is now in the file

The required deliverable, in the style of `schema-0001.test.ts`'s `DO NOT WEAKEN THIS CHECK` block —
about forty lines at the top of the guard, *measured across three validation rounds rather than
asserted from first principles*, naming what this file does **not** catch and where each of those is
covered instead:

- `run_worker_first = true` has no behavioural proof here and cannot have one until T08
- R6 checks a cron comment is **present**, never that its stated clock time is **correct** — with
  the reason, so the rejection does not get re-litigated
- `docs/` is excluded from R11, and comments are stripped inside every scanned file, with the
  argument for both
- an empty-but-present `dist` passes; T10 checks `> 0`; and even `> 0` misses a `dist` with no root
  `index.html`, which **nothing catches yet**
- B9's `if (false)`-only scope

This is the durable output of the three rounds. A boundary that lives only in a validation report is
one someone optimises away; on the file, it is something a reader has to argue with.

## Round-1 and round-2 mutations

All 28 re-confirmed red. The test count has risen at every step — 39 → 45 → 58 → 71 — and has never
fallen.
