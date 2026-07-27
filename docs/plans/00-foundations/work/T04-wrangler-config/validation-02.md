# Validation 02 — T04 `wrangler.toml`

**Verdict** BUGS FOUND · 0 HIGH, 3 MEDIUM, 2 LOW · **Date** 2026-07-26 · **Attempt** 2 · round trip 2 of 3
**Agents** 3, in parallel — regression, guard integrity, behaviour

## The fix holds, and the rejections hold

**All six bugs from `validation-01.md` are fixed**, reproduced independently by the regression lens
rather than taken from `fix-01.md`: both message clauses now print verbatim; loosening the rule
inside `findViolations` turns Scenario 4 red; neutering the roots parameter turns Scenario 8 red;
a `.sh` file turns R11 red; `[[kv_namespaces]]` turns the census red.

**All 28 mutations from round 1 still go red**, so the refactor from 45 to 58 tests dropped nothing.
That was the specific risk this round was dispatched to check.

**All three rejections were re-argued independently and upheld**, with better reasoning than the
original in one case: an empty-but-present `dist` is a **third state** that neither Scenario 1's
`Given` (*"has been produced by `pnpm build`"*) nor Scenario 6's (*"does not exist"*) covers, so no
criterion is violated. `[env.production]` was proven inert by diffing the dry-run output with and
without it. The cron 500 was reproduced against a live server.

The behaviour lens found **no bugs** and proved two things nobody had:

- **The Durable Object's SQLite storage is genuinely disk-backed.** It wrote two keys, killed the
  process tree, restarted from the same `--persist-to`, and read both back — with a changed
  in-process instance id, so this is real persistence and not an in-memory stub. A per-DO `.sqlite`
  file exists on disk. `new_sqlite_classes` does what §2 says it does, established now rather than
  in Phase 3.
- **A bare `wrangler deploy --dry-run` selects the production config.** The warning §11.2 will emit
  is a WARNING at exit 0, and the binding table it prints has **no `ENVIRONMENT` row** — which is the
  direct evidence for `plan.md`'s "top level is production, a missing `--env` must never fall back to
  local" decision.

## Bugs

Every one is in the guard. **The config has now survived two full rounds without a defect.**

### B7 · MEDIUM · A second environment in `wrangler.toml` can set `ENVIRONMENT = "local"` unseen
`tools/guards/wrangler-config.test.ts:222-250` (R9) and `:755-787` (the scan)

Appending this leaves all 58 tests green — reproduced by the harness:

```toml
[env.staging.vars]
ENVIRONMENT = "local"
```

Two compounding causes. R9's deep-equal logic is hardcoded to `env.local` and never looks at any
other environment name. And the scan records **one match per file**, so a second illegitimate
occurrence inside a file that already legitimately matches adds nothing it can see.

**Why it matters.** §9 calls the local bypass *"a production landmine unless it is tested"*, and
T08's bypass is gated on the **value**, not on the environment's name. The realistic path is nobody
being malicious: someone adds `[env.staging]` for a preview deploy and copies the local vars block
as a starting point.

**Reported HIGH by the guard-integrity lens; downgraded here, and the reason matters.** R11 as a
statement about the repository is **true today** — the harness confirmed by grep that only
`wrangler.toml` assigns the value. What fails is the *evidence*, not the criterion. Per
`CONVENTIONS.md` that is MEDIUM — a missing test for a stated criterion — not HIGH, which is
reserved for a rule actually violated in the running system.

### B8 · MEDIUM · R11's pattern requires a quoted value
`tools/guards/wrangler-config.test.ts:757` — `/ENVIRONMENT\s*[:=]\s*["']local["']/`

`ENVIRONMENT=local` and `ENVIRONMENT: local` — the ordinary unquoted dotenv and YAML forms — are
invisible.

**Also reported HIGH, and also downgraded, on stronger grounds than B7.** The lens named two
vectors and **neither reaches production**: `.dev.vars` is in `.gitignore` and wrangler never
uploads it, so a value set there is local-only, which is exactly what §9 already permits and gates.
A GitHub Actions `env:` block does not reach the Worker either — runtime values arrive only through
`wrangler secret bulk` or `[vars]`. So this is a check narrower than its own wording, not a path to
a shipped bypass. Fixed because the gap is between R11's words and its implementation, and that gap
is what a later reader will trust.

### B9 · MEDIUM · R13's checks are unscoped substring matches
`tools/guards/wrangler-config.test.ts:491-506`

The three assertions are bare regexes over the whole file text. A `PlanCoordinator` whose `fetch`
returns 200, a default export returning 999, and `env.ASSETS.fetch(request)` present only inside an
`if (false)` branch **all pass**, provided the literal strings appear somewhere — a comment counts.

**Corroborated from a second angle by the regression lens**, which found
`/export\s+class\s+PlanCoordinator/` has no word boundary, so renaming the class to
`PlanCoordinatorX` also stays green. The harness reproduced both.

Two lenses independently hitting one construct is the signal worth acting on. Not HIGH because the
contract's own Evidence row 13 anticipates exactly this — *"plus Scenario 1, which errors if the
export is missing"* — and the real dry run **does** fail loudly on the rename, so nothing ships
broken. The defect is that the guard is inspection-strength while the Evidence table calls it
`unit`.

### B10 · LOW · `workers_dev` is not re-checked per environment
`[env.local.vars] workers_dev = true` with the top level unchanged stays green. R2's wording does
not say *"or in any environment"* the way R3's does, so this is not a contract violation — it is
fixed because it is the same one-line assertion family as B7 and because §9(b) makes `workers_dev`
load-bearing: a `workers_dev = true` under any environment reopens the `*.workers.dev` hostname that
no Access application can cover.

### B11 · LOW · Scenario 7's cron mutation hardcodes the file's comment text
Its `.replace()` silently no-ops if the comments are ever edited, and the test then fails with a
confusing `expected X not to be X` instead of exercising the mutation it names.

## Rejected, in writing

**R6's Asia/Taipei comment should be checked for correctness, not just presence** *(guard-integrity
lens, N2)*. Swapping the `08:00` and `07:00` comments between two otherwise-correct cron lines stays
green. Rejected. R6's wording is that each line *"carries its `Asia/Taipei` comment"*, and verifying
the stated clock time against the expression means reimplementing UTC→Taipei conversion inside a
test — **a second implementation of logic the repo has a standing rule against**, for a comment. The
gap between the contract's words and its evident intent is real and is recorded here rather than
closed.

**All three of `validation-01.md`'s rejections** stand, re-argued independently. Not revisited again.

## Hand-offs from the behaviour lens

**T10 — the asset count must be tested as `> 0`, never compared for equality.** Measured three
times with the cache cleared: 2 real files reported as **3**, 1 real file reported as **2**, 0
reported as **0**. A non-empty `dist` is over-reported by a small constant. Comparing the printed
number against `find dist -type f | wc -l` would fail a correct green build.

**T10 — and the `> 0` check does not catch every broken build.** A `dist` containing files but **no
root `index.html`** passes the dry run reporting "Read 2 files", then serves **404 on `/` and on
every unmatched path** under `wrangler dev`. The asset count catches *"nothing was built"*, not
*"built without an entry point"*.

**T07 — a Worker route permanently shadows an identically-named static file, silently.** With
`run_worker_first = true` the Worker always wins; the file is unreachable with no error and no
warning. That is the property §9(d) depends on, and it is also a trap for any future API path that
collides with a chunk or public-asset name.

**T08 — percent-encoded paths reach the middleware undecoded.** `/plan%2F2026-08-03` arrives raw and
the asset router issues a 307 to the decoded path *downstream* of the Worker. Default-deny must
therefore run against the raw path — it does, and there is no encoding bypass — but T08's tests
should expect the 307 rather than a bare 200/404.

**T16 — the exact warning text** a bare `wrangler deploy` prints is captured in this run's evidence.
WARNING, exit 0, production selected. Cosmetic CI noise, not a defect.

**T06 — a symlinked `dist` works with no special handling**, dry run and dev server alike.

## Coverage gaps

1. **`run_worker_first = true` still has no behavioural proof.** Unchanged and unclosable here;
   closes at T08.
2. **No real Cloudflare account was contacted.** First contact is T18.
3. **DO persistence was proven across a local process restart**, not across a real deployment's
   eviction and relocation semantics. That first happens at T18/T20.

## Hygiene

Three agents, three temp copies, three ports. The real tree is unchanged and the harness verified it
after all three reported rather than taking their word:

```
d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c  apps/api/wrangler.toml
1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e  apps/api/src/index.ts
9a2e42c2cb8bde271ecf481446bb09f734f24b6aaf88376ccd4f2248e73d0c0f  tools/guards/wrangler-config.test.ts
```

One agent disclosed a self-inflicted false positive rather than hiding it: its driver script
initially sat inside the repo copy and contained literal `ENVIRONMENT = "local"` in its own mutation
definitions, which R11 correctly flagged. Moving it out cleared the run — and incidentally
re-confirmed R11 works.
