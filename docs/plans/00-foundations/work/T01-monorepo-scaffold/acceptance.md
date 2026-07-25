# Acceptance criteria — T01 Monorepo scaffold

**Task** [`../../tasks/T01-monorepo-scaffold.md`](../../tasks/T01-monorepo-scaffold.md) · **Plan** [`plan.md`](plan.md)
**Written** 2026-07-25 · **Status** agreed 2026-07-25 (user) — **frozen**

> **This file is the contract.** `/build-task` builds to it; `/validate-task` judges against it.
> Frozen once agreed — a criterion that fails validation is this file working, not a criterion to
> soften.

---

**Purpose**

As the WhereGo build
I want a pnpm workspace where every package is wired and all six CI scripts run
So that the twenty tasks after this one inherit one set of conventions instead of each inventing
their own, and `ci.yml` has real commands to call on day one.

**Design:** `docs/PLAN.md` §2 *Repo layout*, §11.1

---

## Requirements — structure and configuration

These are config values and directory structure, not behaviour. No Gherkin is fabricated for them;
each is asserted by a guard test in `tools/guards/scaffold.test.ts` so a later task cannot quietly
undo one.

**R1 · The tree exists, exactly as §2 specifies it**

```
wherego/
├── apps/
│   ├── api/           src/routes/  src/coordinator/     → @wherego/api
│   └── web/           React + Vite SPA, builds to dist/ → @wherego/web
├── packages/
│   ├── scheduler/     PURE. no I/O, no CF, no fetch, no Date → @wherego/scheduler
│   ├── domain/        zod, PlainDate + ROC math, CSV mapping → @wherego/domain
│   └── geo/           haversine, bounding-box check          → @wherego/geo
├── tools/             guards, and tools/mocks/ for T06 + T08 → @wherego/tools
├── migrations/        D1 SQL — a plain directory, NOT a package
└── docs/
```

**R2** — `apps/api`, `apps/web`, `packages/scheduler`, `packages/domain`, `packages/geo` and `tools`
are all pnpm workspace members, named under the `@wherego/` scope.

**R3** — `migrations/` exists and is tracked by git. It is **not** a workspace member; it holds SQL.
See *Notes* — this is a deliberate reading of task criterion 3, not an omission.

**R4** — `tsconfig.base.json` sets `strict: true`, and every workspace member's `tsconfig.json`
extends it and overrides no strictness flag to a weaker value.

**R5** — Node 24 is pinned in both `.nvmrc` and root `engines.node`, and the two agree.

**R6** — `packages/scheduler`, `packages/domain` and `packages/geo` have no `build` script; their
`exports` resolve to `./src/index.ts`. Root `build` is the web build only.

**R7** — The Phase 2 filenames listed under `packages/scheduler` in §2 (`candidates.ts`, `route.ts`,
`assign.ts`, …) are **not** created as stub files. The package and its `src/` exist; the files do
not.

---

## Scenario 1: A clean checkout installs from the committed lockfile

```gherkin
Given a fresh clone of the repository into an empty directory
And node_modules does not exist
When `pnpm install --frozen-lockfile` is run at the repo root
Then the command exits 0
And every workspace member listed in R2 appears in `pnpm ls -r --depth -1`
```

## Scenario 2: An out-of-date lockfile fails the install rather than silently updating it

```gherkin
Given a dependency version in a package.json that pnpm-lock.yaml does not reflect
When `pnpm install --frozen-lockfile` is run
Then the command exits non-zero
And pnpm-lock.yaml is not modified
```

## Scenario 3: All six CI script names exist and exit 0 from the repo root

```gherkin
Given a completed `pnpm install`
When each of `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:sim`, `pnpm test:worker` and
  `pnpm build` is run in turn from the repo root
Then each command exits 0
And `pnpm build` produces `apps/web/dist/index.html`
```

## Scenario 4: `Date` is rejected inside packages/scheduler

```gherkin
Given a TypeScript source file located under `packages/scheduler/src/`
And the file contains the expression `new Date()`
When the repo's ESLint configuration is applied to it
Then a `no-restricted-globals` error is reported for the identifier `Date`
And the reported message names `PlainDate` as the replacement
```

## Scenario 5: The same code is accepted inside packages/domain — the ban is scoped, not global

```gherkin
Given a TypeScript source file located under `packages/domain/src/`
And the file contains the byte-identical `new Date()` expression from Scenario 4
When the repo's ESLint configuration is applied to it
Then no `no-restricted-globals` error is reported
```

## Scenario 6: packages/scheduler declares no impure dependency

```gherkin
Given the manifest at `packages/scheduler/package.json`
When its `dependencies` and `peerDependencies` are read
Then neither contains any package matching a Cloudflare, database, HTTP-client or web-framework name
And `dependencies` is empty or absent
```

## Scenario 7: A stub script announces itself rather than passing silently

```gherkin
Given `test:sim` and `test:worker` are not yet implemented
When `pnpm test:sim` is run
Then the command exits 0
And stderr contains the word "STUB"
And stderr names the task or phase that replaces it

Given the same
When `pnpm test:worker` is run
Then the command exits 0
And stderr contains the word "STUB"
And stderr names T06 as the task that replaces it
```

## Scenario 8: An empty test run fails instead of passing vacuously

```gherkin
Given vitest is configured for the repository
When the vitest configuration is read
Then `passWithNoTests` is not enabled anywhere in it

Given a completed `pnpm install`
When `pnpm test` is run
Then the reported number of passing tests is greater than zero
```

## Scenario 9: A patient CSV cannot be committed

```gherkin
Given a file named `居家11506112.csv` placed at the repository root
When `git status --porcelain` is run
Then the file does not appear as untracked
And `git check-ignore` reports it as ignored

Given the same file
When `git add` is attempted on it without `--force`
Then git refuses and reports the file as ignored
```

## Scenario 10: The literal deploy command from §11.2 resolves

```gherkin
Given the workspace uses `@wherego/`-scoped package names
When `pnpm --filter web build` — the exact string in `docs/PLAN.md` §11.2 step 2 — is run
Then either it exits 0 and produces `apps/web/dist/index.html`
Or the execution report records that it does not resolve and that T16 must use `@wherego/web`
```

---

## Evidence

| # | Criterion | Method | Where |
|---|-----------|--------|-------|
| R1–R2 | Tree and workspace membership | `unit` | `tools/guards/scaffold.test.ts` — reads `pnpm-workspace.yaml` and each manifest |
| R3 | `migrations/` tracked, not a member | `unit` | same guard |
| R4 | `strict: true` inherited, not weakened | `unit` | same guard — parses every member `tsconfig.json` |
| R5 | Node 24 pinned in both places, agreeing | `unit` | same guard |
| R6 | No `build` in `packages/*`; `exports` → `src/index.ts` | `unit` | same guard |
| R7 | Phase 2 filenames absent | `unit` | same guard |
| 1 | Clean install | `e2e` | Fresh clone into a temp dir, run the command |
| 2 | Frozen lockfile rejects drift | `e2e` | Mutate a version in a temp clone, expect non-zero, restore |
| 3 | Six scripts exit 0 | `e2e` | Run each from the repo root, capture exit codes |
| 4 | `Date` rejected in scheduler | `unit` | `tools/guards/date-ban.test.ts`, ESLint `lintText` API, synthetic filePath |
| 5 | `Date` accepted in domain | `unit` | same guard, second assertion |
| 6 | Scheduler purity | `unit` | `tools/guards/scheduler-purity.test.ts` |
| 7 | Stubs announce themselves | `e2e` | Run each, assert exit 0 **and** read stderr |
| 8 | No vacuous pass | `unit` + `e2e` | Guard asserts `passWithNoTests` absent; validation reads the reported test count |
| 9 | CSV cannot be committed | `e2e` | Synthetic file with the real filename shape, `git check-ignore`, `git add` |
| 10 | §11.2 filter resolves | `e2e` | Run the literal command, record the outcome either way |

Zero `inspection` criteria and zero `manual` criteria. Every one of the fourteen is executable.

## Explicitly not required

Named so validation does not report an absence as a defect:

- **A code formatter.** Not in the spec, not in the task. Raised in `plan.md` as a decision for the
  user; absent here by choice.
- **Any content in `packages/domain`, `packages/geo` or `packages/scheduler` beyond an empty
  `src/index.ts`.** `PlainDate`, `formatRoc()`, haversine and the zod schemas belong to Phases 1–2.
- **`wrangler.toml`, the `[assets]` block, any binding, any cron** → T04.
- **Migration `0001`** → T05. This task creates `migrations/` and its README only.
- **Hono, `/healthz`, a real `apps/api` entry point** → T07. `apps/api/src/index.ts` is a 501
  placeholder that exists only so `tsc` has an input.
- **Any `.github/workflows/` file, and the `.github/` directory itself** → T10, T16, T17.
- **`@cloudflare/vitest-pool-workers`, wrangler, Miniflare** → T06.
- **`zod`, `fast-check`** → T09 and Phase 2.
- **Any real UI in `apps/web`** → Phase 3. A placeholder that renders and builds is the whole
  requirement.
- **Proving CI runs these scripts.** T10 authors `ci.yml`; T20 proves it. This task only makes the
  six names exist.

## Needs a mock

**None.** T01 touches no third party — no Cloudflare, no Google, no LINE, no 1Password. This is the
only task in Phase 0 that can be validated with the network off, and validation should be run that
way to prove it.

`tools/mocks/` is created as an empty directory with a README. The first task to need it pays for
its contents: T06 for Miniflare fixtures, T08 for the mock JWKS at `tools/mocks/cf-access/`.

## Manual checks

**None.** Every criterion above is executable by an agent.

---

## Notes

- **Task criterion 3 is not literally satisfiable and has been re-read, not dropped.** It asks that
  `migrations/` be "a member of the pnpm workspace"; `migrations/` holds SQL and cannot sensibly be
  a package. R2 covers the five code members plus `tools`; R3 covers `migrations/` as a tracked
  directory. If you read the original criterion differently, say so now — it is frozen after
  agreement.
- **Scenario 10 is a cross-system contract check.** `docs/PLAN.md` §11.2 hard-codes
  `pnpm --filter web build`, written before the `@wherego/*` naming decision. The two must be
  reconciled here or T16 authors a `deploy.yml` that fails at T20 — during a real production deploy.
  The scenario deliberately accepts either outcome as a pass, provided the outcome is *recorded*.
- **Scenario 9 uses a synthetic file with a realistic name.** No real patient CSV is copied into the
  repo at any point, by any agent, for any reason. An empty file with the right name proves the
  ignore rule; its contents are irrelevant to the assertion.
- **The `Date` ban is tested via ESLint's `lintText` API, not by writing temp files.** The task's
  `## Validation` section describes the by-hand version. This is the same check, automated, and it
  therefore runs on every `pnpm test` and in CI rather than once.
- **Edge/failure categories that do not apply**, per the checklist: *expired* (no tokens, sessions
  or TTLs exist in a scaffold), *limit exceeded* (no quotas), *failed retry* (nothing retries),
  *concurrent change* (no shared mutable state). *Unauthorised* has no meaning here either —
  authentication arrives at T08. *Empty state*, *invalid input*, *PII* and *cross-system contract*
  all do apply and are Scenarios 8, 2, 9 and 10.
- **Depends on** nothing. **Blocks** T04, T05, T09, T10 — every agent-executed task in the phase.
