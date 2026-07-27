# Implementation plan — T04 `wrangler.toml`

**Task** [`../../tasks/T04-wrangler-config.md`](../../tasks/T04-wrangler-config.md) · **Spec** §2, §5.3, §5.6, §7, §9, §10.3, §10.4, §11.2
**Written** 2026-07-26 · **Revision** 1

## What exists now

| | |
|---|---|
| `apps/api/package.json` | `@wherego/api`. One script (`typecheck`), three workspace deps, `@cloudflare/workers-types`. **No `wrangler`** |
| `apps/api/src/index.ts` | 8-line placeholder: `export default { fetch() → 501 }`. No DO class, no `Env` type |
| `apps/api/tsconfig.json` | `rootDir: src`, `types: ["@cloudflare/workers-types"]` |
| `apps/web/vite.config.ts` | React plugin, default `outDir` → `apps/web/dist`. Root `pnpm build` = `pnpm --filter @wherego/web build` |
| `.gitignore` | ignores `dist`, `.wrangler`, `.dev.vars` |
| `pnpm-workspace.yaml` | `allowBuilds: { esbuild: true }` — pnpm 11's build-script gate, added by T01 |
| `vitest.config.ts` | includes `tools/guards/**/*.test.ts` — the only include outside a package `src/` |
| `tools/guards/` | 5 guard tests (T01 ×4, T05 ×1). `@wherego/tools`, `types: ["node"]` |
| `migrations/0001_initial_schema.sql` | T05. **Nothing applies it** — that is T06, which is blocked on this file |

**There is no `wrangler.toml` and no wrangler anywhere in the tree.** T01 deliberately stopped at
"builds and typechecks"; this task is the first thing that makes `apps/api` a Worker.

## Findings that changed the plan

**Everything below was run against `wrangler 4.114.0` in a scratchpad, not recalled.** Four of the
task file's assumptions are wrong, and each would have surfaced as a build-agent stop or — worse —
a config that deploys clean and serves nothing.

### 1. `[env.local]` inherits no bindings

`wrangler deploy --dry-run --env=local` on a config with top-level D1 and DO blocks:

```
- "durable_objects" exists at the top level, but not on "env.local".
  This is not what you probably want, since "durable_objects" is not inherited by environments.
- "d1_databases" exists at the top level, but not on "env.local".
```

`env.ENVIRONMENT ("local")` was the **only** binding the local environment had. **`[assets]` *is*
inherited** — verified by removing `[env.local.assets]` and confirming `env.ASSETS` still appears in
the `--env=local` binding table — so exactly two blocks get duplicated, and duplicating a third
would be a copy that can drift for no reason. §9 requires the
bypass to be gated on `[env.local]`, and T06 is *"`wrangler dev --local` with real D1"* — so as the
task was written, the one environment that can run locally is the one with no database.
**Answered below.**

### 2. `not_found_handling` does not give SPA fallback when a Worker is present

With `main` set and `not_found_handling = "single-page-application"`, `/plan/2026-08-03` reached the
**Worker**, not `index.html`. The asset router only applies `not_found_handling` to requests that
arrive through the `ASSETS` binding. So the task's *"must configure SPA fallback"* is not a config
line — it needs `binding = "ASSETS"` **and** Worker code that calls `env.ASSETS.fetch(request)`.
Verified: with the binding and a fall-through handler, `/plan/2026-08-03` and `/nope.js` both return
the shell.

### 3. `run_worker_first` as an array is a trap, and it is the form that looks safest

| Form | `/` | `/app.css` | `/healthz` | `/plan/2026-08-03` |
|---|---|---|---|---|
| omitted (default) | asset | asset | **Worker** | **Worker** |
| `true` | **Worker** | **Worker** | **Worker** | **Worker** |
| `["/", "/index.html"]` | **Worker** | asset | `index.html` ✗ | `index.html` ✗ |

Setting the array form **inverts the default for every path outside the list**: paths not named are
served assets-first *and* fall through to `not_found_handling`, so they never reach the Worker at
all. Under that config `/healthz` returned `<html>SPA SHELL</html>` with a 200. A new API route added
in Phase 3 and not added to the list would silently return the SPA shell — exactly the *"deploys
clean and serves nothing"* failure the task file warns about. **A comment in the file records this**,
because the array form is what someone reaches for when asked to make the Worker run first "only
where it matters".

### 4. `wrangler deploy --dry-run` hard-errors twice before it ever validates the config

```
✘ [ERROR] Your Worker depends on the following Durable Objects, which are not exported
  in your entrypoint file: PlanCoordinator.
✘ [ERROR] The directory specified by the "assets.directory" field ... does not exist
```

So the acceptance criterion *"wrangler parses the file without warnings"* is unreachable without
(a) an exported `PlanCoordinator` class and (b) `pnpm build` having run first. Both are now
explicit steps rather than assumptions.

Also: with any named environment defined, a bare `wrangler deploy --dry-run` emits a
`Multiple environments are defined … no target environment was specified` **warning**. The clean
invocation is `--env=""`. Credentials are not required — the dry run succeeds with
`CLOUDFLARE_API_TOKEN` unset.

## Approach

### The file

`apps/api/wrangler.toml`, TOML rather than the `wrangler.jsonc` wrangler now defaults to, because
§10.4, P0-03 and four task files all name `wrangler.toml`. Not worth a spec-wide rename to save a
guard test one dependency.

Top level is **production**. That direction is deliberate: a missing or misspelled environment name
falls back to a config that is correct for production, never to one that is correct for local. The
inverse layout — local at top level, `[env.production]` below — fails open.

### Routing: `run_worker_first = true` (user decision)

Every request invokes the Worker, including static assets. §9(d) — *"an unauthenticated request to
an app route returns 403 under the production config"* — is then literally true for every path, with
`/healthz` and the LINE webhook as the only two exceptions, and T08 and T20 inherit a sentence with
no caveat attached to it.

**The alternative, and why it lost.** Assets-first is wrangler's default and the cheaper option: the
SPA shell and its hashed bundles would be served by Cloudflare's edge without a Worker invocation,
which matters for a mobile surface opened in the field (§7). It was rejected because `GET /` would
then return 200 to an unauthenticated caller **forever**, so §9(d) would have to be reworded around
a concrete `/api/…` path and every future reader of the exit gate would have to be told why the
literal reading does not apply. The cost of the safe option is one Worker invocation per static
file, against Free's 100,000 requests/day for a clinic of a handful of users — roughly three orders
of magnitude of headroom.

**What T08 must know:** the Access middleware now sees asset requests. `/app.css` and every hashed
bundle must be *inside* default-deny, not allowlisted — a logged-in browser carries the Access
cookie, so they authorize normally. The allowlist stays at exactly two entries.

### `[env.local]`: duplicate the bindings, and guard the duplication (user decision)

`[env.local]` repeats `d1_databases` and `durable_objects` verbatim. §9's wording — the value is set
*"only in the `[env.local]` wrangler block"* — stays literally true, and T06 gets a local environment
that actually has a database.

Duplication is normally the thing this repo refuses (*no rule has a second implementation*), and the
rule is honoured the only way wrangler allows: `tools/guards/wrangler-config.test.ts` parses the file
and asserts the two blocks are **deep-equal in both directions**. A `database_id` changed in one
place and not the other fails the build rather than producing a local loop pointed at a database
that does not exist. The comment in the file says why the duplication is there, so it is not
"tidied" away.

**Rejected:** dropping the named environment and passing `--var ENVIRONMENT:local` on T06's command
line. Zero duplication, but it contradicts §9 and P0-03, and it makes T04's own criterion — *a grep
finds no other assignment of `ENVIRONMENT` to `"local"`* — vacuous, since there would then be no
assignment anywhere in committed config for the grep to be measured against.

### `apps/api/src/index.ts`: stub DO + assets fall-through (user decision)

Roughly eight lines:

- `export class PlanCoordinator` with a `fetch()` returning 501. Required by the dry run; the real
  DO is Phase 3. **Classic syntax, no `cloudflare:workers` import** — nothing here needs
  `DurableObject`'s base class, and `new_sqlite_classes` is a config-side declaration, not a code-side
  one.
- An `Env` interface with `ASSETS: Fetcher` (from `@cloudflare/workers-types`, already in the api
  tsconfig).
- The default `fetch` falls through to `env.ASSETS.fetch(request)` instead of returning a bare 501,
  which is what makes the SPA-fallback criterion provable in this task rather than deferred, and what
  gives T06 a local loop that serves something.

T07 replaces the fetch handler with the Hono skeleton and `/healthz`. That is a replacement, not an
extension, and the task file already says so.

### Tooling

| | |
|---|---|
| `wrangler` | `devDependencies` of **`@wherego/api`**, not the root. §11.2 runs `pnpm --filter api exec wrangler`, which resolves from that package |
| `workerd: true` | added to `allowBuilds` in `pnpm-workspace.yaml`. wrangler pulls `workerd` and its own `esbuild`, both with postinstall scripts; pnpm 11 gates them, and T10's CI criterion exists because of that gate. Verified: wrangler runs even with the builds ignored, so this is about keeping the install clean and CI quiet, not about function |
| `smol-toml` | `devDependencies` of **`@wherego/tools`**, for the guard test. Pure ESM, no postinstall. Node 24 has no TOML parser and wrangler's own `unstable_readConfig` is prefixed unstable for a reason |

### Where each criterion is proven

Criterion 1 (`wrangler deploy --dry-run`) is **not** put inside vitest. It needs `apps/web/dist` to
exist, so a fresh clone that has not run `pnpm build` would see `pnpm test` fail for a reason
unrelated to the code — the kind of failure that gets ignored within a fortnight. Instead:

- **`tools/guards/wrangler-config.test.ts`** asserts everything statically readable from the file.
- **`/validate-task`** runs `pnpm build && pnpm --filter api exec wrangler deploy --dry-run --env=""`.
- **T10 wires that same two-command sequence into `ci.yml`**, in that order. Recorded below as a
  hand-off, because a criterion proven once by a validation agent and never again is not a guard.

## Changes

| # | File | Change | Why |
|---|------|--------|-----|
| 1 | `apps/api/package.json` | add `wrangler` to `devDependencies` | §11.2's `pnpm --filter api exec wrangler` resolves from this package |
| 2 | `pnpm-workspace.yaml` | add `workerd: true` to `allowBuilds` | wrangler's postinstall gate; T10's CI criterion |
| 3 | `tools/package.json` | add `smol-toml` to `devDependencies` | the guard test needs a TOML parser |
| 4 | `apps/api/src/index.ts` | export `PlanCoordinator` stub; add `Env`; fall through to `env.ASSETS.fetch()` | dry run errors without the export; SPA fallback needs the binding call |
| 5 | `apps/api/wrangler.toml` | new — the whole file | the task |
| 6 | `tools/guards/wrangler-config.test.ts` | new | every criterion that is statically readable |
| 7 | `tools/guards/scaffold.test.ts` | drop the `apps/api/wrangler.toml` absence assertion | **added at build — planning defect.** T01's guard asserts the file does *not* exist, as a boundary check on T01's own out-of-scope list. T04 creates it, so the assertion fails for a reason that is not a T04 defect. The boundary moves to T04; the `.github` half stays, still correctly absent until T10 |

Order matters: 1–3 before 4–7, so the agent can run wrangler while iterating on the file.

**One more thing found at build, recorded because it will recur:** R10's ban is on literal strings,
and R5's is too — so a comment *explaining* that `new_classes` must not be used is itself a match.
The comment is worded around the substring rather than the check being special-cased, which is the
right way round: the same trap took an amendment to T05's frozen contract, and the lesson is that a
literal-substring ban has to be satisfied by the prose, never by an exception in the guard.

## Interfaces

### `apps/api/wrangler.toml`

Structure and every value that is fixed. Comments are part of the deliverable — each one records a
finding that would otherwise be "fixed" by the next reader.

```toml
name = "wherego"
main = "src/index.ts"
compatibility_date = "2026-07-26"
workers_dev = false          # §9(b) — *.workers.dev cannot be placed behind Access

# NO [limits] BLOCK. limits.cpu_ms is a Paid-only setting and the account is on
# Workers Free (T03, 2026-07-26), where the 10 ms ceiling cannot be raised. See §2.
# Phase 2 revisits this against a measurement, not a belief.

[[d1_databases]]
binding       = "DB"
database_name = "wherego"
database_id   = "f5adacb4-abce-41c9-aa82-86dc3b6f8334"   # not a secret — §10.4

[[durable_objects.bindings]]
name       = "PLAN_COORDINATOR"
class_name = "PlanCoordinator"

[[migrations]]
tag              = "v1"
new_sqlite_classes = ["PlanCoordinator"]   # NOT new_classes — §2, key-value DOs are Paid-only

[triggers]
crons = [
  "0 0 * * 1-5",    # Mon–Fri 08:00 Asia/Taipei — commit run
  "0 23 * * 0-4",   # Mon–Fri 07:00 Asia/Taipei — morning push
  "0 18 * * *",     # daily 02:00 Asia/Taipei — nightly maintenance
]
# Taipei is fixed UTC+8 with no DST. Do not "fix" these with offset arithmetic.
# The second reads 0-4 rather than 1-5 because 07:00 +08 is the previous UTC day.

[assets]
directory          = "../web/dist"
binding            = "ASSETS"
run_worker_first   = true
not_found_handling = "single-page-application"

[env.local.vars]
ENVIRONMENT = "local"
# [env.local] repeats the two blocks below because wrangler does not inherit
# d1_databases or durable_objects into a named environment. Guarded — see
# tools/guards/wrangler-config.test.ts.
[[env.local.d1_databases]]        # identical to the top-level block
[[env.local.durable_objects.bindings]]
```

Two points the agent must not get wrong:

- **`directory` is relative to the config file**, which lives in `apps/api/`, so the value is
  `"../web/dist"`. Verify by running the dry run and confirming it reports the assets it read.
- **`run_worker_first = true`, never an array.** Carry finding 3's table into the file as a comment.

### `apps/api/src/index.ts`

```ts
export class PlanCoordinator { fetch(): Response }   // 501 stub; real DO is Phase 3

interface Env { ASSETS: Fetcher }
export default { fetch(request: Request, env: Env): Promise<Response> }  // → env.ASSETS.fetch
```

### `tools/guards/wrangler-config.test.ts`

Parses `apps/api/wrangler.toml` with `smol-toml`. No network, no wrangler invocation, no build
required.

## Tests

| Criterion | Proven by |
|---|---|
| `wrangler` parses without warnings | `/validate-task`: `pnpm build && pnpm --filter api exec wrangler deploy --dry-run --env=""`, asserting exit 0 **and empty stderr** |
| `new_sqlite_classes`, not `new_classes` | guard: `migrations[0].new_sqlite_classes` contains `PlanCoordinator`, **and** no `new_classes` key exists anywhere |
| no `[limits]` on Free | guard: the parsed config has no `limits` key, top level or in any environment |
| three crons, byte-identical, each commented | guard: `triggers.crons` deep-equals the three strings in order; plus a raw-text assertion that each line carries its `Asia/Taipei` comment |
| D1 binding names `wherego` + T03's id | guard: exact string match on both |
| DO binding + migration entry | guard: binding name, class name, migration tag |
| `workers_dev = false` | guard: strict `=== false`, not falsy |
| `[env.local]` sets `ENVIRONMENT`, nothing else does | guard: `env.local.vars.ENVIRONMENT === 'local'`; plus a repo-wide scan for any other assignment of `ENVIRONMENT` to `"local"`, excluding this file and the guard itself |
| **`[env.local]` bindings match top level** | guard: deep-equal both directions for `d1_databases` and `durable_objects.bindings` |
| no §10.3 secret appears | guard: the eight secret names from §10.3, hardcoded, absent from the raw file text |
| `[assets]` + SPA fallback | guard: `directory === '../web/dist'`, `binding === 'ASSETS'`, `not_found_handling === 'single-page-application'`; **behaviour** proven by `/validate-task` booting `wrangler dev --local` and asserting `/plan/2026-08-03` returns the shell |
| dry run lists the built assets | `/validate-task`: dry-run stdout names the assets directory |
| asset field names are the installed wrangler's | implied by a warning-free dry run — wrangler warns on unrecognized keys. Validation asserts stderr is empty rather than only checking the exit code |
| `run_worker_first = true` | guard: `=== true` **and** `!Array.isArray(...)`, with finding 3's table as the comment. This is the assertion most worth having |

**`run_worker_first = true` cannot be proven behaviourally in this task, and the contract says so
rather than pretending.** The stub Worker forwards everything to `env.ASSETS.fetch()`, so worker-first
and assets-first produce byte-identical responses on every path — measured, both configurations
side by side. The difference only becomes observable once T08's middleware can 403. Here it is a
static assertion; **T08 owns the behavioural proof**, and its task file is updated to say so.

What `/validate-task` can prove, and must:

- `wrangler deploy --dry-run --env=local` exits 0 with **empty stderr** and its binding table lists
  all four of `env.DB`, `env.PLAN_COORDINATOR`, `env.ASSETS`, `env.ENVIRONMENT ("local")`. This is
  the check that catches finding 1 regressing — an un-duplicated block reappears as a wrangler
  warning on stderr and a missing row in that table.
- `wrangler dev --local --env local` boots, a deep link returns the shell, and a real asset returns
  its own content type.

## Risks

| | What would catch it |
|---|---|
| `directory` resolved from the wrong base → assets silently empty | dry run reports the file count; validation asserts it is non-zero |
| `run_worker_first` later "optimised" to an array | the guard's `!Array.isArray` assertion + the table comment |
| `[env.local]` duplication drifts | the deep-equal guard, both directions |
| The stub `PlanCoordinator` is treated as real and Phase 3 extends it | the class body is a single 501 and says so in a comment naming Phase 3 |
| `pnpm build` not run before the dry run in CI | recorded as a T10 hand-off; the dry run errors loudly rather than passing empty |
| T08 allowlists asset paths to "fix" 403s on CSS | stated in this plan and carried to T08 below; the allowlist criterion is already exactly two entries |

## Answered questions

- **2026-07-26 · Does the Worker run before static assets, or do assets win?** **Worker-first for
  everything — `run_worker_first = true`.** §9(d) then holds literally for every path, and T08 and
  T20 inherit no caveat. Assets-first was the cheaper option and lost because `GET /` returning 200
  unauthenticated would have needed explaining forever. (user)
- **2026-07-26 · `[env.local]` inherits no bindings — how?** **Duplicate `d1_databases` and
  `durable_objects` under `[env.local]`, and guard the duplication with a both-directions deep-equal
  test.** Keeps §9's wording literally true and gives T06 a working local loop. (user)
- **2026-07-26 · How far into `apps/api/src/index.ts`?** **Stub `PlanCoordinator` export *and* an
  `env.ASSETS.fetch()` fall-through.** The first is required for the dry run to pass at all; the
  second makes the SPA-fallback criterion provable here instead of deferring it to T07. (user)

Decided rather than asked, because the task or the spec settles them: worker name `wherego`
(T18 binds `wherego.storium.work`); `compatibility_date = "2026-07-26"` (verified warning-free
against the installed workerd); binding names `DB`, `PLAN_COORDINATOR`, `ASSETS`; TOML over JSONC;
`wrangler` on `@wherego/api` rather than the root; production at the top level rather than under
`[env.production]`.

## Hand-offs

- **T06** — the local loop is `wrangler dev --local --env local`. Without `--env local` the Worker
  has bindings but no `ENVIRONMENT`, so T08's bypass will not fire and every route 403s.
- **T08** — asset requests now reach the middleware. They must be default-denied, not allowlisted;
  the allowlist stays at exactly two entries. `/healthz` returning JSON under `run_worker_first = true`
  is verified.
- **T10** — CI must run `pnpm build` **before** `pnpm --filter api exec wrangler deploy --dry-run
  --env=""`. The dry run hard-errors if `apps/web/dist` is absent. No credentials needed.
- **T16** — §11.2's deploy step is a bare `wrangler deploy`. With `[env.local]` defined that emits a
  "no target environment was specified" warning. `--env=""` is the clean form. Flagged, not changed:
  §11.2 is specification and T16 copies it verbatim.
- **T20** — "an unauthenticated app route returns 403" may name any path other than `/healthz` and
  the LINE webhook, `/` included.

## Out of scope

Hono, routes and `/healthz` (T07). Applying migrations and the local loop itself (T06). Any secret
(T16 pushes them at T20). The real `PlanCoordinator` (Phase 3). The SPA's actual UI (Phase 3). CI
wiring (T10). Binding the custom domain (T18).
