# Acceptance criteria — T04 `wrangler.toml`

**Task** [`../../tasks/T04-wrangler-config.md`](../../tasks/T04-wrangler-config.md) ·
**Plan** [`plan.md`](plan.md) · **Written** 2026-07-26 · **Status** **agreed** — frozen 2026-07-26. Changing anything below requires
the user and goes in `progress.md`.

> **Amendment 1 — 2026-07-26, approved by the user after validation 03.** Two changes, both to how a
> criterion is *proven*, neither to what the configuration must be. **R11** narrows from *"nothing
> else in the repository"* to *"no other wrangler configuration"*, and its check moves from a
> repo-wide text scan to a parse of every wrangler config — the vectors dropped (`.sh` files, YAML
> `env:` blocks, `docs/` prose) were measured in validation 02 and **cannot reach the deployed
> Worker**; the vector that can and never was covered, `wrangler secret bulk`, is handed to T16 as a
> criterion. **Evidence row 13** moves from `tools/guards/wrangler-config.test.ts` to
> `apps/api/src/index.test.ts`; the method stays `unit` and becomes a behavioural one. R13's wording
> is unchanged. Reasoning in [`plan.md`](plan.md) revision 2; the three rounds that forced it are in
> `validation-01.md` … `validation-03.md`.

> **Description correction — 2026-07-26, within Amendment 1's scope.** Evidence row 13's *Where*
> column did not mention the Phase-3 assertion that `fix-03.md` added, so the contract described
> less than the code proves. Corrected above. **No criterion changed** — R13's wording is untouched
> and this alters only where the evidence is recorded, which Amendment 1 already authorised.
>
> **Noted, not changed:** R13 says *"the class body is a 501 with a comment naming Phase 3 as its
> owner."* Idiomatic TypeScript puts a doc comment **above** the declaration it documents, not
> inside a two-line method, so no correct implementation satisfies those words literally. The
> intent is met and `"Phase 3"` appears exactly once in `index.ts`, immediately above the class.
> Raised by validation-05's sign-off lens, which recommended recording it rather than reopening
> design; that recommendation was accepted. **Whoever amends this contract next should reword the
> clause.**

## Purpose

As **the WhereGo deployment chain**
I want **one `wrangler.toml` that declares the D1 database, the `PlanCoordinator` Durable Object,
the three cron triggers, the static-asset serving and a local environment that actually has
bindings**
So that **T06 can run the app locally against real D1, T08 can enforce default-deny over every path,
and T20's production deploy has exactly one deployable and one origin.**

This is a hybrid card. Most of it is configuration with no behaviour of its own, so it is written as
**requirements** with a mechanical check each. The parts that do have observable behaviour — what
wrangler resolves, what the local server serves — are **scenarios**.

## Requirements

**R1 · The file exists and identifies the Worker.**
`apps/api/wrangler.toml`, with `name = "wherego"`, `main = "src/index.ts"`, and a
`compatibility_date`.

**R2 · `workers_dev` is exactly `false`.**
The boolean `false`, not `"false"` and not absent. §9(b): `*.workers.dev` cannot be placed behind
Access, and this is one of the three legs of the authentication design.

**R3 · There is no `[limits]` block anywhere in the file** — top level or in any environment — and a
comment naming §2 and T03 explains the omission. `limits.cpu_ms` is Paid-only and the account is on
Workers Free.

**R4 · The D1 binding names the T03 database.**
`binding = "DB"`, `database_name = "wherego"`,
`database_id = "f5adacb4-abce-41c9-aa82-86dc3b6f8334"`.

**R5 · `PlanCoordinator` is declared SQLite-backed.**
A Durable Object binding with `class_name = "PlanCoordinator"`, and a migration entry listing it
under `new_sqlite_classes`. **The string `new_classes` appears nowhere in the file** — key-value
Durable Objects are Paid-only and the failure would not surface until first instantiation.

**R6 · All three cron expressions are present, in order, byte-identical to the task file**, and each
line carries its `Asia/Taipei` comment. A comment states that Taipei is fixed UTC+8 with no DST and
that the second expression's `0-4` is not a typo.

**R7 · The `[assets]` block serves the built SPA.**
`directory` resolves to `apps/web/dist` from the config file's own location,
`binding = "ASSETS"`, `not_found_handling = "single-page-application"`.

**R8 · `run_worker_first` is the boolean `true`.**
Not an array, not absent. **The array form is the failure mode being guarded against**: it inverts
the default for every path outside the list, so an unlisted route is served by the asset router and
never reaches the Worker at all. The measured behaviour table is carried into the file as a comment.

**R9 · `[env.local]` sets `ENVIRONMENT = "local"` and repeats the two blocks wrangler does not
inherit.**
`d1_databases` and `durable_objects.bindings` under `[env.local]` are **deep-equal to their
top-level counterparts, in both directions**. `[assets]` is inherited and is **not** duplicated.

**R10 · No §10.3 runtime secret name appears in the file.**
None of `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `CF_ACCESS_AUD`,
`CF_ACCESS_TEAM_DOMAIN`, `LINE_ALERT_RECIPIENT`, `HEALTHCHECK_PING_URL`, `BACKUP_AGE_PUBLIC_KEY` —
as a name or a value. They are pushed by `wrangler secret bulk` at T20.

**R11 · No wrangler configuration in the repository sets `ENVIRONMENT` anywhere but `[env.local]`,
and there only to `"local"`.** *(amended — see Amendment 1)*
Every `wrangler.toml` / `wrangler.json` / `wrangler.jsonc` in the tree is parsed; across all of
them, exactly one `vars` table sets `ENVIRONMENT`, it is `env.local`'s, and the value is exactly
`"local"`. T08's bypass is gated on the **value**, not on the environment's name, so a second
environment setting it to anything at all is a violation. A `wrangler secret bulk` payload
containing `ENVIRONMENT` reaches the Worker by a route no config guard can see — that is **T16's**
criterion, not this one.

**R12 · The toolchain is declared.**
`wrangler` in `devDependencies` of `@wherego/api` (§11.2 runs `pnpm --filter api exec wrangler`);
`workerd` added to `allowBuilds` in `pnpm-workspace.yaml`; the guard's TOML parser in
`devDependencies` of `@wherego/tools`.

**R13 · `apps/api/src/index.ts` exports a `PlanCoordinator` stub and falls through to the assets
binding.** The class body is a 501 with a comment naming Phase 3 as its owner. The default `fetch`
returns `env.ASSETS.fetch(request)`.

---

## Scenario 1: wrangler resolves the production config with no warning and no credentials

Given `apps/web/dist` has been produced by `pnpm build`
And no `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is set in the environment
When `pnpm --filter api exec wrangler deploy --dry-run --env=""` is run
Then the command exits **0**
And **stderr is empty** — no warning, and specifically no unrecognized-key warning, which is what
proves the asset field names are the installed wrangler's own rather than remembered
And stdout reports reading the assets directory with a file count **greater than zero**
And the binding table lists `env.DB`, `env.PLAN_COORDINATOR` and `env.ASSETS`

> `--env=""` rather than a bare dry run: with any named environment defined, wrangler warns that no
> target environment was specified. That warning is not a defect in this file.

## Scenario 2: the local environment has the bindings it needs

Given the same built `dist`
When `pnpm --filter api exec wrangler deploy --dry-run --env=local` is run
Then the command exits **0**
And **stderr is empty** — in particular there is no
`"d1_databases" exists at the top level, but not on "env.local"` warning
And the binding table lists **all four** of `env.DB`, `env.PLAN_COORDINATOR`, `env.ASSETS` and
`env.ENVIRONMENT ("local")`

> This is the scenario that catches the duplication being "tidied away". Without the repeated
> blocks, `env.ENVIRONMENT` is the only binding the local environment has, and T06's local loop runs
> against no database.

## Scenario 3: the two `[env.local]` blocks cannot drift from the top-level ones

Given the guard test at `tools/guards/wrangler-config.test.ts`
When `database_id` is changed under `[env.local]` and not at the top level
Then `pnpm test` **fails**, naming the field that differs

Given the same guard
When a `d1_databases` block is added at the top level and not under `[env.local]`
Then `pnpm test` **fails**

> Both directions. A one-directional check passes when the local block is a strict subset, which is
> exactly the shape the wrangler warning describes.

## Scenario 4: `run_worker_first` cannot be weakened to the array form

Given the guard test
When `run_worker_first` is changed from `true` to `["/api/*", "/healthz"]`
Then `pnpm test` **fails**, and the failure message states that the array form causes paths outside
the list to bypass the Worker entirely

Given the guard test
When the `run_worker_first` key is deleted
Then `pnpm test` **fails**

## Scenario 5: a deep link serves the SPA shell rather than a 404

Given `pnpm --filter api exec wrangler dev --local --env local` is running
When `GET /plan/2026-08-03` is requested
Then the response status is **200**
And the body is the built `index.html`

Given the same server
When `GET /` is requested
Then the response status is **200** and the body is the built `index.html`

Given the same server
When a file that exists in `dist` is requested — a hashed JS or CSS bundle
Then the response status is **200** and its `content-type` is that file's own, not `text/html`

## Scenario 6: the dry run fails loudly when the SPA has not been built

Given `apps/web/dist` does not exist
When `pnpm --filter api exec wrangler deploy --dry-run --env=""` is run
Then the command exits **non-zero**
And the error names `assets.directory`

> Recorded as a criterion rather than a footnote because it fixes the ordering T10's CI must use:
> `pnpm build` **then** the dry run. The failure is loud, which is the good case — an assets
> directory that resolved to somewhere empty would deploy clean and serve nothing.

## Scenario 7: the schema-level guards fail when the config is wrong

Given the guard test
When `new_sqlite_classes` is changed to `new_classes`
Then `pnpm test` **fails**

Given the guard test
When `workers_dev` is changed to `true`, or the key is removed
Then `pnpm test` **fails**

Given the guard test
When a `[limits]` block with `cpu_ms` is added
Then `pnpm test` **fails**, naming §2 and the Free plan

Given the guard test
When any one of the three cron expressions is altered, reordered or removed
Then `pnpm test` **fails**

## Scenario 8: a secret cannot be committed into the config

Given the guard test
When any of the eight §10.3 secret names is added to `wrangler.toml` — as a key or as a value
Then `pnpm test` **fails**, naming the secret

Given the guard test *(amended — see Amendment 1)*
When a second environment in `wrangler.toml` sets `vars.ENVIRONMENT`, to `"local"` or to any other
value
Then `pnpm test` **fails**, naming that environment

Given the guard test
When a second wrangler configuration file elsewhere in the repository sets `vars.ENVIRONMENT`
Then `pnpm test` **fails**, naming that file

---

## Evidence

| # | Criterion | Method | Where |
|---|---|---|---|
| 1 | R1 name / main / compatibility_date | `unit` | `tools/guards/wrangler-config.test.ts` |
| 2 | R2 `workers_dev === false` | `unit` | same, strict equality |
| 3 | R3 no `[limits]` anywhere | `unit` | same |
| 4 | R4 D1 binding + T03 `database_id` | `unit` | same, exact strings |
| 5 | R5 `new_sqlite_classes`, no `new_classes` | `unit` | same |
| 6 | R6 three crons + their comments | `unit` | same — parsed array for the values, raw text for the comments |
| 7 | R7 `[assets]` fields | `unit` | same |
| 8 | R8 `run_worker_first === true`, not an array | `unit` | same |
| 9 | R9 `[env.local]` deep-equal both directions | `unit` | same |
| 10 | R10 no §10.3 secret name | `unit` | same, eight names hardcoded |
| 11 | R11 no other environment sets `ENVIRONMENT` | `unit` | same — **amended**: parses every wrangler config in the tree and reads `vars` off the parse tree |
| 12 | R12 toolchain declared | `unit` | same — reads the three manifests |
| 13 | R13 `PlanCoordinator` exported, assets fall-through | `unit` | **amended**: `apps/api/src/index.test.ts` — imports the module, asserts the stub's 501, that the handler delegates to a `vi.fn()` ASSETS binding and returns what it returned, and that the source names Phase 3 as the stub's owner. Plus Scenario 1, which errors if the export is missing |
| 14 | Scenario 1 — clean dry run, no credentials | `e2e` | `/validate-task` runs the command; asserts exit 0, **empty stderr**, non-zero asset count |
| 15 | Scenario 2 — `--env=local` has four bindings | `e2e` | `/validate-task`; asserts empty stderr and all four rows |
| 16 | Scenarios 3, 4, 7, 8 — every guard mutation | `unit` | mutation testing: apply each mutation to a **copy**, confirm red, restore, confirm green |
| 17 | Scenario 5 — deep link, root, real asset | `integration` | `wrangler dev --local --env local` (Miniflare), three requests |
| 18 | Scenario 6 — dry run without `dist` | `e2e` | `/validate-task` moves `dist` aside, runs, restores |

No `manual`. No `inspection`. **No mock** — nothing in this task reaches a network, and the dry run
needs no Cloudflare credentials.

**Mutations are applied to a copy, never in place.** `apps/api/wrangler.toml` and
`apps/api/src/index.ts` must be byte-identical before and after validation, verified by checksum.

## Explicitly not required

- **An unauthenticated request returning 403.** §9(d)'s behaviour belongs to **T08**, which builds
  the default-deny middleware. It cannot be proven here: the stub Worker forwards every path to
  `env.ASSETS.fetch()`, so worker-first and assets-first produce byte-identical responses on every
  path — measured side by side, not assumed. `run_worker_first = true` is a static assertion in this
  task and a behavioural one in T08.
- **A real `PlanCoordinator`.** The stub returns 501 and holds no state. Phase 3.
- **`/healthz`, Hono, or any route.** T07 replaces the fetch handler wholesale.
- **Applying migration 0001, or any D1 query.** T06.
- **Pushing or reading any secret.** T16 authors it; T20 runs it.
- **Any CI change.** T10 owns `ci.yml`; this task records the required command and its ordering as a
  hand-off and writes no workflow.
- **A real deploy, a Workers Route, or the custom domain.** T18 and T20.
- **Cron handlers firing.** wrangler warns that scheduled Workers are not triggered automatically in
  local development; declaring the triggers is the whole of this task.
- **Changing §11.2's bare `wrangler deploy`.** Its missing `--env=""` produces a warning at T16.
  Flagged in `plan.md`, not fixed — §11.2 is specification.

## Needs a mock

**None.** No third party is contacted. `wrangler deploy --dry-run` performs no API call and needs no
credentials — verified with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` unset.

## Manual checks

**None in this task.** One carried item, unchanged and not T04's to close: T03's D1 **name and APAC
region** were never read back. A wrong name fails at T06's first
`wrangler d1 migrations apply wherego`; the region is not surfaced by that command.
