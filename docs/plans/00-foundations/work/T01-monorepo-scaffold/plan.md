# Implementation plan — T01 Monorepo scaffold

**Task** [`../../tasks/T01-monorepo-scaffold.md`](../../tasks/T01-monorepo-scaffold.md) · **Spec** `docs/PLAN.md` §2 *Repo layout*, §11.1
**Written** 2026-07-25 · **Revision** 1

## What exists now

**Nothing.** `git ls-files` returns zero rows — the repository has never had a commit containing
source. The working tree holds `docs/`, `.claude/`, `CLAUDE.md` and nothing else; there is no
`package.json`, no lockfile, no `node_modules`, no `tsconfig`, no `.gitignore`.

That is the central fact about this task. There is no neighbouring module to copy naming from, no
existing test layout to match, no error-handling idiom already in play. **Every convention this task
sets is inherited unexamined by the twenty tasks after it**, which is why four questions went to the
user before any of it was written down (see `## Answered questions`).

Local toolchain observed: Node `v24.14.1` active, nvm holding `20.19.4` / `22.18.0` / `24.14.1`;
pnpm `11.0.8`. `~/.npmrc` maps `@rentcomau` to a private Verdaccio registry — `@wherego` is unmapped
and therefore resolves to workspace links only, which is what we want.

## Approach

### The five conventions being set

| | Decision | Alternative, and why it lost |
|---|---|---|
| Node | **24**, pinned in `.nvmrc`, `engines` (`>=24 <25` — corrected at fix 01; `>=24` did not satisfy R5's "the two agree") and CI | 22, as the spec originally said. The user chose to move the spec instead of living with the local/CI split; `docs/PLAN.md` §11.1 and §11.2 have been edited to `node-version: 24` as part of this task. |
| Package names | **`@wherego/*`** | Bare `domain` / `geo` collide with a real Node builtin and a real npm package, so a broken workspace link resolves to the wrong thing silently instead of failing. |
| ESLint | **Flat `eslint.config.js`**, ESLint 9 + typescript-eslint 8 | Legacy `.eslintrc` needs `ESLINT_USE_FLAT_CONFIG=false` on ESLint 9 and disappears in ESLint 10 — a forced migration mid-project. |
| Package consumption | **TypeScript source direct.** Each package's `exports` points at `src/index.ts`; nothing pre-builds | Compiling each package to `dist/` gives `pnpm build` more to do, but introduces a topological build order and the stale-`dist` bug class: edit `scheduler`, forget to rebuild, tests pass against yesterday's code. In a repo whose entire correctness story is rule logic in `packages/scheduler`, that failure mode is unacceptable. |
| Module system | **ESM throughout** (`"type": "module"`), `moduleResolution: "bundler"` | CJS is not a real option for a Workers + Vite stack. |

### Why source-direct consumption works here

Both consumers compile TypeScript themselves — Wrangler bundles `apps/api` with esbuild, Vite
bundles `apps/web`. Pointing `exports` at `./src/index.ts` and setting
`moduleResolution: "bundler"` lets TypeScript, esbuild and Vite all resolve through the pnpm
workspace symlink to the real source. `pnpm typecheck` is then the thing that proves the packages
compile; there is no separate artifact that can drift from it.

### What `pnpm build` means under that model

`packages/*` have no `build` script. `apps/api` has none either in this task — it cannot build
until `wrangler.toml` exists (T04). So root `build` is the web build and only the web build. T04 and
T16 extend it.

**Cross-task hazard, recorded here because T16 will trip on it.** `docs/PLAN.md` §11.2 step 2 says
`pnpm --filter web build`, written before the naming decision. Scoped names may or may not match an
unscoped `--filter` argument depending on pnpm's resolution rules. Build must **run that exact
command** and record whether it resolves; if it does not, T16 uses `@wherego/web` and this plan is
the record of why the spec's literal string was not copied.

### Strictness beyond `strict: true`

`tsconfig.base.json` also sets `noUncheckedIndexedAccess: true`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `isolatedModules` and `verbatimModuleSyntax`.

`noUncheckedIndexedAccess` is the debatable one. It will be mildly painful in the Held–Karp DP
tables of `packages/scheduler/route.ts` (Phase 2). It goes in now because **the reversible direction
is on**: turning it off later is one flag, turning it on after Phase 2 exists is a refactor of the
most correctness-critical code in the system.

### `packages/scheduler` purity, as a test rather than a promise

Acceptance criterion 6 ("declares no dependency on any Cloudflare, database or HTTP package") is a
property of a file, so it gets a real test rather than an inspection: `tools/guards/` reads
`packages/scheduler/package.json` and asserts its `dependencies` contain nothing matching a
forbidden list. It is permanent, it costs milliseconds, and it fails the moment someone adds `hono`
to the pure package.

### The `Date` ban, proven automatically rather than by hand

The task's `## Validation` section describes proving the ban by hand — write a temp file under
`packages/scheduler`, write one under `packages/domain`, observe the lint results differ, delete
both. That works, and nobody will ever run it twice.

Instead: a vitest test uses ESLint's Node API `lintText(code, { filePath })` with two synthetic
paths — `packages/scheduler/src/__probe.ts` and `packages/domain/src/__probe.ts` — and asserts the
first reports a `no-restricted-globals` error and the second reports none. No files are written, no
subprocess is spawned, and criterion 5 is checked on every `pnpm test` and therefore in CI.

### Stubs that cannot rot silently

`test:sim` and `test:worker` are stubs in this phase. The task is explicit that a silently-passing
stub is worse than a missing script, because Phase 2 will believe `test:sim` is running. Each stub
writes to **stderr**, names itself a stub, names the task that replaces it, and exits 0.

`passWithNoTests` is **not** set anywhere. Vitest's default is to fail when it finds no test files,
which is the property that stops `pnpm test` from passing vacuously.

## Changes

| # | File | Change | Why |
|---|------|--------|-----|
| 1 | `.gitignore` | new | `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `*.tsbuildinfo` — **and `*.csv`**, with `!tools/fixtures/**/*.csv` as the only exception. The standing rule is that patient CSVs are never committed; an ignore rule enforces it, a convention does not. |
| 2 | `.nvmrc` | new — `24` | |
| 3 | `package.json` (root) | new — private, `"type": "module"`, `packageManager: "pnpm@11.0.8"`, `engines.node: ">=24"`, the six scripts | The six scripts are the contract T10's `ci.yml` consumes |
| 4 | `pnpm-workspace.yaml` | new — `apps/*`, `packages/*`, `tools` | |
| 5 | `tsconfig.base.json` | new — `strict: true` + the five extra flags above | Every package extends this and only this |
| 6 | `eslint.config.js` | new — flat config; repo-wide TS rules, plus the `packages/scheduler` `Date` ban entry | |
| 7 | `vitest.config.ts` (root) | new — one project covering `packages/*/src/**/*.test.ts`, `apps/api/src/**/*.test.ts`, `tools/guards/**/*.test.ts` | A single root project avoids per-package "no tests found" failures while `packages/geo` and `packages/domain` are still empty |
| 8 | `packages/scheduler/{package.json,tsconfig.json,src/index.ts}` | new | `src/index.ts` is empty of exports; the Phase 2 filenames in §2 are **not** created as stubs |
| 9 | `packages/domain/{package.json,tsconfig.json,src/index.ts}` | new | |
| 10 | `packages/geo/{package.json,tsconfig.json,src/index.ts}` | new | |
| 11 | `apps/api/{package.json,tsconfig.json,src/index.ts}` + empty `src/routes/`, `src/coordinator/` | new | `src/index.ts` is a 501 placeholder default export, commented as T07's replacement target. Something must exist or `tsc` errors with "No inputs were found" |
| 12 | `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/App.tsx}` | new | Minimal React 19 + Vite SPA that renders a placeholder and builds to `dist/` |
| 13 | `tools/{package.json,tsconfig.json}` | new — private `@wherego/tools` | Home for the two guards below, and for `tools/mocks/<service>/` which `CONVENTIONS.md` already mandates for T06/T08 |
| 14 | `tools/guards/scheduler-purity.test.ts` | new | Criterion 6, automated |
| 15 | `tools/guards/date-ban.test.ts` | new | Criterion 5, automated, both directions |
| 15a | `tools/guards/scaffold.test.ts` | new | R1–R7 of `acceptance.md` — workspace membership, `strict` inheritance, the Node pin, the six script names, `exports` targets, absence of the Phase 2 stub files. Added when writing the contract: these were going to be `inspection` criteria, and `CONVENTIONS.md` treats more than a couple of those as a sign the task is not testable as written |
| 15b | `tools/mocks/README.md` | new | The directory `CONVENTIONS.md` mandates. Empty now; T06 and T08 fill it |
| 16 | `tools/stubs/{sim,worker}.mjs` | new | The two stubs. stderr + named successor + exit 0 |
| 17 | `migrations/README.md` | new | The directory must exist and git does not track empty directories. Content: the expand-only rule and the "a migration touching `patients` drops and recreates `schedulable_patients`" rule, so T05 reads it before writing 0001 |
| 18 | `pnpm-lock.yaml` | generated, committed | `--frozen-lockfile` in CI is meaningless without it |
| 19 | `docs/PLAN.md` §11.1, §11.2 | **already edited** — `node-version: 22` → `24` | Done during design, not left to build |

Order: 1–7 (root), then 8–13 (members), then `pnpm install`, then 14–17, then verification.

## Interfaces

**Root scripts** — these six names are consumed verbatim by T10's `ci.yml` (§11.1) and must not be
renamed:

```jsonc
{
  "typecheck":   "pnpm -r --parallel typecheck",
  "lint":        "eslint .",
  "test":        "vitest run",
  "test:sim":    "node tools/stubs/sim.mjs",
  "test:worker": "node tools/stubs/worker.mjs",
  "build":       "pnpm --filter @wherego/web build"
}
```

**Workspace members** — five packages plus `tools`:

| Directory | Name | `exports` | Has `build`? |
|---|---|---|---|
| `packages/scheduler` | `@wherego/scheduler` | `./src/index.ts` | no |
| `packages/domain` | `@wherego/domain` | `./src/index.ts` | no |
| `packages/geo` | `@wherego/geo` | `./src/index.ts` | no |
| `apps/api` | `@wherego/api` | — | no (T04) |
| `apps/web` | `@wherego/web` | — | yes (`vite build`) |
| `tools` | `@wherego/tools` | — | no |

Every one of them declares `"typecheck": "tsc --noEmit"`.

**The `Date` ban**, as the flat-config entry — this is the mechanism acceptance criterion 5 tests:

```js
{
  files: ['packages/scheduler/**/*.ts'],
  rules: {
    'no-restricted-globals': ['error', {
      name: 'Date',
      message:
        'Date is banned in packages/scheduler. A JS Date is an instant, not a date; ' +
        'use PlainDate integer day arithmetic from @wherego/domain. See docs/PLAN.md §2.',
    }],
  },
}
```

**Folded back from attempt 1** — three things this plan should have specified and did not:

- **`pnpm-workspace.yaml` carries an `allowBuilds` block.** pnpm 11 gates postinstall scripts behind
  interactive approval; `esbuild` needs one. Without the block committed, a fresh `pnpm install`
  exits 1 while swallowing stdout. `allowBuilds: { esbuild: true }`, written by
  `pnpm approve-builds --all`. **T10 must treat this as a CI prerequisite.**
- **ESLint is not type-aware.** `typescript-eslint`'s non-type-checked `recommended`. Wiring a
  cross-package `parserOptions.project` graph buys nothing for a scaffold with no logic in it, and
  costs lint time on every CI run. Revisit when Phase 2 lands real rule logic.
- **Shared tooling is declared in root `devDependencies` only**, resolved by the upward
  `node_modules` walk. Two exceptions, both deliberate: `tools/` declares `eslint` because
  `date-ban.test.ts` imports it by name, and `apps/web` declares its own React and Vite because they
  are direct dependencies of its source.

**Dependency floors** (pnpm resolves the patch; the lockfile records what was chosen):
`typescript ^5`, `eslint ^9`, `typescript-eslint ^8`, `vitest ^3`, `react ^19`, `react-dom ^19`,
`vite ^7`, `@vitejs/plugin-react ^5`, `@cloudflare/workers-types` latest.

`packages/scheduler` declares **no** `dependencies` at all. `zod`, `hono`, `wrangler`,
`@cloudflare/vitest-pool-workers` and `fast-check` are **not** installed by this task — each arrives
with the task that first needs it (T09, T07, T04, T06, Phase 2 respectively).

## Tests

| Acceptance criterion | Proven by |
|---|---|
| 1 · `pnpm install --frozen-lockfile` from clean checkout | `/validate-task`, against a fresh clone into a temp dir |
| 2 · all six scripts exit 0 | `/validate-task`, run individually from the repo root |
| 3 · members exist and are in the workspace | `pnpm ls -r --depth -1` lists all six; `migrations/` checked as a **directory** — see Risks |
| 4 · `strict: true` inherited everywhere | Inspection of `tsconfig.base.json` + every member `extends` it and overrides no strictness flag |
| 5 · `Date` banned in scheduler, allowed in domain | `tools/guards/date-ban.test.ts` — automated, both directions |
| 6 · scheduler manifest declares no CF/db/HTTP dep | `tools/guards/scheduler-purity.test.ts` — automated |
| 7 · Node 24 pinned | Inspection of `.nvmrc` + root `engines.node` |

Additionally, and not from the criteria list: **each stub must be observed printing its stub notice**
(the task's `## Validation` requires it), and `pnpm --filter web build` must be observed resolving or
not resolving.

## Risks

1. ~~**`pnpm --filter web build` may not match `@wherego/web`.**~~ **CLOSED at attempt 1.** The
   literal string from §11.2 exits 0 and resolves to `@wherego/web` — pnpm substring-matches package
   names. T16 copies §11.2 verbatim and needs no change.
2. **Acceptance criterion 3 is not literally satisfiable.** It says `migrations/` is "a member of the
   pnpm workspace"; `migrations/` is plain SQL and cannot sensibly be a workspace package. Read as:
   the directory exists and is tracked, the five code members are workspace members. Recorded so
   `/validate-task` does not fail the task on an impossible requirement — and so the reading is the
   user's to reject, not an agent's to invent.
3. **`pnpm test` passing vacuously.** Mitigated by never setting `passWithNoTests`, and by the two
   guards existing from day one. Validation should confirm vitest reports a non-zero test count.
4. **A stub that exits 0 silently.** Mitigated by writing to stderr with the successor task named.
   Validation must read the output, not just the exit code.
5. **`moduleResolution: "bundler"` resolving `exports` to a `.ts` file.** Standard for internal
   workspace packages, but if the installed TypeScript rejects it the fallback is a `publishConfig`
   /`types` split. Build must confirm a cross-package import actually typechecks rather than
   assuming it — a temporary import of `@wherego/domain` from `@wherego/geo` is enough, removed
   afterwards.
6. **`*.csv` in `.gitignore` could hide a legitimate fixture.** Deliberate. The exception is narrow
   and explicit; the failure mode it prevents is committing patient data.

## Answered questions

- **2026-07-25 · Node 22 (spec) or Node 24 (local)?** → **Move the spec to Node 24.** `.nvmrc`,
  `engines` and CI all say 24. `docs/PLAN.md` §11.1 + §11.2, `docs/plans/00-foundations.md` and the
  T01 task file were edited during design so no downstream task reads 22. (user)
- **2026-07-25 · Scoped or bare package names?** → **Scoped, `@wherego/*`.** (user)
- **2026-07-25 · ESLint flat config or legacy `.eslintrc`?** → **Flat `eslint.config.js`**, ESLint 9
  + typescript-eslint 8. This is what makes the `Date` ban a `files:`-scoped array entry. (user)
- **2026-07-25 · Packages consumed as TS source or compiled to `dist/`?** → **TS source direct**, no
  build step for `packages/*`. (user)

## Out of scope

- `wrangler.toml`, the D1 binding, crons, `[env.local]` → **T04**
- Migration 0001 → **T05** (this task creates the empty `migrations/` directory and its README only)
- `wrangler dev --local`, `@cloudflare/vitest-pool-workers`, replacing the `test:worker` stub → **T06**
- Hono, `/healthz`, the real `apps/api` entry point → **T07**
- `.github/workflows/*.yml` → **T10** (ci), **T16** (deploy), **T17** (backup). This task creates no
  workflow files and no `.github/` directory.
- The §5.8 simulation harness, replacing the `test:sim` stub → **Phase 2**
- The Phase 2 filenames listed under `packages/scheduler` in §2 — `candidates.ts`, `route.ts` et al.
  are the target layout, and the task file explicitly says not to create them as stubs.
- **A code formatter.** Not in the spec and not in the criteria, so not added. Worth raising later:
  twenty tasks of Sonnet-authored code with no formatter will produce diff noise. That is a decision
  for the user, not a scope expansion for this task.
