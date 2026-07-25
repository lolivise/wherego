# Validation 01 — T01 Monorepo scaffold

**Verdict** BUGS FOUND (2 HIGH, 2 MEDIUM, 1 LOW accepted) · **Date** 2026-07-25 · **Attempt** 1

Three agents, three lenses — acceptance, end-to-end, adversarial — dispatched in parallel, none
given `execution.md`. Every finding below was reproduced by the harness before being accepted.

## What was run

- **No mocks stood up, and none needed.** T01 touches no third party. All three agents confirmed no
  external host was reached; `pnpm install` served entirely from the local content-addressable store
  (`reused 207, downloaded 0`).
- **A cold CI simulation** in a throwaway copy with `node_modules` absent: `install --frozen-lockfile`
  → `typecheck` → `lint` → `test` → `test:sim` → `test:worker` → `build`, all exit 0, in order, with
  no prompt, hang or TTY dependency. `allowBuilds: esbuild` pre-approves the postinstall
  non-interactively — the T01→T10 carry-forward is confirmed working.
- **Mutation testing on all three guard files.** Eight mutations, each restored immediately: `strict`
  → `false`, `.nvmrc` → `22`, `build` renamed, `lint` renamed, `hono` added to scheduler deps, a
  workspace member removed, `route.ts` created, the Date rule stripped from `eslint.config.js`.
  **Seven of eight went red.** The eighth is B3 below.

Contract coverage, one line each:

| | | |
|---|---|---|
| R1 tree exists | ✅ | guard, plus `.github/` and `wrangler.toml` confirmed absent |
| R2 workspace membership, `@wherego/` scope | ✅ | `pnpm ls -r --depth -1`, all six |
| R3 `migrations/` tracked, not a member | ✅ | `git check-ignore` exits 1; `git add` succeeds |
| R4 `strict: true` inherited, unweakened | ✅ | guard; all six tsconfigs read directly |
| R5 Node 24 pinned in both, **agreeing** | ❌ | **B2** — `>=24` is a range, `.nvmrc` is a pin |
| R6 no `build` in `packages/*`; root build = web | ✅ | guard |
| R7 Phase 2 filenames absent | ✅ | guard, 8/8 |
| S1 clean checkout install | ⚠️ | **not literally provable — nothing is committed.** See Coverage gaps |
| S2 frozen lockfile rejects drift | ✅ | `ERR_PNPM_OUTDATED_LOCKFILE`, exit 1, lockfile byte-identical |
| S3 six scripts exit 0 | ✅ | cold run, all six |
| S4 `Date` rejected in scheduler | ⚠️ | bare `Date` yes — **but see B1**, the ban is porous |
| S5 `Date` accepted in domain | ✅ | and `isPathIgnored` confirms the file was really linted, not skipped |
| S6 scheduler purity | ✅ | no `dependencies` key at all |
| S7 stubs announce themselves | ✅ | exit 0, **stderr**, `test:worker` names T06 |
| S8 no vacuous pass | ✅ | `passWithNoTests` absent; 41 tests reported |
| S9 patient CSV cannot be committed | ✅ | root and nested; `!tools/fixtures/**` exception verified working |
| S10 §11.2 literal filter resolves | ✅ | resolves to `@wherego/web`; outcome recorded |

## Bugs

### B1 · HIGH · The `Date` ban is a speed bump, not a wall

**Where** `eslint.config.js` — the `no-restricted-globals` block.

**Reproduce**
```bash
printf 'export const n = globalThis.Date.now();\nexport type W = { d: Date };\n' \
  > packages/scheduler/src/__b.ts
pnpm exec eslint packages/scheduler/src/__b.ts   # → No issues found
rm packages/scheduler/src/__b.ts
```

**Expected vs actual** Scenario 4's contract is that date-getting code in `packages/scheduler` is
rejected. Actual: ESLint is completely clean. `no-restricted-globals` matches an `Identifier` in
value position only. Every one of these passes:

- `globalThis.Date.now()` — **the natural way to reach the clock in a Worker**, where no `window` exists
- `const D = globalThis['Date']; new D()`
- `type WithDate = { d: Date }` — `Date` in type position
- `(x as { toLocaleDateString(): string }).toLocaleDateString()`

**Why it matters** §2 calls this "the single rule that prevents more bugs than any other line in this
document", and the failure it prevents is a visit scheduled on the wrong day. Nineteen later tasks
inherit this config unexamined. The bypass is not exotic — `globalThis.Date` is the path of least
resistance in a Cloudflare Worker, so the rule is weakest exactly where an engineer is most likely
to reach for it.

### B2 · HIGH · No app can import any `@wherego/*` package

**Where** `apps/api/package.json` (no `dependencies` block at all), `apps/web/package.json`
(`react` and `react-dom` only).

**Reproduce** Add `import * as d from '@wherego/domain';` to any file under `apps/web/src/` or
`apps/api/src/`, then `pnpm typecheck` → `TS2307: Cannot find module '@wherego/domain'`.
`pnpm --filter web build` → `Rollup failed to resolve import`. Adding
`"@wherego/domain": "workspace:*"` to the consumer's `dependencies` and re-installing fixes both.

**Expected vs actual** The task's Outcome is "every app and package **wired**", and the plan's whole
design is that apps import `@wherego/*` TypeScript source directly with no build step. Actual: under
pnpm's strict non-hoisting linking, a workspace package that is not a declared dependency of its
consumer is invisible to `tsc` and to every bundler. It is a runtime resolution failure, not a
type-checking nuisance.

**Why it matters** No criterion exercises a cross-package import from an app, so this passed
validation-by-the-letter while failing the design intent — the exact gap the adversarial lens exists
to find. It surfaces the first time a later task writes a real import: T07 wiring `apps/api`, Phase
1's CSV import needing `packages/domain`'s zod schemas, Phase 3's web UI needing shared types. It
will look like a typo and cost someone an afternoon.

**Note on the contract** R2 requires workspace *membership*, which is satisfied. This is a gap in
the frozen contract, not a violation of it — reported rather than reinterpreted, per the rule.

### B3 · MEDIUM · Five of the six CI script names have no regression guard

**Where** `tools/guards/scaffold.test.ts` — only `scripts.build` is asserted.

**Reproduce** Rename `lint` to `lintx` in the root `package.json`; `pnpm test` stays green, 41/41.

**Expected vs actual** Scenario 3 requires all six named scripts to exist. Only `build` is protected.
Renaming `typecheck`, `lint`, `test`, `test:sim` or `test:worker` passes the whole suite.

**Why it matters** `ci.yml` (T10) and `deploy.yml` (T16) hard-code these six names. A rename fails
nowhere locally and surfaces as a red CI or — worse — a broken deploy pipeline, which is precisely
the deferred discovery §11 exists to prevent.

### B4 · MEDIUM · R5 is not satisfied: `engines.node` is a range, `.nvmrc` is a pin, and the guard cannot tell

**Where** `package.json` `"node": ">=24"` vs `.nvmrc` `24`; guard assertion
`expect(root.engines?.node).toMatch(/24/)`.

**Expected vs actual** R5 requires Node 24 pinned in both places "and the two agree". `.nvmrc` pins
major 24; `>=24` admits 25, 26 and everything after. The guard's `/24/` regex passes for `>=24`,
`^24`, `24.x` alike — it cannot distinguish a pin from a range, so it can never catch this class of
drift.

**Why it matters** Low blast radius today (installed Node is 24.14.1), but it is a real disagreement
between the plan (which specified a floor) and the contract (which requires a pin), and the guard
was written loosely enough to hide it. A CI runner on Node 25 would satisfy `engines` while `.nvmrc`
still says 24, and nothing would notice.

## Rejected and accepted-as-limitation

**Scheduler purity is a name allowlist, not a structural guarantee** (reported LOW by the adversarial
lens). The guard checks both `dependencies` and `peerDependencies` against a regex list of
Cloudflare / database / HTTP / framework names, and separately asserts `dependencies` is empty. A
homegrown fetch wrapper with an innocuous name would pass. **This is faithful to Scenario 6 as
written**, and Scenario 6 is frozen — the guard is not defective. Recorded so the next validation
does not re-report it. If real structural purity is wanted, that is a new criterion, not a fix.

## Coverage gaps

What this run could not prove:

- **Scenario 1 cannot be proven literally, because nothing in this repository is committed.**
  `git ls-files` is empty; `git clone` produces an empty directory and `pnpm install` dies with
  `ERR_PNPM_NO_PKG_MANIFEST`. All three agents fell back to an `rsync` copy excluding `.git` and
  `node_modules`. **What that proves:** the manifests and lockfile are internally consistent and
  produce all six members with no network. **What it does not prove:** that a clone of this repo
  does so. It cannot, until the scaffold is committed — and the harness forbids committing without
  being asked. This is a sequencing fact for the user, not a defect to fix, but it means **T10's CI
  will fail 100% of the time until T01 is committed.**
- **`pnpm --filter web build` resolving is pnpm-version-dependent.** It works because pnpm 11.0.8
  suffix-matches scoped names. Nothing in the repo's own config asserts this, so a future pnpm major
  could silently break T16's deploy step with no test catching it.
- **The Date-ban glob is `packages/scheduler/**/*.ts`** and would not match a `.tsx` file. Moot today
  — the package is pure TS by design — but it is a hole if that ever changes.
- **No third-party behaviour was exercised at all**, correctly: T01 has no third-party surface. Every
  later task in this phase does, and none of that is covered here.

## Verdict

**BUGS FOUND.** B1 and B2 are HIGH and block. B3 and B4 are MEDIUM. Next: `/fix-task-execution T01`.

Both HIGH findings share a shape worth noting: the contract was satisfied to the letter and the
design intent was not. B1 tests that `new Date()` is caught but never that the ban cannot be walked
around; B2 tests that packages are workspace members but never that anything can import them.
