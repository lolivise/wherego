# Fix 02 — T01 Monorepo scaffold

**Against** [`validation-02.md`](validation-02.md) · **Date** 2026-07-25 · **Attempt** 3
**Agent** sonnet, one agent — all four findings touch the same two files

## Triage

| Finding | Verdict | Reasoning |
|---|---|---|
| N1 · date library via `devDependencies` | fix | Real and shipping — pnpm installs devDeps, Wrangler bundles what is imported |
| N2 · `Intl.DateTimeFormat().format()` | fix | Reaches the clock; `packages/scheduler` does no formatting at all |
| N3 · `performance.timeOrigin` | fix | Reaches the clock; pure day arithmetic has no use for it |
| N4 · `InstanceType<typeof Date>` | fix | `TSTypeQuery`, not `TSTypeReference` — the existing selector misses it |
| N5 · `Reflect.get(globalThis,'Date')`, `globalThis['Da'+'te']` | **not a bug — rejected** | See below |

**Why N5 is rejected.** Both assemble a property name at runtime, so they are statically
undecidable; no lint rule can catch them and any rule broad enough to try fires on legitimate code.
The threat model for §2's rule is an engineer reaching for the clock **by habit** — not one
deliberately working around a lint rule, who can always win. Recorded in `validation-02.md` and here
so it stops being re-reported.

## Fixed

All four in `eslint.config.js` and `tools/guards/scheduler-purity.test.ts`, extending the existing
rules rather than replacing them.

**N1** — two layers, deliberately. The purity guard now reads `devDependencies` alongside
`dependencies` and `peerDependencies`, and its forbidden-name list gains nine date libraries
(`dayjs`, `date-fns`, `moment`, `luxon`, `js-joda`, `@js-joda/core`, `dateformat`,
`temporal-polyfill`, `@js-temporal/polyfill`). Separately, `no-restricted-imports` makes *importing*
any of them inside `packages/scheduler/**` a lint error. The manifest check catches declaring it;
the lint rule catches using it.

**N2, N3** — `Intl` and `performance` added to `no-restricted-globals` for
`packages/scheduler/**/*.ts`.

**N4** — a second `no-restricted-syntax` selector, `TSTypeQuery[exprName.name='Date']`, alongside
the existing `TSTypeReference` one.

Three new message constants, each naming `PlainDate` and `@wherego/domain`, matching the voice
Scenario 4 asserts. The agent added `assertNamesReplacement()` to verify that programmatically
rather than by eye.

**Regression tests** `tools/guards/date-ban.test.ts:118-166`, `scheduler-purity.test.ts:89-92`.
Seven new tests: five lint cases, one manifest case, and **one positive control** asserting all four
constructs remain legal in `packages/domain`. Test count 54 → **61**.

**Fail-then-pass** Before the fix, the manifest test failed with `expected [] to deeply equal
['dayjs']` and the five lint tests with `expected 0 to be greater than 0`. After, 16/16 in those two
files.

No package was installed — N1 is proven against a synthetic manifest object and ESLint's `lintText`
with a synthetic filePath, so the real `packages/scheduler/package.json` was never touched.

## Harness re-verification

Every closure driven directly, plus the scope control that matters more than the closures:

| Probe | In `packages/scheduler` | In `packages/domain` |
|---|---|---|
| `import dayjs from 'dayjs'; dayjs().valueOf()` | rejected | **legal** |
| `new Intl.DateTimeFormat().format()` | rejected | **legal** |
| `performance.timeOrigin + performance.now()` | rejected | **legal** |
| `type D = InstanceType<typeof Date>` | rejected | **legal** |

The right-hand column is the one worth having run. `packages/domain` is where `PlainDate`, the ROC
date math and `formatRoc()` live from Phase 1 onward; a ban that leaked there would have been worse
than the holes it closed, and it would not have shown up until Phase 1.

| Command | Result |
|---------|--------|
| `pnpm typecheck` · `lint` · `test` · `test:sim` · `test:worker` · `build` | all exit 0 |
| `pnpm test` | **4 files, 61 tests** |
| stray probe files | none |

## Scope

Three files: `eslint.config.js`, `tools/guards/scheduler-purity.test.ts`,
`tools/guards/date-ban.test.ts`. No existing test touched, weakened or removed — all 54 prior tests
still present and passing.

## Carried forward, unfixable here

**Scenario 1 cannot be proven until the repository is committed.** Unchanged across all three
validation runs. **T10's CI cannot pass until T01 is committed**, and committing requires being
asked.
