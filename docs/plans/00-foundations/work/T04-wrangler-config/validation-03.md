# Validation 03 — T04 `wrangler.toml`

**Verdict** BUGS FOUND · 0 HIGH, 4 MEDIUM, 2 LOW · **Date** 2026-07-26 · **Attempt** 3
**Round trip 3 of 3 — the limit. This report ends with an escalation, not a fix.**
**Agents** 3, in parallel — regression, attack-the-new-logic, contract sign-off

## The configuration is correct, for the third round running

Nothing in this report is a defect in `apps/api/wrangler.toml` or `apps/api/src/index.ts`. Both are
byte-identical to what was built in attempt 1 — `d8e8e3f4…` and `1660df21…`, re-verified after every
probe across all three rounds.

The sign-off lens walked **every** R1–R13 and Scenario 1–8 independently, driving each one rather
than reading the guard's self-report: dry runs with credentials unset and 0 bytes of stderr, a live
`wrangler dev` serving byte-identical deep links, `dist` moved aside to prove the loud failure. Its
verdict on the contract is **met, in full**.

The regression lens re-ran **34 mutations** — the original 28 plus six it added, including Durable
Object `class_name` drift under `[env.local]` only and a second DO binding not mirrored — **all
red**, and re-argued all four rejections independently, upholding each. Nothing was dropped across
the guard's 39 → 45 → 58 → 71 growth.

## Why this is being escalated instead of fixed

**Every round has closed its bugs and produced new ones in the same family, and the family has a
single cause: the guard is doing static analysis of TypeScript and arbitrary text files with
regexes.**

| Round | Closed | Newly found |
|---|---|---|
| 01 | — | tautological tests, a test that could not fail, an extension allowlist, an open binding set |
| 02 | B1–B6 | scan blind to a second environment, quotes required, unscoped substring matches |
| 03 | B7–B11 | comment stripper blanks real code, wrong comment syntax per file type, symlinks skipped, `501` matched inside `1501`, a return matched inside a string literal |

Each fix was correct. Each fix was also a new piece of hand-written parsing, and the new parsing is
where the next round's bugs came from. **That is not a defect in any one fix; it is the approach
reaching its limit.**

## Bugs

### B12 · MEDIUM · A same-line `//` or `#` blanks the real assignment after it
`tools/guards/wrangler-config.test.ts:1006-1011`

`const base = "https://example.com"; ENVIRONMENT = "local";` in any scanned file leaves the suite
**green**. `stripScanComments` sees the `//` inside `https://` and deletes to end of line, taking the
real assignment with it. Removing only the `//` turns the same test red, which is the control that
makes this causal rather than coincidental. Same mechanism with `#` inside a URL fragment.

### B13 · MEDIUM · Block-comment stripping is applied to files that have no block comments
`tools/guards/wrangler-config.test.ts:1006-1008`

A `.sh` script where `/*` and `*/` appear inside ordinary string values — legal bash, no comment
meaning whatsoever — has the live `ENVIRONMENT="local"` between them deleted by the stripper. Green.
**A distinct root cause from B12**: this one is the stripper assuming TypeScript comment syntax
applies to every file type it walks.

### B14 · LOW · Symlinked files are silently skipped
`tools/guards/wrangler-config.test.ts:1019-1028`

A symlink's `Dirent` is neither `isFile()` nor `isDirectory()`, so `walk()` skips it with no error.
Only exploitable when the target is otherwise outside every scanned root, hence LOW.

### B15 · MEDIUM · `501` matches inside `1501`
`tools/guards/wrangler-config.test.ts:605`

A class body that genuinely returns **200** passes R13's *"the class body is a 501"* check, because
an unrelated `const schemaVersion = 1501` satisfies `/501/`. **B9's word-boundary fix was applied to
the class name and not to the number one line away.**

### B16 · MEDIUM · A return statement matches inside a string literal
`tools/guards/wrangler-config.test.ts:616`

A default export that never calls `env.ASSETS.fetch()` at all — every deep link 500s — passes,
because a decoy string `"e.g. return env.ASSETS.fetch(request)"` satisfies the regex. This is the
unit-level stand-in for Scenario 5, the SPA deep-link fallback.

### N1 · The same blindness fires in reverse, rejecting correct code
`tools/guards/wrangler-config.test.ts:1122-1132`

`stripDeadFalseBranches` matches `if (false) {` inside a string literal, then brace-counts forward
past a **real, reachable** `return env.ASSETS.fetch(request);` to a `}` inside a second string —
deleting the compliant code and failing the test. A false positive from the same root cause.

## What the harness found on top, and it matters more than any single bug

**I reproduced B15 and B16 myself and both went red — for the wrong reason.**

The failing test in each case was not R13. It was **B11's `assertMutated` drift diagnostic**:

> `the "501-return replaced with a 200-return, 501 left in a comment" mutation string has drifted
> from the real file — .replace() found nothing to replace`

The R13 assertions stayed green exactly as the attack lens reported. The suite only went red because
my edit happened to touch the literal text the guard's own mutation fixtures hardcode.

**So the red/green signal on `src/index.ts` is currently dominated by "did you edit the exact lines
my fixtures quote", not by "is the code correct".** That is a worse property than any individual
false negative, and it was invisible until someone changed the file for an unrelated reason — which
is precisely what T07 will do.

## The sign-off lens's overshoot finding, which points the same way

Asked whether the guard has overshot, it wrote a plausible T07-shaped `src/index.ts` — Hono app,
`PlanCoordinator` untouched, `app.all('*', c => c.env.ASSETS.fetch(c.req.raw))`, `export default app`
— **the idiomatic way to deploy Hono on Workers** — and two tests went red.
`findDefaultExportFetchBody` only recognises the literal `export default {` object shape.

**I disagree that this one is a bug**, and the disagreement is recorded rather than smoothed over.
R13 is a claim about *the stub*, which the contract says in as many words, and T07 replaces the stub.
This is the same lifecycle event T04 already handled once, when it retired T01's assertion that
`wrangler.toml` must not exist: the boundary moves with the task that crosses it. It belongs in T07's
task file, not in a fourth round trip guessing at T07's shape.

Its third finding — that banning *any* `ENVIRONMENT` value in *any* other environment is stricter
than R11 — is **rejected in writing**. §9 calls the local bypass *"a production landmine unless it is
tested."* A guard that makes a human justify a new `ENVIRONMENT` var is doing its job; the cost of
repeal is one comment.

## Escalation

`CONVENTIONS.md` and `/validate-task` both stop the run here: three round trips without PASS means
the defect is in the plan or the task, and a fourth fix agent cannot see that. **I agree, and I think
the specific thing that is wrong is identifiable.**

R13's evidence method in the frozen contract is `unit`, and R13 is a claim about **what the code
does** — that the class returns 501, that the handler delegates to the assets binding. Text matching
cannot decide those questions, so every round it is asked to, it produces another near-miss. The R11
scan has the same disease in a different key: one comment-syntax assumption applied to every file
type in the tree.

**The system is not at risk.** R13's real proof is Scenario 5 — a live `wrangler dev` request
returning the SPA shell — which passes and is `integration` evidence. A missing export fails
Scenario 1's dry run loudly. And every value that reaches the deployed Worker arrives through
`[vars]` or `wrangler secret bulk`, neither of which is a `.sh` file or a symlink. What is imperfect
is the guard's ability to *detect a future accident*, not the correctness of what ships.

The options are laid out for the user in `progress.md`. My recommendation is to **replace the text
matching rather than patch it a third time** — a real behavioural unit test for R13 (import the
module, assert the stub returns 501, call the handler with a fake `ASSETS` and assert delegation) is
about fifteen lines and is immune to B15, B16 and N1 by construction, while deleting the brace
matcher, the dead-branch heuristic and most of the comment stripping. That is a smaller, simpler
guard that tests more, and it also answers the overshoot finding. **It is a design change, so it goes
back to `/design-task`, not to a fix agent.**

## Hygiene

Three agents, three copies, three ports. Real tree unchanged, verified by the harness after all three
reported. One agent kept its driver script outside the repo copy specifically because a round-2 agent
had polluted the R11 scan with its own mutation strings — the lesson carried forward without being
told.
