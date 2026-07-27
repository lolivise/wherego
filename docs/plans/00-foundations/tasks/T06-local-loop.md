# T06 · The local loop — `wrangler dev --local` with real D1 and migrations applied

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-15 (local-loop half)
**Spec** `docs/PLAN.md` §11.4 item 3 · **Depends on** T04, T05 · **State** `todo`
**Execution** agent

## Outcome

`wrangler dev --local` serves the Worker against a real local D1 with migration 0001 applied, and
`pnpm test:worker` runs the Worker under `@cloudflare/vitest-pool-workers` against the same schema
— reproducibly, from a documented command.

## Scope

- **In:** the local D1 setup, the migration-apply step, `test:worker` wired to real Miniflare D1,
  and the commands written down where the next task can find them.
- **Out:** the `cloudflared` tunnel and the dev LINE channel (T21 — it needs T13). Preview
  versions (T21). Any route beyond what T04 declares.

## Detail

This task is early on purpose. §11.4 lists local E2E with Miniflare as one of the three controls
that replace a staging environment, and **every later task in this phase is validated through it**
— T07's `/healthz`, T08's 403 assertion, T09's seed rows. A validation that cannot stand up the
local environment is not a validation, so the environment is built and proven once, here, rather
than improvised three times.

From §11.4:

> **Local E2E with Miniflare.** `wrangler dev --local` gives real D1. Migrations, the import flow,
> and the LINE webhook run locally against synthetic patients — the tunnel points at the **dev LINE
> channel** (§10.7 step 4), never at production. **Never put test patients in production D1.**

`test:worker` stops being a stub here. §11.1 on what it is for:

> `test:worker` runs the actual Worker against real Miniflare D1 inside CI: migrations, route
> handlers, a **signed** LINE webhook body, the import Save path, the Access default-deny allowlist
> assertion, and the cron handlers seeded with synthetic patients. It needs no credentials, so it
> preserves this workflow's best property.

In Phase 0 it carries the migration and the allowlist assertion; the rest arrive with their phases.
Wiring it to a real local D1 now is the deliverable.

## Found at T04 — 2026-07-26

**The command is `wrangler dev --local --env local`, and the `--env local` is not optional.**

Wrangler does **not** inherit `d1_databases` or `durable_objects` into a named environment. T04
therefore repeats both blocks under `[env.local]`, guarded by a both-directions deep-equal test — so
the local environment has a database only because that duplication exists. `[assets]` *is*
inherited and is deliberately not duplicated.

Without `--env local` the Worker gets the top-level (production) bindings but **no `ENVIRONMENT`
var**, so T08's local bypass never fires and every route returns 403. With it, all four bindings are
present: `DB`, `PLAN_COORDINATOR`, `ASSETS`, `ENVIRONMENT ("local")` — verified against
wrangler 4.114.0.

**`apps/web/dist` must exist before wrangler runs at all.** The `[assets]` block hard-errors if the
directory is absent, so `pnpm build` precedes anything in this task.

Also carried here: wrangler warns that **scheduled Workers are not triggered automatically in local
development**. The three crons are declared but will not fire; trigger one by hand with
`curl "http://localhost:8787/cdn-cgi/handler/scheduled"` if this task needs to see one run.

## Acceptance criteria

- [ ] One documented command brings up `wrangler dev --local` with migration 0001 already applied.
- [ ] Querying the local D1 through the running Worker returns the §3 schema — the sixteen tables
      and `uq_visits_cycle_live` are present in the *local* database, not just in the file.
- [ ] `pnpm test:worker` runs under `@cloudflare/vitest-pool-workers` against real Miniflare D1,
      applies the migrations, and exits 0. It no longer prints that it is a stub.
- [ ] `pnpm test:worker` requires **no credentials** — it passes with every variable from the
      §10.3 secrets table unset.
- [ ] The local database is reset-able to empty and re-migratable in one command, and the reset is
      idempotent.
- [ ] Nothing in this task can reach production D1: the commands are `--local` and the test pool is
      Miniflare.

## Validation

Run it. Then run it again from a clean state to prove the reset. Unset every §10.3 variable and
confirm `test:worker` still passes — that property is the reason `ci.yml` needs no credentials and
it is easy to lose by accident. Assert the schema from inside the running Worker, not from the
migration file. No third party is involved and no mock is needed yet.

## Open questions

None.
