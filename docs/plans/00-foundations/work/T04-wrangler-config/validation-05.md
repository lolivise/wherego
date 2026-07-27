# Validation 05 — T04 `wrangler.toml`

**Verdict** BUGS FOUND · 0 HIGH, 1 MEDIUM, 2 LOW · **Date** 2026-07-26 · **Attempt** 5
**Round trip 2 of 3**
**Agents** 3, in parallel — regression, adversarial, contract sign-off

## Two of three lenses signed off clean

**The regression lens found no regressions and nothing dropped.** It re-checked all twenty-two
prior items (B1–B21 and N1) by reproduction rather than by reading, and re-ran a **28-mutation
corpus** against the real files: **zero came back green, and zero came back red for the wrong
reason.** That second number is the one that matters — it was round 3's worst finding, and it is now
measured at zero across the whole corpus.

It also confirmed the deletions are permanent rather than dormant: `stripScanComments`,
`stripJsoncComments` and `stripDeadFalseBranches` are absent by grep, so **B12, B13, B17 and B20
cannot recur because the mechanism no longer exists** — not because today's inputs happen not to
trigger it. The R13 rewrite was re-attacked with the exact fixtures that defeated the regex version
— a decoy `1501`, a decoy string literal quoting the call, and a genuine `if (false)` dead branch —
and caught all three for the right reason.

**All three factual claims in the coverage-boundary comment were tested and hold.** Including the
uncomfortable one: it planted a real config inside a symlinked directory and confirmed the guard
genuinely does not see it, so the disclosure is honest rather than decorative. And it drove the
class-name cross-check **in both directions** — `export` removed from the code, and `class_name`
renamed in the config only — with `wrangler deploy --dry-run` failing loudly each time.

**The contract sign-off lens found no bugs.** It re-attacked B18, B19 and B21's fixes independently,
planted validation-04's own adversarial fixtures fresh rather than reusing the guard's, and
spot-checked Scenarios 1, 2, 5 and 6 live. Both config files are byte-identical to attempt 1 for the
fifth round running.

## Bugs

All three are in the test code. **The configuration has never had a defect in five rounds.**

### B22 · MEDIUM · `index.test.ts` calls `fetch()` with **no arguments**, a shape the runtime never produces
`apps/api/src/index.test.ts:33-34`

A `PlanCoordinator` that returns **200 to every real Durable Object invocation** passes all three
tests:

```ts
fetch(request?: Request): Response {
  if (request === undefined) return new Response('Not implemented', { status: 501 });
  return new Response('I AM NOT A 501', { status: 200 });
}
```

**Reproduced by the harness independently of the reporting agent.** The three tests go green, and
the same class called the way a DO namespace actually calls it returns **200**.

Nothing is broken today — the shipped `index.ts` declares `fetch(): Response` with no parameter at
all, so this exact shape cannot apply to it. The defect is that **Evidence row 13 claims `unit`
proof of "the stub's 501" and the test proves it only under a call shape that never occurs.**
Nothing else in the chain covers it: the dry run proves the class is *exported*, never that
invoking it returns 501, and validation-04's Miniflare DO-namespace probe was a one-off validation
artifact, not a standing guard in the repo.

MEDIUM by `CONVENTIONS.md`: a stated criterion whose test does not establish it.

**Note for the fix:** `index.ts` is frozen at `1660df21…` and its signature takes no parameter, so
passing a `Request` needs a cast at the call site. Assert 501 **both** with and without an argument.

### B23 · LOW · An array-of-tables `vars` hides `ENVIRONMENT` from R11 entirely
`tools/guards/wrangler-config.test.ts` — `environmentSetters`

`[[vars]]` or `[[env.staging.vars]]` parses `vars` to an **array**, and `(cfg.vars ?? {}).ENVIRONMENT`
on an array returns `undefined` — indistinguishable from "no such key". Verified directly by the
harness against `smol-toml`:

```
array-of-tables top level    | vars isArray: true  | setters found: []
array-of-tables under env    | vars isArray: true  | setters found: []
normal table (control)       | vars isArray: false | setters found: ["top-level=prod"]
```

**Reported MEDIUM; downgraded to LOW here, with the reason.** An array-form `vars` is not a
deployable wrangler configuration — wrangler rejects it — so this shape **cannot ship the bypass**
R11 exists to prevent. And in `apps/api/wrangler.toml` itself, R9's
`env.local.vars.ENVIRONMENT !== 'local'` check catches the same malformation independently. What
fails is the evidence, not the property, which is the same calibration applied to B7 and B8 in
validation-02.

Fixed anyway, because a structural check that silently accepts a shape it cannot read is the
category of defect this whole task has been about. The fix is a type guard, not a parser: if `vars`
is present and is not a plain table, that is itself a named violation.

### B24 · LOW · An unreadable **directory** throws uncaught, breaking the guard's own written promise
`tools/guards/wrangler-config.test.ts` — `readdirSync` inside `findWranglerConfigPaths`'s `walk`

`findEnvironmentUniquenessViolations` wraps `readWranglerConfig` in a try/catch but calls
`findWranglerConfigPaths` outside it, so an `EACCES` from `readdirSync` escapes both — discarding
any violations already accumulated in that walk and failing with a permissions stack trace instead
of Scenario 8's promised *"fails, naming that file"*.

The guard's own comment says *"never a silent pass and never an uncaught exception."* Every other
unreadable case — unparseable file, unreadable **file**, broken symlink, ELOOP, FIFO, BOM, binary,
empty — already degrades correctly. A directory is the one sibling axis that does not.

**Reported MEDIUM; downgraded to LOW.** Git does not track directory permissions, so this cannot
arrive through a normal commit, and when it fires CI still goes red — loudly, just misdirected. It
is a confusing failure, not a missed detection.

## Rejected and not-bugs, in writing

**R13's "class body" wording clashes with idiomatic TypeScript.** A doc comment precedes the
declaration it documents; it does not sit inside a two-line method. So no correct implementation can
satisfy the criterion's literal words, and B18's whole-file match is the closest honest reading.
The sign-off lens raised it and recommended noting it rather than sending it back to
`/design-task`. **I agree** — the intent (*a stub that says "not my job, ask Phase 3"*) is met, and
`"Phase 3"` appears exactly once in the file, in the right place. Recorded for whoever amends the
contract next; **not** a blocker.

**`R2` and `B10` both go red on a `workers_dev` mutation**, because `expectNoViolation`'s keyword
filter matches the shared substring. Raised LOW-informational by the regression lens and **not a
bug**: it over-triggers on a real defect rather than staying green on one, and it is inherent to
the keyword-filter design from fix-01, untouched by fix 03.

**The symlinked-directory gap** is real, confirmed by planting a config inside one, and already
named in the coverage boundary. No action — closing it means following directory symlinks, which
reintroduces the loop risk validation-04 recorded.

**Everything the adversarial lens cleared**, listed so it is not re-attacked next round: symlink
chains, symlink-to-symlink-to-directory, dangling targets, ELOOP pairs, FIFO targets, targets inside
skip-listed directories, empty files, binary files, BOM-prefixed files, no-read-permission *files*,
a directory literally named `wrangler.toml`, TOML inline tables, dotted keys, quoted table headers
and quoted keys, `vars` as a string or null, `env` as a JSON array. Also confirmed:
`index.test.ts` is not cwd-sensitive, and B21's probe guarding has no gap on either probe name.

## Contract accuracy

**`acceptance.md`'s Evidence row 13 was never updated when fix 03 added the Phase-3 assertion.** The
code now delivers more than the "Where" column describes. This is a description correction inside
Amendment 1's existing scope — Amendment 1 already moved row 13 to `index.test.ts` — not a new
criterion, and it is applied rather than left to drift.

## Coverage gaps

1. **`run_worker_first = true` still has no behavioural proof.** Unchanged; closes at T08.
2. **No real Cloudflare account contacted.** First contact is T18.
3. **A config inside a symlinked directory is unreachable**, deliberately, to keep loops impossible.

## Hygiene

Three agents, three copies outside the tree, drivers outside the copies. The real tree is unchanged:

```
d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c  apps/api/wrangler.toml
1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e  apps/api/src/index.ts
```
