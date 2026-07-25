# T01 · Monorepo scaffold

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-02
**Spec** `docs/PLAN.md` §2 *Repo layout* · **Depends on** — · **State** `todo`
**Execution** agent

## Outcome

A pnpm workspace exists with every app and package wired and empty, and `pnpm typecheck`,
`pnpm lint`, `pnpm test`, `pnpm build` all run and pass across every workspace member.

## Scope

- **In:** pnpm workspaces, Node 24, TypeScript strict, vitest, eslint. The directory tree below.
  The root scripts, including `test:sim` and `test:worker` as stubs. The
  `no-restricted-globals` rule banning `Date` in `packages/scheduler`.
- **Out:** `wrangler.toml` (T04 — it needs the D1 `database_id` from T03). Migrations (T05).
  Any route handler (T07). `ci.yml` (T10 — this task only makes the scripts exist).

## Detail

The tree, from §2 *Repo layout*:

```
wherego/
├── .github/workflows/
│   ├── ci.yml               # PR gate — needs zero credentials
│   └── deploy.yml           # 1Password → migrate → secrets → deploy (production)
├── apps/
│   ├── api/                 # Cloudflare Worker (Hono)
│   │   ├── src/routes/      # app API, LINE webhook, cron handlers
│   │   ├── src/coordinator/ # PlanCoordinator Durable Object — the only writer
│   │   └── wrangler.toml
│   └── web/                 # React + Vite SPA, served via Workers Static Assets
├── packages/
│   ├── scheduler/           # PURE TypeScript. No I/O, no CF bindings, no fetch, no Date.
│   │   ├── candidates.ts    # due-date generation, cycle anchoring
│   │   ├── reachability.ts  # which runs can still reach a visit; last-chance (§5.3)
│   │   ├── assign.ts        # 3-class partition + greedy fill + day-open penalty
│   │   ├── route.ts         # Held-Karp exact ATSP for <=8 stops
│   │   ├── rules.ts         # 28-day cap, capacity, window feasibility, authorization
│   │   ├── mutate.ts        # move/swap preview, violations, suggestions
│   │   ├── catchup.ts       # urgent placement — go-live AND ongoing (§5.4)
│   │   └── simulate.ts      # 18-month deterministic replay harness (§5.8)
│   ├── domain/              # zod schemas, PlainDate + ROC math, CSV mapping, shared types
│   └── geo/                 # haversine, bounding-box check
├── migrations/              # D1 SQL migrations
└── docs/PLAN.md
```

The `packages/scheduler` filenames are the Phase 2 target layout, not this task's deliverable.
Create the package and its `src/`; do not create empty stub files for each one.

`packages/scheduler` **must stay pure** — no Cloudflare runtime, no database, no network. All rule
logic lives there and is verified in CI without deploying anything.

**`Date` is banned inside `packages/scheduler`,** enforced by `no-restricted-globals` as a CI
failure. Carried verbatim from §2, because summarized it reads as a style preference and gets
waived by the first person who needs a timestamp:

> This system is one large piece of calendar arithmetic in `Asia/Taipei` executed on UTC-clocked
> machines; a JS `Date` is an instant, not a date, and `addDays(d, 28)` on a `Date` parsed from an
> ISO string is UTC-midnight. Any stray `getDate()` / `getDay()` / local format produces a silent
> off-by-one that surfaces as a visit on the wrong day. `packages/domain` exports a branded
> `PlainDate = string & { __plainDate }` in `YYYY-MM-DD` with integer day-number arithmetic, and
> that is the only date type the scheduler sees. This single rule prevents more bugs than any other
> line in this document.

Root scripts, matching the `ci.yml` step list in §11.1 exactly — the later ones are stubs in
Phase 0. **Wire them now so nothing has to be added under pressure** (P0-12):

```
pnpm typecheck
pnpm lint          # incl. no-restricted-globals: Date banned in packages/scheduler
pnpm test          # unit + fast-check property tests + golden CSV fixture
pnpm test:sim      # §5.8 simulation at 38 / 100 / 330 patients
pnpm test:worker   # @cloudflare/vitest-pool-workers — real Miniflare D1
pnpm build
```

A stub script must **exit 0 and say it is a stub**. A script that does not exist yet is a
`deploy.yml` failure in T16; a script that silently passes forever is worse, because Phase 2 will
believe `test:sim` is running.

## Acceptance criteria

- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] All six of `typecheck`, `lint`, `test`, `test:sim`, `test:worker`, `build` exit 0 from the
      repo root.
- [ ] `apps/api`, `apps/web`, `packages/scheduler`, `packages/domain`, `packages/geo` and
      `migrations/` all exist and are members of the pnpm workspace.
- [ ] TypeScript is `strict: true` in the base config and every package inherits it.
- [ ] A file in `packages/scheduler` containing `new Date()` fails `pnpm lint`. A file in
      `packages/domain` containing the same **passes** — the ban is scoped, not global.
- [ ] `packages/scheduler`'s package manifest declares no dependency on any Cloudflare, database
      or HTTP package.
- [ ] Node 24 is pinned (`engines`, and `.nvmrc` or equivalent).

## Validation

Local only; no third party, no Cloudflare. Run each script from a clean `pnpm install`. Prove the
`Date` ban both ways by writing a temporary file under `packages/scheduler` and one under
`packages/domain` and observing the lint result differ — delete both afterwards. Confirm each stub
script prints that it is a stub rather than passing silently.

## Open questions

None. This task sets conventions everything after it copies, so `/design-task` should expect to ask
about naming, config layout and the eslint flat-vs-legacy choice rather than infer them.
