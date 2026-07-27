# Validation 04 — T04 `wrangler.toml`

**Verdict** BUGS FOUND · 0 HIGH, 2 MEDIUM, 3 LOW · **Date** 2026-07-26 · **Attempt** 4
**Round trip 1 of 3** — the counter reset when the escalation went back to `/design-task` and the
contract was amended. This is a new cycle, not a fourth patch of the old one.
**Agents** 3, in parallel — acceptance, end-to-end behaviour, adversarial

## The redesign worked, and it is worth being precise about what that means

**Every recurring failure mode from rounds 1–3 is closed by construction rather than by patching.**
The adversarial lens re-checked all sixteen prior bugs and N1 independently:

| | |
|---|---|
| **B9, B15, B16, N1** — the R13 text-matching family | **moot, code deleted.** A decoy `1501`, a decoy string literal, and a genuine `if (false)` dead branch were all re-attacked. Each failed red, **each on the assertion that owns it**, with no special handling |
| **B8** — quoted-value-only regex | **moot, cannot recur.** "Quoting" is not a concept when reading a typed value off a parse tree |
| **B13** — comment syntax guessed across file types | **moot.** `.sh`, `.env` and prose are never opened now |
| **B5** — extension allowlist narrower than the wording | **moot by amendment**, not by code: Amendment 1 narrowed R11 deliberately, and the reasoning is in the coverage boundary |
| **B1–B4, B6, B7, B10, B11** | **fixed, unchanged**, each re-reproduced rather than taken from the previous report |

Two independent confirmations that the round-3 diagnosis was right: `assertMutated`'s masking
failure — where reproducing a bug turned the suite red for the *wrong* reason while R13 stayed
green — is now **structurally impossible**, because no fixture in the guard quotes `src/index.ts`
any more. And the `docs/` exclusion that round 2 needed is gone and **did not need replacing**: the
new design only opens files literally named `wrangler.toml`/`.json`/`.jsonc`, and there are none
under `docs/`. The narrower design closed a fragility instead of reopening one.

The behaviour lens found **no bugs** and proved two things nobody had:

- **The Durable Object returns 501 through a real Miniflare DO namespace.** It transpiled the real
  `index.ts`, loaded it as an actual worker script with a genuine SQLite-backed `PLAN_COORDINATOR`
  binding, and went namespace → stub → `fetch()`. That closes the gap between the unit test's bare
  `new PlanCoordinator()` and what the runtime produces — the specific question the redesign
  raised.
- **The coverage boundary's central claim is measured, not aspirational.** Both the behaviour and
  adversarial lenses removed the `export` keyword and confirmed the dry run fails with *"Your Worker
  depends on the following Durable Objects, which are not exported in your entrypoint file."* That
  is the check standing in for the TOML↔module cross-check I deliberately refused to give a fourth
  implementation, so it needed to be true rather than assumed.

Scenario 5 was verified by **sha256** against the built files, not by eye: `/`,
`/plan/2026-08-03` and a hashed bundle all byte-identical, the bundle served as `text/javascript`.
Both dry runs exit 0 at **0 bytes of stderr** with credentials unset; `--env=local` shows all four
bindings.

## Bugs

Every one is in the guard. **The configuration is unchanged and correct for the fourth round
running** — `d8e8e3f4…` and `1660df21…`, re-verified by all three lenses after every probe.

### B17 · MEDIUM · The JSONC comment stripper has a **silent** false-negative mode
`tools/guards/wrangler-config.test.ts:893-895` (`stripJsoncComments`), reached through
`readWranglerConfig:897-902`

**Found independently by two lenses, with different fixtures.** The adversarial lens's:

```json
{
  "note1": "begin /*",
  "vars": { "ENVIRONMENT": "prod" },
  "note2": "*/ end"
}
```

The `/*` inside one string value and the `*/` inside another are matched as a block comment
spanning between them. The entire `vars` object is deleted, **the remainder is still valid JSON**,
`JSON.parse` succeeds, and `environmentSetters` returns `[]`. Planted at `apps/probe/wrangler.jsonc`
in a repo copy, **all 62 guard tests passed** with a rogue top-level `ENVIRONMENT = "prod"`
invisible to R11. The acceptance lens reached the same place from a different fixture and confirmed
the same silence.

**This refutes a claim the harness made in writing.** `execution.md`'s attempt-4 entry argued the
stripper's realistic failure mode was a *loud* `JSON.parse` error rather than a silent bypass, and
used that to justify leaving it for validation. **That justification was wrong**, it was the
harness's own, and it was refuted by measurement — which is the correct outcome of flagging it
rather than fixing it, but the error belongs in the record.

**Why MEDIUM and not higher.** No `wrangler.jsonc` exists in this repository, so nothing ships
defeated today. It is MEDIUM rather than LOW because R11's entire purpose is to be the backstop on
the day someone adds one, and on that day this is the one file type where the backstop falls to an
ordinary two-string JSON layout rather than an adversarial trick. Same mechanism and same class as
B12/B13, which were MEDIUM.

### B18 · MEDIUM · R13's "a comment naming Phase 3" clause has never been tested, in any revision
`apps/api/src/index.test.ts` — the file R13's evidence now points at

R13 requires three things: the class returns 501, the handler delegates, and *"the class body is a
501 **with a comment naming Phase 3 as its owner**."* The first two are now proven behaviourally.
**The third has no test anywhere, and never has had one** — not in revision 1's three regexes, not
here. `grep -n "toMatch\|toContain" apps/api/src/index.test.ts` returns nothing.

The comment is present today, so the system is compliant. The defect is that Evidence row 13's
method is `unit` while this clause is `inspection` in practice, and **eleven tests were deleted last
round without anyone noticing this clause had no test to lose.** T07 rewrites that file next, which
is exactly when an untested comment clause disappears.

MEDIUM by `CONVENTIONS.md`'s own definition — a missing test for a stated criterion.

### B19 · LOW · Symlinked wrangler configuration files are still skipped
`tools/guards/wrangler-config.test.ts:867-883` (`findWranglerConfigPaths`)

**B14, unfixed, carried into new code.** A symlink's `Dirent` is neither `isFile()` nor
`isDirectory()`, so the walk skips it silently. Both lenses reproduced it; the acceptance lens
planted `apps/rogue-service/wrangler.toml` symlinked to a file outside the tree setting
`ENVIRONMENT = "evil-symlinked"` and all three R11 tests passed.

Severity unchanged from validation-03: only exploitable when the target sits outside every scanned
root. **One useful new fact:** the adversarial lens created a self-referential symlink and the walk
completed normally — an infinite loop is *structurally impossible today precisely because symlinks
are skipped*. Any fix must not reintroduce that.

### B20 · LOW · A `//` inside an ordinary field value crashes the guard instead of naming the file
`tools/guards/wrangler-config.test.ts:893-895`

A healthcheck or webhook URL in a `wrangler.jsonc` — `"http://example.com/ping"` — has everything
after `//` blanked, which breaks JSON syntax and throws `SyntaxError: Bad control character in
string literal`. Not a silent bypass, but not Scenario 8's promised *"fails, naming that file"*
either: an uncaught exception pointing at a byte offset. Same root cause as B17.

### B21 · LOW · `B7`'s three tests fail with an opaque TOML error rather than their own assertion
`tools/guards/wrangler-config.test.ts:781-807`

Observed by the harness before validation and **confirmed independently**. The tests append
`[env.staging.vars]` to `rawToml`, so a real file already containing that table throws
`Invalid TOML document: trying to redefine an already defined table or value`.

The adversarial lens sharpened it usefully: the collision is specifically on the `env.staging.vars`
table *path* — a bare `[env.staging]` does not trigger it — and it verified R11's real check still
fires correctly when the same mutation is expressed as an inline table. **It agreed with LOW, and so
do I**, on the reasoning stated at triage: this is a future test-authoring fragility that will
produce a confusing message when T18/T20 add a real staging block, not a masked gap. It is the same
*family* as round 3's worst finding but not the same *defect* — there a wrong-reason failure masked
a check that had stayed green; here R11's own test fires correctly on the identical mutation.

## Rejected and not-bugs, in writing

**The unit test's `expect(result).toBe(served)` proves object identity, which only exists because
the mock shares a JS heap.** Raised by the behaviour lens as a note, not a bug, and I agree. Under
workerd there is no equivalent property to assert. The contract already pairs it with Scenario 5,
and the percent-encoded path arriving raw independently proves `index.ts` forwards the request
unmodified. No action.

**`/plan%2F2026-08-03` returns 307 to the decoded path.** Unchanged from validation-02, issued by
the asset router downstream of the Worker. Out of scope — Scenario 5 specifies the literal deep
link. Already carried to T08.

**An ASSETS binding that throws produces a 500 with a stack trace.** There is no error-handling
task yet and T07 replaces this handler wholesale. Not a defect in T04.

**`scaffold.test.ts` fails inside a repo copy that has no `.git`.** Both lenses hit it and both
correctly identified it as a copy artifact rather than a defect. Worth one line for T01's benefit —
a guard that shells out to `git check-ignore` is not portable to a detached copy, which is how every
validation in this harness runs — but it is not T04's and it is not a bug.

**R6's cron comments are still not verified for correctness.** Rejected in validation-02, not
revisited, and the reason is on the check itself.

## Coverage gaps

1. **`run_worker_first = true` still has no behavioural proof.** Unchanged, unclosable here,
   closes at T08. The behaviour lens re-confirmed the reason: every path forwards to
   `env.ASSETS.fetch()`, so worker-first and assets-first stay byte-identical.
2. **No real Cloudflare account was contacted.** First contact is T18.
3. **A symlinked *directory* containing a wrangler config** is out of reach of any fix that avoids
   reintroducing loop risk. Whatever closes B19 should say so rather than implying otherwise.

## Hygiene

Three agents, three copies outside the tree, drivers kept outside the copies — the round-2 lesson
carried without being told, by all three. The real tree is unchanged, verified by the harness after
all three reported:

```
d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c  apps/api/wrangler.toml
1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e  apps/api/src/index.ts
```
