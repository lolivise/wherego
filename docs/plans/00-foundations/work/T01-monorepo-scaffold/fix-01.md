# Fix 01 — T01 Monorepo scaffold

**Against** [`validation-01.md`](validation-01.md) · **Date** 2026-07-25 · **Attempt** 2
**Agent** sonnet, one agent for all four bugs — B3 and B4 share `tools/guards/scaffold.test.ts`

## Triage

| Bug | Verdict | Reasoning |
|---|---|---|
| B1 · `globalThis.Date` bypass | fix | Real. Root cause: `no-restricted-globals` matches value-position identifiers only |
| B2 · apps cannot import `@wherego/*` | fix | Real. Root cause: no workspace dependency declared, not anything about `exports` |
| B3 · five script names unguarded | fix | Real, cheap, and T10/T16 hard-code all six names |
| B4 · `engines` range vs `.nvmrc` pin | fix | See below — not routed back to `/design-task` |
| LOW · purity is a name allowlist | **not a bug** | See below |

**Why B4 was fixed rather than sent back as a plan defect.** The code matched `plan.md`, which
specified a floor of `>=24`; `acceptance.md` R5 requires a pin that agrees with `.nvmrc`. The
contract is frozen and outranks the plan, so the plan was the wrong document. `>=24 <25` satisfies
R5 literally — it pins major 24 and agrees with `.nvmrc` — while still admitting any 24.x patch,
which was the plan's actual intent. No design changed, so no return to `/design-task`. `plan.md` has
been corrected by the harness to match.

**Why the LOW purity finding is not a bug.** `tools/guards/scheduler-purity.test.ts` checks both
`dependencies` and `peerDependencies` against a regex list, and separately asserts `dependencies` is
empty. A homegrown impure package with an innocuous name would pass — but that is exactly what
Scenario 6 asks for, word for word, and Scenario 6 is frozen. The guard is faithful. Recorded here
and in `validation-01.md` so it stops being re-reported. Real structural purity would be a new
criterion, not a fix.

## Fixed

### B1 · HIGH · The `Date` ban is a speed bump

`eslint.config.js` — the existing `no-restricted-globals` rule was **extended, not replaced**:

- `no-restricted-properties` for `Date` on `globalThis`, `self` and `window`. This also catches the
  computed form `globalThis['Date']`, because ESLint's `getStaticPropertyName` resolves literal
  computed keys.
- `no-restricted-syntax` with the selector `TSTypeReference[typeName.name='Date']` for type
  position.

All three share one `DATE_BAN_MESSAGE` constant, so every message still names `PlainDate` and
`@wherego/domain` — Scenario 4 asserts that text. `new (0, eval)('Date')()` is deliberately not
caught: out of scope and not worth the false positives.

**Regression test** `tools/guards/date-ban.test.ts:41-84`, five cases.
**Fail-then-pass** With the pre-fix rule set restored, all 5 failed (`expected 0 to be greater than
0`). With the fix, 7/7 in that file pass.

**Harness re-verification** — each bypass linted individually, plus a control:

| Probe in `packages/scheduler/src/` | Result |
|---|---|
| `globalThis.Date.now()` | rejected |
| `const D = globalThis["Date"]; new D()` | rejected |
| `type W = { d: Date }` | rejected |
| `new Date()` (the original) | rejected |
| **Control:** both of the above in `packages/domain/src/` | **clean — the ban is still scoped** |

### B2 · HIGH · No app can import any `@wherego/*` package

`apps/api/package.json` gains `@wherego/domain`, `@wherego/scheduler` and `@wherego/geo` as
`workspace:*`; `apps/web/package.json` gains `@wherego/domain`. Per §2 the Worker runs the scheduler
and the geo checks, and the SPA consumes shared types. **No dependency was added between the three
`packages/*` themselves** — none is needed and that is a Phase 1/2 decision. `pnpm install`
regenerated the lockfile with no network download (`reused 207, downloaded 0`).

**Regression test** new file `tools/guards/workspace-imports.test.ts`.

The agent's own note on this test is the most useful thing it returned: an in-process
`createRequire` check, *and* a naive subprocess that inherits vitest's `NODE_PATH`, both pass whether
or not the dependency is declared — `NODE_PATH` points at pnpm's shared `.pnpm/node_modules` store.
Either would have been a test that proves nothing. The test spawns a genuinely separate `node`
process with `NODE_PATH` stripped, which resolves the way `tsc` and Rollup do.

**Fail-then-pass** Before `pnpm install` linked the newly declared deps, both tests failed
(`expected false to be true`); after, symlinks appear under `apps/api/node_modules/@wherego/` and
both pass.

**Harness re-verification** — the report's own reproduction, run directly: a real
`import * as d from '@wherego/domain'` in `apps/web/src/App.tsx` and
`import * as s from '@wherego/scheduler'` in `apps/api/src/index.ts`. `pnpm typecheck` exit 0,
`pnpm --filter web build` exit 0. Both files restored afterwards.

### B3 · MEDIUM · Five of six script names unguarded

`tools/guards/scaffold.test.ts` — a new block asserts all six names against their exact expected
commands, not just `build`.

**Fail-then-pass** The validation report's exact reproduction — rename `lint` → `lintx` — now fails
the guard (`expected a "lint" script: expected undefined to be 'eslint .'`). Restored, 43/43 green.

### B4 · MEDIUM · `engines.node` range vs `.nvmrc` pin

Root `package.json`: `">=24"` → `">=24 <25"`. The guard's `toMatch(/24/)` — which passed for a
range, a caret and a pin alike — is replaced by a small bounded version-range evaluator local to the
test file, asserting `24.0.0` and `24.99.99` are admitted and `25.0.0` is not. No `semver`
dependency added.

**Fail-then-pass** Against the unfixed `">=24"` the new test fails (`>=24` admits `25.0.0`); against
`">=24 <25"` it passes.

## Checks

Re-run by the harness, not taken from the agent.

| Command | Result |
|---------|--------|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | exit 0 — **4 files, 54 tests** (was 3 files, 41) |
| `pnpm test:sim` | exit 0, stub notice |
| `pnpm test:worker` | exit 0, stub notice naming T06 |
| `pnpm build` | exit 0 |

## Scope

Eight files touched, all required by the four bugs: `eslint.config.js`, `apps/api/package.json`,
`apps/web/package.json`, `package.json`, `pnpm-lock.yaml`, `tools/guards/scaffold.test.ts`,
`tools/guards/date-ban.test.ts`, and the new `tools/guards/workspace-imports.test.ts`. No refactors,
no renames, no drive-by changes. No stray probe files or CSVs left behind; the top-level tree is
unchanged from before the fix. Nothing under `docs/` was touched by the agent.

## Not fixed, carried forward

- **Scenario 1 remains unprovable literally** — nothing in this repository is committed, so
  `git clone` yields an empty directory. Not fixable by an agent: committing requires being asked.
  **T10's CI cannot pass until T01 is committed.**
- The three other coverage gaps in `validation-01.md` stand: pnpm-version-dependent filter matching,
  the `.tsx` hole in the Date-ban glob, and the absence of any third-party surface to exercise.
