# Implementation plan — T04 `wrangler.toml`

**Task** [`../../tasks/T04-wrangler-config.md`](../../tasks/T04-wrangler-config.md) · **Spec** §2, §5.3, §5.6, §7, §9, §10.3, §10.4, §11.2
**Written** 2026-07-26 · **Revision** 2 · previous [`plan-v1.md`](plan-v1.md)

## Revision 2 — what changed and why

**Nothing about the configuration changes.** `apps/api/wrangler.toml` and `apps/api/src/index.ts`
are correct, were built once in attempt 1, and have been byte-identical through three validation
rounds (`d8e8e3f4…`, `1660df21…`). Every one of R1–R13 and Scenario 1–8 has been independently
driven and met. **This revision does not touch either file.**

What changed is **how two criteria are proven.** Three validate↔fix round trips produced sixteen
bugs, all sixteen in `tools/guards/wrangler-config.test.ts`, all sixteen in one family: the guard
does static analysis of TypeScript and of arbitrary text files with regexes, and every round of
patching added parsing that the next round broke.

| Round | Newly found |
|---|---|
| 01 | tautological tests · a test that could not fail · extension allowlist · open binding set |
| 02 | scan blind to a second environment · quotes required · unscoped substring matches |
| 03 | `//` in a URL blanks the line after it · `/* */` stripped from `.sh` files · symlinks skipped · `501` matched inside `1501` · a return matched inside a string literal |

Round 3 also found something worse than any single bug: **reproducing B15 and B16 turned the suite
red for the wrong reason** — B11's `assertMutated` drift diagnostic fired, not R13. The red/green
signal on `src/index.ts` is currently dominated by *"did you edit the exact lines my fixtures
quote"*, and T07 edits that file for an unrelated reason.

**Decision (user, 2026-07-26): replace the text matching rather than patch it a fourth time.** Both
replacements are net deletions, and both are structural rather than textual:

| | Revision 1 | Revision 2 |
|---|---|---|
| **R13** | three regexes over `src/index.ts`, propped up by a comment stripper, a brace matcher and an `if (false)` heuristic | a behavioural unit test that **imports the module and runs it** |
| **R11** | walk every file in the repo, sniff UTF-8, strip three comment syntaxes, regex the text | **parse every wrangler config** and read `vars.ENVIRONMENT` off the parse tree |

Five helpers are deleted outright: `stripCodeComments`, `findExportedClassBody`,
`findDefaultExportFetchBody`, `stripDeadFalseBranches`, `stripScanComments` — together with
`walk()`, the UTF-8 sniff and `findEnvironmentLocalAssignments`. The guard gets **smaller** and
proves **more**.

Two contract amendments follow from this and were approved with the decision; both are recorded in
`progress.md` and applied to the frozen `acceptance.md`:

1. **R11 narrows** from *"nothing else in the repository"* to *"no other wrangler configuration"* —
   see [Narrowing R11 honestly](#narrowing-r11-honestly) for why that is not a weakening.
2. **Evidence row 13 moves** from `tools/guards/wrangler-config.test.ts` to
   `apps/api/src/index.test.ts`. The method stays `unit`; it becomes a real one.

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

### R13: a behavioural unit test, at `apps/api/src/index.test.ts` (revision 2)

R13 is a claim about **what the code does** — the class returns 501, the handler delegates to the
assets binding. Text matching cannot decide that, which is why three rounds of it produced three
rounds of near-misses. The replacement imports the module and runs it:

```ts
import { describe, expect, it, vi } from 'vitest';
import worker, { PlanCoordinator } from './index.ts';

it('the PlanCoordinator stub returns 501', () => {
  expect(new PlanCoordinator().fetch().status).toBe(501);
});

it('the default handler delegates every request to the ASSETS binding', async () => {
  const served = new Response('<html>shell</html>');
  const assets = { fetch: vi.fn(() => Promise.resolve(served)) };
  const request = new Request('https://wherego.storium.work/plan/2026-08-03');

  await expect(worker.fetch(request, { ASSETS: assets })).resolves.toBe(served);
  expect(assets.fetch).toHaveBeenCalledWith(request);
});
```

B15 (`501` matching inside `1501`), B16 (a return matched inside a string literal) and N1
(compliant code deleted by the dead-branch heuristic) are all impossible against this by
construction — there is no text to match. A handler that never calls `env.ASSETS.fetch()` fails on
`toHaveBeenCalledWith`; one that calls it but does not return the result fails on `resolves.toBe`;
a class returning 200 fails on `.status`. **The `if (false)` case that needed a brace matcher and a
heuristic in revision 1 needs nothing here** — dead code does not run.

**Why `apps/api/src/index.test.ts` and not `tools/guards/`.** `tools/tsconfig.json` sets
`types: ["node"]`; importing a module that references `Fetcher` from `@cloudflare/workers-types`
would not typecheck there, and adding workers types to `tools` would put Worker globals in scope for
five guards that have nothing to do with Workers. `apps/api/tsconfig.json` already has exactly the
right types, `rootDir: "src"` already includes the file, and `vitest.config.ts` already includes
`apps/api/src/**/*.test.ts` — a path **nothing has used yet**. This task sets that convention, which
is worth stating: colocated `*.test.ts` next to the source, guards in `tools/guards/` for repo-wide
invariants that span packages.

**Rejected: `@cloudflare/vitest-pool-workers`.** It is the "proper" way to run Worker code under
workerd in vitest, and it is a new dependency plus a vitest project split to prove eight lines of
stub behaviour. Node 24 has `Request` and `Response` globally, the stub touches nothing else, and
validation 02 already proved the real runtime behaviour under Miniflare — including that the DO's
SQLite storage survives a process restart. The dependency buys nothing here and would have to be
carried by every task after it.

**What still is not closed, and where it is covered.** Neither this test nor the guard proves that
the class name in `wrangler.toml` and the class exported by the module **agree** — each file
asserts its own side. `wrangler deploy --dry-run` closes it in both directions and does so loudly:
*"Your Worker depends on the following Durable Objects, which are not exported in your entrypoint
file: PlanCoordinator."* That is Scenario 1, it is `e2e` evidence, and it has passed every round.
This goes in the coverage-boundary comment rather than being papered over with a fourth regex.

### Narrowing R11 honestly

R11's current implementation walks every file in the repository and regexes the text. That is where
B5, B8, B12, B13 and B14 came from, and it is also why `docs/` had to be excluded (this repo carries
reasoning verbatim, so five documents quote the assignment as prose) and why `wrangler.toml`'s own
explanatory comment broke the check the moment counting moved from files to occurrences.

**The property that actually matters is narrower than the wording.** Validation 02 established by
measurement, not argument, that only two things can put a value on the deployed Worker:

- `[vars]` or `[env.<name>.vars]` in a wrangler configuration file;
- `wrangler secret bulk` / `secret put`, which T16 authors and T20 runs.

`.dev.vars` is in `.gitignore` and wrangler never uploads it. A GitHub Actions `env:` block does not
reach the Worker. A shell variable in a `.sh` file does not reach the Worker. So the old scan was
searching four file types that cannot carry the defect, using three comment syntaxes that do not
all apply, and missing the one that can.

The replacement finds every wrangler configuration in the repo — `wrangler.toml`, `wrangler.json`,
`wrangler.jsonc`, excluding `node_modules`, `.git`, `dist` and `.wrangler` — parses each, walks
top-level `vars` and every `env.<name>.vars`, and asserts **exactly one** of them sets
`ENVIRONMENT`, that it is `env.local`, and that its value is exactly `"local"`.

That is strictly stronger where it counts and strictly weaker where nothing counts:

| | Revision 1 | Revision 2 |
|---|---|---|
| `[env.staging.vars] ENVIRONMENT = "local"` | caught (after B7) | caught, structurally |
| `ENVIRONMENT = "staging"` in a second env | caught (after B7) | caught |
| unquoted / YAML-colon forms | caught (after B8) | **not applicable** — the parser returns a value |
| a comment quoting the assignment | needed a stripper; broke twice | **cannot match** — comments are not parse-tree nodes |
| `docs/` prose | needed an exclusion list | **cannot match** |
| a `.sh` file setting a shell variable | caught | **not caught, and cannot reach the Worker** |
| a symlink | missed (B14) | not walked at all |
| a second `wrangler.toml` anywhere in the repo | text-matched | **parsed** |
| `wrangler secret bulk` shipping `ENVIRONMENT` | not caught | not caught — **hand-off to T16**, below |

**The one thing genuinely given up is the `.sh` vector, and it was never a vector.** The secret-bulk
vector was not covered before and is not covered now; it belongs to the task that writes the payload,
and T16's task file now carries it as a criterion rather than being left to a scan that could not see
it anyway.

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

### Revision 2 — the only changes still outstanding

Changes 1–7 above are **done and must not be redone.** `wrangler.toml` and `src/index.ts` are
correct; touching either invalidates three rounds of validation for no gain.

| # | File | Change | Why |
|---|------|--------|-----|
| 8 | `apps/api/src/index.test.ts` | **new** — the behavioural R13 test above | R13 is a claim about behaviour; text matching cannot decide it |
| 9 | `tools/guards/wrangler-config.test.ts` | **delete** the three R13 text assertions and the `B9` describe block | replaced by change 8 |
| 10 | `tools/guards/wrangler-config.test.ts` | **delete** `stripCodeComments`, `findMatchingCloseBrace`, `extractBalancedBlock`, `findExportedClassBody`, `findDefaultExportFetchBody`, `stripDeadFalseBranches` | nothing calls them after change 9 |
| 11 | `tools/guards/wrangler-config.test.ts` | **delete** the two `src/index.ts` mutation fixtures and `indexText` / `indexChecksumBefore` | they hardcode literal lines from a file this guard no longer reads. This is the drift signal that fired instead of R13 |
| 12 | `tools/guards/wrangler-config.test.ts` | **replace** `findEnvironmentLocalAssignments`, `walk()`, the UTF-8 sniff and `stripScanComments` with a parse of every wrangler config | R11, structurally — see above |
| 13 | `tools/guards/wrangler-config.test.ts` | **rewrite** Scenario 8's second block and the `B8` describe block against the new R11 | B8's quoting cases stop existing; the fresh-root fixture becomes a second `wrangler.toml` |
| 14 | `tools/guards/wrangler-config.test.ts` | **update** the coverage-boundary comment | it currently documents holes that no longer exist and misses the two named above |
| 15 | `tools/guards/wrangler-config.test.ts` | **rewrite** the `B7` describe block against the new pure functions, fed an in-memory `Map` | **added at build — planning defect.** B7's tests ran through `findViolations`' cross-environment check, which change 12 moves out to R11. All three original scenarios preserved |
| 16 | `tools/guards/wrangler-config.test.ts` | **separate** R9 from R11: `findViolations` asserts only `env.local.vars.ENVIRONMENT === "local"` | **added at build — planning defect.** *"Does anything else set it"* becomes R11's alone. Without the split R9's test goes vacuous once the cross-check moves — the same fails-for-nothing shape as B4 |

Every other test in the guard stays exactly as it is. **The 34 mutations that go red today must
still go red**, minus the two that mutate `src/index.ts` — those move to change 8's file as ordinary
assertions, which is what they should always have been.

The mutation-hygiene test keeps its `wrangler.toml` checksum. It drops the `src/index.ts` one: after
change 11 this guard never reads that file, so a checksum of it is a claim about a file the test has
no relationship to.

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
| `[env.local]` sets `ENVIRONMENT`, nothing else does | **revision 2** — guard: parse every wrangler config in the repo; exactly one `vars` table anywhere sets `ENVIRONMENT`, it is `env.local`, and the value is `"local"` |
| **`[env.local]` bindings match top level** | guard: deep-equal both directions for `d1_databases` and `durable_objects.bindings` |
| no §10.3 secret appears | guard: the eight secret names from §10.3, hardcoded, absent from the raw file text |
| `[assets]` + SPA fallback | guard: `directory === '../web/dist'`, `binding === 'ASSETS'`, `not_found_handling === 'single-page-application'`; **behaviour** proven by `/validate-task` booting `wrangler dev --local` and asserting `/plan/2026-08-03` returns the shell |
| dry run lists the built assets | `/validate-task`: dry-run stdout names the assets directory |
| asset field names are the installed wrangler's | implied by a warning-free dry run — wrangler warns on unrecognized keys. Validation asserts stderr is empty rather than only checking the exit code |
| `run_worker_first = true` | guard: `=== true` **and** `!Array.isArray(...)`, with finding 3's table as the comment. This is the assertion most worth having |
| **R13 — the stub returns 501 and the handler delegates** | **revision 2** — `apps/api/src/index.test.ts` imports the module, instantiates the class, and calls the handler with a `vi.fn()` ASSETS binding. Plus Scenario 1, which errors if the export is missing |

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

- **2026-07-26 · Three round trips, sixteen bugs, every one in the guard — accept the limits or
  redesign?** **Redesign R13 and R11.** R13 becomes a behavioural unit test that imports the module;
  R11 becomes a parse of every wrangler config. Both are net deletions. The alternatives — accept
  and document the false negatives, or strip R13 back to Scenario 5's integration evidence — were
  offered and lost to the option that both simplifies the guard and widens what it proves. (user)

Decided rather than asked in revision 2, because the repo settles them: the behavioural test lives
at `apps/api/src/index.test.ts` rather than in `tools/guards/` (tsconfig `types`, and
`vitest.config.ts` already includes the path); no `@cloudflare/vitest-pool-workers`; the
TOML↔module name agreement stays with Scenario 1's dry run rather than getting a fourth
implementation. Each is argued above with its alternative.

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
- **T16 (revision 2)** — **the `wrangler secret bulk` payload must not contain `ENVIRONMENT`.**
  T04's R11 guards wrangler configuration; a secret named `ENVIRONMENT` would reach the deployed
  Worker by a route no config guard can see, and §9's bypass is gated on the value, not on where it
  came from. This was never covered by R11's old repo-wide scan either — it is being written down
  now rather than assumed.
- **T07 (revision 2)** — **`apps/api/src/index.test.ts` guards *the stub*, and T07 replaces the
  stub.** Rewrite it, do not delete it: the `PlanCoordinator` 501 assertion stays true through T07
  (the real DO is Phase 3), and the delegation assertion becomes "the Hono app's catch-all route
  hands unmatched paths to `env.ASSETS.fetch()`" — which is the same claim about the shape T07
  actually ships. The sign-off lens wrote a plausible T07 `index.ts` — Hono, `export default app`,
  `app.all('*', c => c.env.ASSETS.fetch(c.req.raw))` — and revision 1's guard went red on the export
  shape alone. Revision 2 does not: it calls `worker.fetch(...)`, and a Hono app is callable the
  same way. The boundary moves with the task that crosses it, exactly as T01's
  "`wrangler.toml` does not exist" assertion moved to T04.

## Out of scope

Hono, routes and `/healthz` (T07). Applying migrations and the local loop itself (T06). Any secret
(T16 pushes them at T20). The real `PlanCoordinator` (Phase 3). The SPA's actual UI (Phase 3). CI
wiring (T10). Binding the custom domain (T18).
