# WhereGo

Home-visit scheduling and routing for a clinic in 高雄市大寮區. Doctors and nurses visit patients at
home on a recurring prescription cycle; WhereGo decides who is due, fits them into days under a
per-doctor visit cap, and orders each day's stops into a route. The interface is 繁體中文 throughout.

It is a **scheduling** app. It holds six columns per patient — 姓名 · 出生日期 · 收案日期 · 核定迄日 ·
地點 · 預訪日期 — and no diagnosis, no 身分證號, and no health data.

The specification is `docs/PLAN.md`. This file describes **what exists today**.

## Stack

- **Runtime** — Cloudflare Workers, one deployable, configured by `apps/api/wrangler.toml`.
  `wrangler deploy --dry-run` resolves it warning-free with no Cloudflare credentials. *Nothing has
  been deployed (T18, T20).*
- **Storage** — Cloudflare D1, bound as `DB`. The full schema exists as migration `0001` and applies
  cleanly, but *nothing applies it yet*: there is no `wrangler d1 migrations apply` (T06).
- **Web** — React 19 + Vite 7 SPA, served by the Worker as Static Assets. Every request reaches the
  Worker first (`run_worker_first = true`), which then falls through to the `ASSETS` binding.
- **Language** — TypeScript 5.9, strict, ESM throughout. Node 24, pnpm 11 workspaces.
- **Test / lint** — Vitest 3, ESLint 9 flat config with typescript-eslint 8.

## Structure

```
apps/
  api/                    Cloudflare Worker — app API, LINE webhook, cron handlers
    wrangler.toml         The Worker's whole configuration: D1 binding, the PlanCoordinator
                          Durable Object (SQLite-backed), three cron triggers, [assets] with
                          run_worker_first, and an [env.local] that repeats the two blocks
                          wrangler does not inherit. Most of the file is comments recording
                          measured wrangler behaviour — do not "tidy" them
    src/
      index.ts            Stub entry: exports the PlanCoordinator 501 stub the dry run requires,
                          and falls through to env.ASSETS.fetch() so SPA deep links resolve.
                          T07 replaces the fetch handler; the class stays until Phase 3
      index.test.ts       Behavioural guard for index.ts — imports the module and runs it. T07
                          REWRITES this, it does not delete it
      routes/             App API, LINE webhook and cron route handlers (empty)
      coordinator/        PlanCoordinator Durable Object — the only writer to D1 (empty)
  web/                    React + Vite SPA, served via Workers Static Assets
    index.html            Vite entry document
    vite.config.ts        Vite + React plugin; builds to dist/
    src/
      main.tsx            React root mount
      App.tsx             Placeholder view; the real UI is Phase 3

packages/
  scheduler/              PURE scheduling engine. No I/O, no Cloudflare, no fetch, no Date
    src/index.ts          Empty; the Phase 2 modules land here
  domain/                 Shared types, zod schemas, PlainDate & ROC date arithmetic
    src/index.ts          Empty; PlainDate and formatRoc/parseRoc land here in Phase 1
  geo/                    Haversine distance and bounding-box checks
    src/index.ts          Empty

tools/                    Repo-level tooling; not shipped
  guards/
    scaffold.test.ts      Asserts the scaffold's own invariants — workspace membership, strict
                          inheritance, the Node pin, all six CI script names, no Phase 2 stubs
    date-ban.test.ts      Proves the Date ban fires in scheduler and does NOT fire in domain,
                          across every known bypass. Uses ESLint's lintText API, no temp files
    scheduler-purity.test.ts  Asserts packages/scheduler declares no Cloudflare, database, HTTP
                          or date-library dependency, in any dependency field
    workspace-imports.test.ts  Proves each app can actually resolve its @wherego/* imports, via a
                          node subprocess with NODE_PATH stripped so the pnpm store cannot fake it
    wrangler-config.test.ts  Parses apps/api/wrangler.toml and asserts every criterion readable
                          without running wrangler. Also the repo-wide R11 scan: parses every
                          wrangler config in the tree and proves exactly one sets ENVIRONMENT.
                          Carries a coverage-boundary comment naming what it does NOT catch —
                          measured across six attempts, and not to be deleted
    schema-0001.test.ts   Applies migration 0001 to an in-memory node:sqlite database and asserts
                          the created schema, not the file: the object set, every table's columns,
                          the partial index's WHERE clause, each CHECK, and byte-identity with §3
  stubs/
    sim.mjs               Stub for `pnpm test:sim` — exits 0, announces itself on stderr (Phase 2)
    worker.mjs            Stub for `pnpm test:worker` — exits 0, announces itself on stderr (T06)
  mocks/                  Mock third-party servers, committed and shared across phases (empty)

migrations/               D1 SQL migrations, expand-only. Not a workspace member
  0001_initial_schema.sql  The whole §3 schema: 16 tables, the schedulable_patients view, 7
                          indexes. A verbatim copy of docs/PLAN.md §3, comments included

eslint.config.js          Flat config. Owns the Date ban — see Conventions
tsconfig.base.json        strict: true plus noUncheckedIndexedAccess; every package extends this
vitest.config.ts          One root project over packages/*, apps/api and tools/guards
pnpm-workspace.yaml       Workspace members, and the esbuild/workerd build-script approvals CI
                          depends on
.nvmrc                    Node 24
```

## Conventions

`.claude/harness/CONVENTIONS.md` is the full contract. The two that shape the code:

- **`Date` is banned inside `packages/scheduler`**, enforced by `eslint.config.js` as a CI failure.
  A JS `Date` is an instant, not a date, and produces silent off-by-ones in `Asia/Taipei` arithmetic
  run on UTC machines. The ban covers the bare global, `globalThis`/`self`/`window` access, type
  position, `typeof` queries, `Intl`, `performance`, and imported date libraries. It is scoped to
  that one package — `packages/domain` is where date handling belongs.
- **No rule has a second implementation.** One `respectsCap`, one last-chance test, one
  `formatRoc()` pair. `doc.md` names the owning file so this is checkable by reading.

- **The schema is `docs/PLAN.md` §3, and the migration is a verbatim copy of it.**
  `schema-0001.test.ts` asserts byte-identity, so the two cannot drift. **Do not weaken that check** —
  it is measured, not assumed, that seven defect classes are caught by it and nothing else: a
  changed column type, a dropped `NOT NULL`, a changed `DEFAULT`, a *widened* `CHECK` list, an index
  built on the wrong columns under the right name, a narrowed `PRIMARY KEY`, and column reordering.
  If the check becomes inconvenient, the fix is to reconcile §3 and the migration, not to relax the
  comparison. The reasoning is repeated on the check itself.
- **Migrations are expand-only**, and one touching `patients` drops and recreates
  `schedulable_patients` — the view enumerates its columns because SQLite expands `SELECT *` at
  creation time, so a later `ADD COLUMN` would silently not appear in it. See `migrations/README.md`.

One rule still has no code to point at: every D1 write goes through the `PlanCoordinator` Durable
Object.

## Running it

```
pnpm install     # requires Node 24
pnpm typecheck
pnpm lint        # includes the Date ban
pnpm test
pnpm build       # → apps/web/dist/  — run this BEFORE any wrangler command
```

Against the Worker configuration, after `pnpm build`:

```
pnpm --filter api exec wrangler deploy --dry-run --env=""      # production; exits 0, no credentials
pnpm --filter api exec wrangler deploy --dry-run --env=local   # adds ENVIRONMENT ("local")
```

Both need `apps/web/dist` to exist — wrangler hard-errors naming `assets.directory` without it, which
is why `pnpm build` comes first. Neither needs a Cloudflare account. `--env=""` rather than a bare
dry run: with a named environment defined, wrangler warns that no target was specified.

`pnpm test:sim` and `pnpm test:worker` exist and exit 0, but are **stubs** — they announce
themselves on stderr and run nothing. There is no local dev loop yet (T06) and nothing has been
deployed.
