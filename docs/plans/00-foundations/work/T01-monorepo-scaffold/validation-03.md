# Validation 03 — T01 Monorepo scaffold

**Verdict** PASS · **Date** 2026-07-25 · **Attempt** 3 · **Round trip** 3 of 3

## Every prior bug, re-checked

| From | Bug | Reproduces? |
|---|---|---|
| v01 | B1 · `Date` ban porous | **No** — 2 errors, exit 1 |
| v01 | B2 · apps cannot import `@wherego/*` | **No** — typecheck and web build both exit 0 |
| v01 | B3 · five script names unguarded | **No** — `lint`→`lintx` now fails 1/61 |
| v01 | B4 · `engines` range vs `.nvmrc` pin | **No** — reverting to `>=24` fails the R5 guard |
| v02 | N1 · date library via `devDependencies` | **No** — caught by the manifest guard *and* `no-restricted-imports` |
| v02 | N2 · `Intl.DateTimeFormat()` | **No** |
| v02 | N3 · `performance.timeOrigin` | **No** |
| v02 | N4 · `InstanceType<typeof Date>` | **No** — `TSTypeQuery` selector |
| v02 | N5 · runtime-computed access | **Yes — rejection upheld.** The validator, reaching it independently: *"a genuine boundary of static analysis, not a gap the config author left open through laziness"* |

## The scope check — the one that mattered most

The `Date` ban has been extended four times across two fix rounds. Every construct
(`new Date()`, `globalThis.Date.now()`, `Intl.DateTimeFormat`, `performance.now()`, `type D = Date`,
`InstanceType<typeof Date>`, a `dayjs` import) was linted under all four non-scheduler locations:

| `packages/domain/src/` | `packages/geo/src/` | `apps/api/src/` | `apps/web/src/` |
|---|---|---|---|
| clean | clean | clean | clean |

**No leak.** The glob remains `packages/scheduler/**/*.ts` alone. This was the highest-consequence
risk in the whole task: `packages/domain` is where `PlainDate`, the ROC date math and `formatRoc()`
live from Phase 1, and a ban leaking there would have been worse than the holes it closed — and
would not have surfaced until Phase 1.

## No regression, no vacuous guards

Test count **41/3 → 54/4 → 61/4**, monotonic and additive. No test name from either prior report is
missing. No `.only`, `.skip` or `.todo` anywhere. `passWithNoTests` still absent.

**Eighteen mutations across all four guard files. Not one stayed green.** Including every rule added
in the two fix rounds — the `devDependencies` purity check, the date-library import ban, the `Intl`
and `performance` bans, the `TSTypeQuery` selector, the module-resolution guard, and both regression
guards from fix 01. Each restored immediately and re-confirmed green.

## Cold CI, `ci.yml` order, `.git` present and `node_modules` absent

`install --frozen-lockfile` → `typecheck` → `lint` → `test` (61/61) → `test:sim` → `test:worker` →
`build`: **all exit 0.** No hang, no prompt, no TTY dependency. Both stub notices confirmed on
stderr by redirection.

## Contract walk

**R1–R7 and Scenarios 2–10: all met by direct evidence.** Zero criteria fail.

**S1 · not exercised** — unchanged across all three runs. `git ls-files` is empty, so a literal clone
cannot be tested until this task is committed. A sequencing fact, not a defect, and unfixable by an
agent.

## New findings

**None.** Nothing new at any severity.

## Coverage gaps

- **S1, and its consequence: T10's CI cannot pass until T01 is committed.**
- `pnpm --filter web build` resolving is pnpm-version-dependent; nothing in the repo asserts it.
- The Date-ban glob would not match a `.tsx` file under `packages/scheduler` — moot while the package
  is pure TS by design.
- N5's runtime-computed access is permanently out of reach of static analysis.
- No third-party surface exists in this task, so none was exercised. Every later task in the phase
  has one.

## Verdict

**PASS.** Task → `validated`. Next: `/doc-feature T01`.
