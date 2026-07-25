# Execution — T01 Monorepo scaffold

## Attempt 1 — 2026-07-25

**Agent** sonnet · **Outcome** complete

### Changed

Every file is new; the repository was greenfield.

| File | Change |
|------|--------|
| `.gitignore` | `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `*.tsbuildinfo`, **`*.csv`** with `!tools/fixtures/**/*.csv` |
| `.nvmrc` | `24` |
| `package.json` | root — private, ESM, `packageManager: pnpm@11.0.8`, `engines.node: ">=24"`, the six CI scripts |
| `pnpm-workspace.yaml` | members `apps/*`, `packages/*`, `tools` — **plus an `allowBuilds` block, see Decided 1** |
| `tsconfig.base.json` | `strict: true` + the five extra flags |
| `eslint.config.js` | flat config; the `Date` ban scoped to `packages/scheduler/**/*.ts` |
| `vitest.config.ts` | one root project over `packages/*`, `apps/api`, `tools/guards` |
| `apps/api/…` | `package.json`, `tsconfig.json`, `src/index.ts` (501 placeholder), `src/routes/.gitkeep`, `src/coordinator/.gitkeep` |
| `apps/web/…` | `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` |
| `packages/{scheduler,domain,geo}/…` | `package.json` (`exports` → `./src/index.ts`, no `build`), `tsconfig.json`, empty `src/index.ts` |
| `tools/…` | `package.json`, `tsconfig.json` |
| `tools/guards/scaffold.test.ts` | R1–R7 and the `passWithNoTests` assertion |
| `tools/guards/date-ban.test.ts` | Scenarios 4–5 via ESLint `lintText`, synthetic filePaths, no temp files |
| `tools/guards/scheduler-purity.test.ts` | Scenario 6 |
| `tools/mocks/README.md` | the directory `CONVENTIONS.md` mandates; T06 and T08 fill it |
| `tools/stubs/{sim,worker}.mjs` | stderr + named successor + exit 0 |
| `migrations/README.md` | expand-only rule; the `patients` → `schedulable_patients` rule |
| `pnpm-lock.yaml` | generated |

No `.github/`, no `wrangler.toml`, no migration SQL, no Hono, no zod, no real UI. Scope held.

### Checks

Run by the harness independently after the agent reported, not taken from its summary.

| Command | Result |
|---------|--------|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | exit 0 — **3 files, 41 tests** |
| `pnpm test:sim` | exit 0, stub notice on stderr |
| `pnpm test:worker` | exit 0, stub notice naming T06 |
| `pnpm build` | exit 0, `apps/web/dist/index.html` produced |
| `eslint` on a probe under `packages/scheduler/src/` | **1 × `no-restricted-globals`** — ban confirmed |
| `eslint` on the byte-identical probe under `packages/domain/src/` | **No issues found** — scoping confirmed |
| `grep -rn passWithNoTests` | only inside the guard asserting its absence |
| `git status --porcelain` | no leftover probe files, no `.csv`, no `.github`, no `wrangler.toml` |

Resolved versions: `typescript@5.9.3`, `eslint@9.39.5`, `typescript-eslint@8.65.0`, `vitest@3.2.7`,
`react@19.2.8`, `vite@7.3.6`, `@vitejs/plugin-react@5.2.0`, `@types/node@24.13.3`.

### Decided beyond the plan

Each of these is a planning defect by definition — the plan should have said.

1. **pnpm 11's build-script approval gate.** pnpm 11.0.8 refuses to run `esbuild`'s postinstall
   non-interactively; unable to prompt, it writes a placeholder into `pnpm-workspace.yaml` and exits
   1 while swallowing stdout. Resolved with `pnpm approve-builds --all`, which pnpm recorded as
   `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`. **Folded back: yes** — into `plan.md`,
   and flagged on T10, because a fresh CI checkout hits the same gate and only passes because that
   file is in the tree.
2. **ESLint is not type-aware.** `typescript-eslint`'s non-type-checked `recommended`, rather than
   wiring a cross-package `parserOptions.project` graph for a scaffold with no logic in it.
   **Folded back: yes.** Revisit when real rule logic lands in Phase 2.
3. **Shared tooling lives in root `devDependencies` only**, relying on the upward `node_modules`
   walk — except `tools/`, which declares `eslint` explicitly because `date-ban.test.ts` imports it
   by name and a phantom dependency there would be a real defect. `apps/web` declares its own React
   and Vite. **Folded back: yes.**
4. **`@cloudflare/workers-types` added to `apps/api`** — already in the plan's dependency floors, so
   not strictly beyond it. No fold needed.
5. **A comment in `vitest.config.ts` tripped its own guard.** The first draft explained why
   `passWithNoTests` is not set, and the guard is a text scan for that token. The agent reworded the
   comment rather than weakening the assertion — the correct choice. **Recorded as a known
   brittleness**, not fixed: the contract is frozen and the text scan is a stricter proxy than the
   criterion requires.

### Deviations worth validation's attention

- **Scenario 1 was proven by `rsync`, not `git clone`.** The repository has zero commits, so a
  literal clone is impossible without committing — which the harness forbids. The agent copied the
  tree minus `.git` and `node_modules` into a temp dir and ran `pnpm install --frozen-lockfile`
  there. Honest and equivalent in substance, but it is not the literal criterion.
- **Scenario 10 resolved in the affirmative.** `pnpm --filter web build` — the literal string from
  `docs/PLAN.md` §11.2 — exits 0 and resolves to `@wherego/web`; pnpm substring-matches package
  names. **Plan Risk 1 is closed: T16 copies §11.2 verbatim and needs no change.**

### Not done

Nothing. All six scripts pass, both directions of the `Date` ban are proven twice over, and the
cross-package `exports` → `.ts` resolution was confirmed with a temporary import that was then
removed.

---

## Attempt 2 — 2026-07-25

**Agent** sonnet · **Outcome** complete · **Detail** [`fix-01.md`](fix-01.md)

Four bugs from [`validation-01.md`](validation-01.md): the `Date` ban closed against
`globalThis.Date`, computed access and type position; `@wherego/*` declared as `workspace:*`
dependencies of both apps so imports actually resolve; all six CI script names guarded; `engines.node`
tightened to `>=24 <25` with a guard that can tell a pin from a range.

Eight files, four regression tests, each proven to fail before the fix. Test count 41 → 54.
All six root scripts re-run by the harness: exit 0.

**Worth carrying forward:** attempt 1's confirmation that a cross-package import worked was
misleading — it added the dependency to test it, then removed it. The check passed for a state the
repo was not left in. Attempt 2's regression test spawns a `node` process with `NODE_PATH` stripped,
because both an in-process check and a naive subprocess pass whether or not the dependency is
declared.
