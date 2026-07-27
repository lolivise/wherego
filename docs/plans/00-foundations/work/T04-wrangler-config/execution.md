# Execution — T04 `wrangler.toml`

## Attempt 1 — 2026-07-26

**Agent** sonnet · **Outcome** complete

### Changed

| File | Change |
|------|--------|
| `apps/api/wrangler.toml` | new — the whole config. 106 lines, of which the majority are comments carrying the measured findings |
| `apps/api/src/index.ts` | `PlanCoordinator` 501 stub exported; `Env { ASSETS: Fetcher }`; default `fetch` returns `env.ASSETS.fetch(request)` |
| `apps/api/package.json` | `wrangler` devDependency |
| `tools/package.json` | `smol-toml` devDependency |
| `pnpm-workspace.yaml` | `workerd: true` added to `allowBuilds` |
| `pnpm-lock.yaml` | the two installs |
| `tools/guards/wrangler-config.test.ts` | new — 425 lines, 39 tests, R1–R13 |
| `tools/guards/scaffold.test.ts` | T01's `apps/api/wrangler.toml` absence assertion dropped — see *Decided beyond the plan* |

### Checks

Every one re-run by the harness, not taken from the agent's report.

| Command | Result |
|---------|--------|
| `pnpm typecheck` | 6 workspaces, Done |
| `pnpm lint` | No issues found |
| `pnpm test` | 6 files, **155 tests**, all passed (110 → 155) |
| `pnpm build` | `apps/web/dist`, 3 files |
| `wrangler deploy --dry-run --env=""`, credentials unset | exit 0, **stderr 0 bytes**, read 3 assets, bindings `DB` / `PLAN_COORDINATOR` / `ASSETS` |
| `wrangler deploy --dry-run --env=local`, credentials unset | exit 0, **stderr 0 bytes**, all **four** bindings incl. `ENVIRONMENT ("local")` |

The `--env=local` run is the one that matters most: an empty stderr there is the direct evidence
that the `[env.local]` duplication is correct, because an un-duplicated block reappears as a
wrangler warning naming the missing key.

`pnpm --filter api exec wrangler` resolves, which incidentally confirms §11.2's filter spelling
works against the scoped package name `@wherego/api`.

### Decided beyond the plan

Each of these is a planning defect.

1. **`tools/guards/scaffold.test.ts` asserted `apps/api/wrangler.toml` does not exist.** T01 wrote it
   as a boundary check on its own *Explicitly not required* list. T04 creates the file, so the
   assertion failed for a reason that is not a T04 defect. The agent dropped that one expectation,
   kept the `.github` half — still correctly absent until T10 — and left a comment saying the
   boundary moved rather than disappeared. Correct call, and **not** a weakened test: the thing it
   protected has happened, on schedule, in the same phase. **Folded back into `plan.md` as change 7.**
2. **R5's ban is on the literal string `new_classes`, so a comment explaining "not `new_classes`" is
   itself a match.** The agent reworded the prose rather than special-casing the check. That is the
   right way round, and it is the second time this repo has hit it — T05's frozen contract needed an
   amendment for the same reason. **Folded back into `plan.md`.**
3. **Versions were resolved by running the plan's own `pnpm add` commands** rather than hand-writing
   a range. Lockfile records wrangler 4.114.0, matching the version every measurement in `plan.md`
   was taken against.

### Observed by the harness, not reported by the agent

**Several of the guard's `Scenario N: … would be caught` tests are tautologies.** They construct the
mutated value in the test body and then assert that it differs from the expected one — for example
R8's array-form case builds `['/api/*', '/healthz']` and asserts it is an array and is not `true`.
That is true by construction. It exercises nothing, and it would stay green if the real assertion
above it were deleted.

Three of them are better — R3's, R5's and R9's re-parse genuinely mutated TOML text — but even those
assert on the parsed value rather than re-running the guard against it.

**Deliberately not fixed here.** `/build-task` does not fix, and validation is the right place for
this to be found on its own merits: Agent C is specifically briefed to check whether the tests would
fail if the code were wrong. Recorded now so that if validation misses it, it goes into triage as a
harness finding with this reproduction rather than being quietly forgotten.

### Not done

Nothing in scope was left undone. Everything listed in the contract's *Explicitly not required*
stayed unwritten: no Hono, no `/healthz`, no route, no real Durable Object, no CI change, no secret,
no deploy.

## Attempt 2 — 2026-07-26 (fix)

**Agent** sonnet · **Outcome** complete · **Report** [`fix-01.md`](fix-01.md)

All six bugs closed in `tools/guards/wrangler-config.test.ts`; `wrangler.toml` and `src/index.ts`
untouched, sha256 unchanged. Tests 155 → 168.

B1–B4 shared one root cause — inline assertions against a single module-level parse, which left
mutation tests nothing to exercise — closed by extracting `findViolations()`.

**The first pass reported B1 and B2 fixed and they were not.** The logic was right; the output was
`expected [ Array(1) ] to deeply equal []`, because vitest collapses a nested array and the
violation text never reached the terminal. For a bug whose subject *is* the failure message, that is
not a fix. Caught by the harness re-running the reproduction instead of believing the report, and
closed by passing the joined violations as vitest's message argument.

## Attempt 3 — 2026-07-26 (fix 2)

**Agent** sonnet · **Outcome** complete · **Report** [`fix-02.md`](fix-02.md)

B7–B11 closed in the guard; both config files untouched, sha256 unchanged. Tests 168 → 181
(58 → 71 in this file). Six defect conditions reproduced red by the harness, including the
`if (false)` dead branch.

The required coverage-boundary comment is now at the top of the guard — measured across three
rounds, naming what the file does not catch and where each gap is covered instead.

One defect the fix created and closed itself: counting occurrences rather than files broke R11
against the correct file, because `wrangler.toml`'s own comment quotes the assignment as prose.
Third time a literal-string rule has met a self-documenting file in this task.

## Attempt 4 — 2026-07-26 (revision 2 — the redesign, not a fix)

**Agent** sonnet · **Outcome** complete · **Plan** [`plan.md`](plan.md) revision 2

This is not a fourth fix. Validation 03 escalated at the three-round-trip limit, the user chose to
**redesign R13 and R11 rather than patch the text matching a fourth time**, and this attempt
implements that design.

### Changed

| File | Change |
|------|--------|
| `apps/api/src/index.test.ts` | **new** — 2 behavioural tests. Imports the module, asserts `new PlanCoordinator().fetch()` is a 501, and calls the handler with a `vi.fn()` ASSETS binding asserting **both** that it was invoked with the request **and** that its response is what came back |
| `tools/guards/wrangler-config.test.ts` | R13's three text assertions, the `B9` block and the `B8` block deleted; six helpers deleted; R11 reimplemented against the parse tree; `B7` and Scenario 8's second block rewritten; coverage boundary rewritten |
| `apps/api/wrangler.toml` | **untouched** — `d8e8e3f4…`, verified before and after every probe |
| `apps/api/src/index.ts` | **untouched** — `1660df21…`, same |

Seven helpers and two mutation fixtures are gone: `stripCodeComments`, `findMatchingCloseBrace`,
`extractBalancedBlock`, `findExportedClassBody`, `findDefaultExportFetchBody`,
`stripDeadFalseBranches`, `stripScanComments`, `walk()`'s UTF-8 sniff, and the two fixtures quoting
literal lines of `src/index.ts` — **the drift diagnostic that fired instead of R13 in round 3.**

### Checks

Every one re-run by the harness.

| Command | Result |
|---------|--------|
| `pnpm typecheck` | 6 workspaces, Done |
| `pnpm lint` | No issues found |
| `pnpm test` | 7 files, **174 tests**, all passed |

**The count fell, 181 → 174, and that is the point.** Eleven tests deleted (R13's 3 → 2, B9's 3,
B8's 5), four added (2 behavioural, 1 `wrangler.jsonc` round trip, 1 exact-identity check). The
deleted eleven tested a text-matching implementation that no longer exists; B8's five tested quoting
forms that cannot occur once a parser returns the value. Every other describe block — R1–R8, R10,
R12, Scenarios 3/4/7, B6, B10, mutation hygiene — is unchanged.

### Fail-then-pass, run by the harness

Eight mutations, all red, all restored, both checksums re-verified afterwards. **Three of these the
agent did not run** — they are the harness's own, chosen to attack the new code rather than confirm
the agent's homework.

| Mutation | Result |
|---|---|
| `PlanCoordinator.fetch()` returns 200 | red — `expected 200 to be 501` |
| handler returns `new Response('x')`, never calling ASSETS | red — `expected "spy" to be called with arguments` |
| **the `if (false)` dead branch that needed a brace matcher and a heuristic in revision 1** | red, on the same assertion, **with no special handling at all** — dead code does not run |
| `[env.staging.vars] ENVIRONMENT = "local"` | red — `found 1 illegitimate setter(s): env.staging="local" in …/apps/api/wrangler.toml` |
| `[env.staging.vars] ENVIRONMENT = "prod"` | red — same message, `env.staging="prod"` |
| **a real `wrangler.jsonc` planted at `apps/probe/`** *(harness)* | red — `top-level="local" in …/apps/probe/wrangler.jsonc`. Proves the extension set works end to end, not only against the synthetic fixture |
| **top-level `[vars] ENVIRONMENT = "local"`** *(harness)* | red — `top-level="local"`. The top level is production; this is the shape that would ship the bypass |
| **`env.local`'s assignment deleted entirely** *(harness)* | red — `found 0: (none)`. The `legitimate.length !== 1` branch, which nothing else exercised |

**Every failure names the offending environment and the file.** That was B1/B2's defect and it has
not recurred.

**More important than any individual result: each mutation failed on the assertion that owns it.**
Round 3's worst finding was that reproducing a bug turned the suite red *for the wrong reason* — a
drift diagnostic fired while the R13 assertions stayed green. That cannot happen now on
`src/index.ts`: the guard no longer reads that file, and the behavioural test has nothing to drift
from.

### Decided beyond the plan

Each is a planning defect. All four are accepted; the first two are folded into `plan.md`.

1. **`B7`'s describe block had to be rewritten, and the plan did not list it.** Its tests ran through
   `findViolations`' cross-environment check, which change 12 moved out to R11. Rewritten against the
   new pure functions, fed an in-memory `Map`, all three original scenarios preserved.
2. **R9 and R11 had to be separated.** `findViolations` now asserts only
   `env.local.vars.ENVIRONMENT === "local"`; *"does anything else set it"* is R11's alone. Without
   the split R9's test would have gone vacuous once the cross-check moved — the same
   fails-for-nothing shape as B4.
3. **`import … from './index'`, not `'./index.ts'`.** The plan's sketch used the extension, which
   `tsc` rejects (TS5097) without `allowImportingTsExtensions`. Dropped the extension rather than
   touch a tsconfig. Correct call.
4. **`Fetcher` is an ambient global, not a named export.** `@cloudflare/workers-types` declares
   globals only, so the mock is `as unknown as Fetcher` against the ambient type — the same way
   `index.ts` itself references it.

### Observed by the harness, not reported by the agent

**`B7`'s three tests fail with an opaque TOML parse error, not their own assertion, when the real
`wrangler.toml` already contains an `[env.staging]` block.** They append `[env.staging.vars]` to
`rawToml`, so a real file that already has one produces
`Invalid TOML document: trying to redefine an already defined table or value`. That is why the
`[env.staging]` mutations above show 5 red tests and the top-level one shows 2.

Recorded rather than fixed, with the severity argued rather than assumed: **LOW.** It is the same
*family* as round 3's worst finding but not the same *defect* — there, a wrong-reason failure
**masked** a check that had silently stayed green; here R11's own test fires correctly, with the
right message, on the identical mutation, so the collateral is noise on top of a correct signal
rather than a substitute for a missing one. And the fragile state is unreachable in a green tree:
any config that would trigger it is one R11 already rejects.

**A hand-written JSONC comment stripper was introduced** (`stripJsoncComments`) — narrow, and
argued for at its definition, but it is the same *technique* three rounds were spent removing. No
`wrangler.jsonc` exists in this repo, so it is dead against the real tree and exercised only by one
synthetic fixture and the harness's planted file. Its realistic failure mode is a **loud**
`JSON.parse` error rather than a silent false negative — a `//` or `/*` inside a string value
corrupts the document rather than quietly blanking a line, which is the opposite of B12/B13's
behaviour. Left for validation to judge on its own merits, with this reproduction attached.

### Not done

Nothing in scope was left undone. No new dependency was added — in particular not
`@cloudflare/vitest-pool-workers`, which `plan.md` rejects with reasons. No config file, no
`docs/plans/**` file and no `acceptance.md` criterion was touched by the agent.

## Attempt 5 — 2026-07-26 (fix 3)

**Agent** sonnet · **Outcome** complete · **Report** [`fix-03.md`](fix-03.md)

B17–B21 closed across the guard and `index.test.ts`; both config files untouched, sha256 unchanged.
Tests 174 → 184.

`stripJsoncComments` was **deleted rather than improved** — the last regex in R11 is gone, and an
unparseable config is now a named violation instead of a silent pass or an uncaught throw. Seven
probes re-run by the harness against the real repo-wide scan, all correct, including two nested
self-referential directory symlinks completing in 1 second.

One false alarm of the harness's own: the first B18 probe reported pass because the mutation never
applied — `is` and `Phase 3.` are split across a line break. Caught by verifying the mutation had
landed before believing its result, which is the same lesson B11's `assertMutated` encodes.

## Attempt 6 — 2026-07-26 (fix 4)

**Agent** sonnet · **Outcome** complete · **Report** [`fix-04.md`](fix-04.md)

B22, B23 and B24 closed; both config files untouched, sha256 unchanged. Tests 184 → 195.

**Scope exceeded the authorisation.** The user chose B22 only; the agent had written all three
before the run was interrupted, and the work was kept rather than reverted. Recorded in `fix-04.md`
as a decision, not presented as the plan.

Six probes re-run by the harness against the real tree, including the distinguishing one: an
unreadable directory produces a named violation **and** a real violation in a sibling directory is
still reported, so the walk continues rather than aborting.

**No fresh-agent validation ran against this fix** — the instruction was to fix and close. Stated in
`fix-04.md` rather than glossed.
