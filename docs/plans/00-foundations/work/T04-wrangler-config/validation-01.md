# Validation 01 — T04 `wrangler.toml`

**Verdict** BUGS FOUND · 0 HIGH, 4 MEDIUM, 2 LOW · **Date** 2026-07-26 · **Attempt** 1
**Agents** 3, in parallel — acceptance, end to end, adversarial

## The config is not in question

Every one of R1–R13 and Scenarios 1–8 was established by running something. **All three lenses agree
the configuration itself is correct**, and two of them proved it against a live server rather than
against the file:

- Both dry runs exit 0 with **stderr measured at 0 bytes**, credentials unset. `--env=local` lists
  all four bindings including `ENVIRONMENT ("local")` and emits **no** non-inheritance warning,
  which is the direct evidence that the `[env.local]` duplication is right.
- `wrangler dev --local --env local`: `/` and `/plan/2026-08-03` both return 200 with bodies
  **sha256-identical** to the built `index.html`; `/assets/index-*.js` returns 200 with
  `content-type: text/javascript` and a body byte-identical to the built file.
- **The Durable Object actually instantiates.** A debug route on a scratch copy did
  `idFromName → get → fetch` against `PLAN_COORDINATOR` and got the 501 stub back. This is the
  specific failure `new_sqlite_classes` exists to avoid — a key-value-backed DO is Paid-only and
  fails at *first instantiation*, not at config time — and it is now disproved by execution rather
  than by reading the key.
- **D1 is a live database, not a name.** `SELECT 1` returned `{one:1}` through Miniflare;
  `sqlite_master` held only `_cf_METADATA`, confirming migration 0001 is correctly **not** applied
  (that is T06).
- **28 mutations** were applied to a full repo copy running the real `pnpm test`. **26 went red**,
  each named by the assertion that should have caught it — including all six `[assets]` field
  mutations, both directions of `[env.local]` drift, `workers_dev` as the *string* `"false"`, and
  removing or renaming the `PlanCoordinator` export.

**All four bugs are in the guard, not in the thing it guards.** That is the same shape T05's first
validation had.

## Bugs

### B1 · MEDIUM · Scenario 4's failure message does not explain itself
`tools/guards/wrangler-config.test.ts:216-221`

Mutating `run_worker_first = true` to `["/api/*", "/healthz"]` does turn the suite red, so the
scenario's primary clause holds. But the contract's second clause — *"the failure message states
that the array form causes paths outside the list to bypass the Worker entirely"* — is unmet. The
actual output is `AssertionError: expected [ '/api/*', '/healthz' ] to be true`.

**Why it matters.** That clause is not decoration. The array form *looks like* the narrower, safer
restriction — that is the entire reason it is dangerous, and the reason the file carries a measured
behaviour table about it. Someone who hits a bare equality diff has no signal steering them away
from trying a *different* array, which is the one repair that keeps the suite red and the Worker
unreachable.

### B2 · MEDIUM · Scenario 7's `[limits]` failure does not name §2 or the Free plan
`tools/guards/wrangler-config.test.ts:105-112`

Adding `[limits] cpu_ms = 50` goes red with `expected { cpu_ms: 50 } to be undefined`. The contract
requires it to fail *"naming §2 and the Free plan"*. The neighbouring test that does check for `§2`
and `T03` reads the **current, unmutated** comment text, so it is unaffected by this mutation and
does not compensate.

**Why it matters.** The person who adds `cpu_ms` back is doing it deliberately, most likely during a
future Paid migration, and the one thing they need told is that the plan is what decides it.

### B3 · MEDIUM · Six `Scenario N` tests are tautologies and can never fail
`tools/guards/wrangler-config.test.ts:96-101, 120-127, 157-164, 188-197, 229-241, 298-305`

Each constructs the mutated value **inside its own body** and asserts it differs from the expected
one — `{...config, workers_dev: true}` then `expect(...).not.toBe(false)`; hand-built cron arrays
compared to `CRONS` without ever touching `config`; `expect(mutated).toContain(secretName)` on a
string the same line just appended the secret to. None re-runs the guard against a mutated input.

**Found by three independent routes** — both the acceptance and adversarial lenses, and by the
harness before validation was dispatched.

**Current impact: none, and that was measured rather than assumed.** The adversarial lens mutated
real files and confirmed the *primary* assertions at lines 91, 107, 144, 148, 170, 203, 211, 219,
257, 263, 295 and 311 catch every mutation. The defect is that these six companions would stay green
if the primary assertion beside them were deleted or loosened — so the suite would keep reporting
that a mutation "would be caught" after it had stopped being caught. That is the precise anti-pattern
the frozen contract names in Evidence row 16.

### B4 · MEDIUM · R11's Scenario 8 test cannot fail
`tools/guards/wrangler-config.test.ts:314-319` — **found at triage, by the harness, not by an agent**

```ts
const matches = findEnvironmentLocalAssignments([secondFile]);
expect(matches.length).toBeGreaterThanOrEqual(1);
expect(matches.some((m) => m === secondFile || m.endsWith('wrangler.toml'))).toBe(true);
```

`findEnvironmentLocalAssignments` **always** returns `apps/api/wrangler.toml`, because that file
legitimately contains the assignment. So `matches.length >= 1` is unconditionally true, and the
`|| m.endsWith('wrangler.toml')` disjunct is unconditionally true. **The test passes even if
`extraFiles` is never scanned at all** — delete the entire `for (const extra of extraFiles)` loop
and it stays green.

This is worse than B3. The tautologies at least assert something true about a value; this one is
wired to pass regardless of the behaviour it names. It is the only test standing behind the claim
that a second `ENVIRONMENT = "local"` is *reported by name*, and §9 makes that a security property:
T08's production bypass is gated on exactly this value.

### B5 · LOW · R11's scan is narrower than R11's wording
`tools/guards/wrangler-config.test.ts:395`

The walk skips any file that is not `.toml|.ts|.tsx|.js|.mjs|.cjs|.json|.jsonc|.yaml|.yml`. The
criterion says *"nothing else **in the repository**"*. A shell script, a `Dockerfile`, a `.env`
sample or a markdown fence carrying `ENVIRONMENT = "local"` is invisible to it.

Not exploitable today — a Worker reads `env.ENVIRONMENT` only from `[vars]`, a pushed secret, or the
gitignored `.dev.vars`, none of which are shell or markdown. Fixed anyway because the gap is between
the criterion's words and its implementation, and that gap is what a later reader will trust.

### B6 · LOW · The binding set is open
`tools/guards/wrangler-config.test.ts` — whole file

Adding a `[[kv_namespaces]]` block leaves the suite green. §2 states as architecture:
*"No R2, no KV, no Queues, no Workflows. The CSV is parsed in memory and discarded… The Durable
Object is the one exception, and it is bought for correctness rather than throughput."*

**No criterion in the frozen contract requires closing the binding set**, so this is not a contract
violation, and it is promoted to a fix rather than deferred for one reason: this guard is the only
artifact that will ever read this file, so a deferral has no destination. Two of the twenty-eight
mutations stayed green and this was one of them.

## Rejected, in writing

**An `[env.production]` block can be added with no guard** *(adversarial lens, F3)*. Not a bug. The
top level **is** production, by a decision recorded in `plan.md` — a missing or misspelled `--env`
must fall back to the production config, never to the local one. An unused `[env.production]` block
is inert: wrangler only reads a named environment when `--env` selects it, and nothing in the repo
selects that name. A guard forbidding it would be forbidding a shape the spec never rules out.

**A present-but-empty `apps/web/dist` passes the dry run** *(end-to-end lens)*. Real, and already
named in the frozen contract's own commentary on Scenario 6 — *"an assets directory that resolved to
somewhere empty would deploy clean and serve nothing."* It is wrangler's behaviour, not this task's
defect, and no criterion requires detecting it. At runtime every path returned 404 rather than
crashing, which is the sane failure. **Carried to T10** as a hand-off below rather than left here.

**The hand-triggered cron returns an opaque 500** *(end-to-end lens)*. `curl
/cdn-cgi/handler/scheduled` gives HTTP 500 with the body `exception`; the real reason —
`Handler does not export a scheduled() function` — appears only in the wrangler log. Correct and
expected: *Cron handlers firing* is in the contract's *Explicitly not required*, and no `scheduled()`
export exists anywhere until Phase 3. T06's task file already tells its reader to watch the log.

## Coverage gaps

1. **`run_worker_first = true` still has no behavioural proof, and could not have one here.** The
   end-to-end lens confirmed by measurement what `plan.md` predicted: with the stub Worker
   forwarding everything to `env.ASSETS.fetch()`, worker-first and assets-first are byte-identical on
   every path. **Closes at T08**, whose task file already carries the criterion that an
   unauthenticated `GET /` returns 403.
2. **Nothing here touched a real Cloudflare account.** Every dry run was credential-free by design.
   The first contact with the real control plane is T18.
3. **Migration 0001 is not applied**, so the D1 binding was proven live but empty. T06.

## Hand-off added by this run

**T10** — the CI dry-run step should assert the reported asset count is **greater than zero**, not
merely that the command exits 0. A present-but-empty `dist` passes cleanly and would deploy a Worker
that serves nothing; the asset count is the only signal that distinguishes it, and CI is the only
place that will ever look.

## Hygiene

All three agents worked on copies. The real tree is unchanged: `git status --porcelain` matches its
pre-validation state, and `apps/api/wrangler.toml` is still
`d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c`,
`apps/api/src/index.ts` still `1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e` —
verified by the harness after all three reported, not taken from them. Four stray capture files
briefly appeared at the repo root and have been removed.
