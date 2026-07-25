# WhereGo

Home-visit scheduling and routing for a clinic in 高雄市大寮區. Doctors and nurses visit patients at
home on a recurring prescription cycle; WhereGo decides who is due, fits them into days under a
per-doctor visit cap, and orders each day's stops into a route. The interface is 繁體中文 throughout.

It is a **scheduling** app. It holds six columns per patient — 姓名 · 出生日期 · 收案日期 · 核定迄日 ·
地點 · 預訪日期 — and no diagnosis, no 身分證號, and no health data.

The specification is `docs/PLAN.md`. This file describes **what exists today**.

## Stack

- **Runtime** — Cloudflare Workers, one deployable. *Not yet wired: no `wrangler.toml` exists (T04).*
- **Storage** — Cloudflare D1. *Not yet wired: no migrations exist (T05).*
- **Web** — React 19 + Vite 7 SPA, to be served by the Worker as Static Assets.
- **Language** — TypeScript 5.9, strict, ESM throughout. Node 24, pnpm 11 workspaces.
- **Test / lint** — Vitest 3, ESLint 9 flat config with typescript-eslint 8.

## Structure

```
apps/
  api/                    Cloudflare Worker — app API, LINE webhook, cron handlers
    src/
      index.ts            Placeholder entry returning 501; replaced by the Hono app (T07)
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
  stubs/
    sim.mjs               Stub for `pnpm test:sim` — exits 0, announces itself on stderr (Phase 2)
    worker.mjs            Stub for `pnpm test:worker` — exits 0, announces itself on stderr (T06)
  mocks/                  Mock third-party servers, committed and shared across phases (empty)

migrations/               D1 SQL migrations, expand-only (empty but for its README)

eslint.config.js          Flat config. Owns the Date ban — see Conventions
tsconfig.base.json        strict: true plus noUncheckedIndexedAccess; every package extends this
vitest.config.ts          One root project over packages/*, apps/api and tools/guards
pnpm-workspace.yaml       Workspace members, and the esbuild build-script approval CI depends on
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

Two further rules have no code to point at yet: every D1 write goes through the `PlanCoordinator`
Durable Object, and migrations are expand-only.

## Running it

```
pnpm install     # requires Node 24
pnpm typecheck
pnpm lint        # includes the Date ban
pnpm test
pnpm build       # → apps/web/dist/
```

`pnpm test:sim` and `pnpm test:worker` exist and exit 0, but are **stubs** — they announce
themselves on stderr and run nothing. There is no dev server and nothing to deploy yet.
