# Validation 02 — T01 Monorepo scaffold

**Verdict** BUGS FOUND (1 HIGH, 3 MEDIUM — all new, none a contract violation) · **Date** 2026-07-25 · **Attempt** 2

## Part 1 — every bug from `validation-01.md`, re-checked

| Bug | Still reproduces? | Evidence |
|---|---|---|
| B1 · `Date` ban porous | **No** | All four listed bypasses now error; `date-ban.test.ts` 7/7 |
| B2 · apps cannot import `@wherego/*` | **No** | Real imports added to both apps: `typecheck` and `--filter web build` both exit 0 |
| B3 · five script names unguarded | **No** | `lint` → `lintx` now fails the suite (1 failed / 53 passed) |
| B4 · `engines` range vs `.nvmrc` pin | **No** | `>=24 <25`; guard evaluates range semantics — admits 24.0.0 and 24.99.99, rejects 25.0.0 |
| LOW · purity is a name allowlist | **Still true, and worse than described** | See N1 |

**No regression.** The `Date` ban is still correctly scoped — byte-identical `new Date()` is rejected
under `packages/scheduler/src/` and accepted under `packages/domain/src/`. Test growth is entirely
additive: 41/3 → 54/4, with `scaffold.test.ts` 37→43, `date-ban.test.ts` 2→7,
`scheduler-purity.test.ts` unchanged, plus the new `workspace-imports.test.ts`. **No test name from
attempt 1 is missing**, nothing skipped, no assertion removed. No dependency cycle; nothing depends
back into `@wherego/scheduler`.

**Mutation sweep — twelve mutations, eleven went red.** Including the two new regression guards
(`lint` rename, `engines` reopened) and the module-resolution guard, which correctly went red when
`@wherego/domain` was removed from `apps/api` and reinstalled. That guard is sound: it spawns a
`node` subprocess with `NODE_PATH` stripped, so pnpm's shared virtual store cannot fake a
resolution. The twelfth mutation is N1.

**Cold CI run, `node_modules` absent:** `install --frozen-lockfile` (reused 207, downloaded 0) →
`typecheck` → `lint` → `test` (54/54) → `test:sim` → `test:worker` → `build`, all exit 0. No prompt,
no hang, no machine-local state. The regenerated lockfile installs frozen cleanly.

## New findings

All five are holes in the **design intent** of §2's `Date` rule. **None violates a frozen criterion**
— Scenario 4 asserts `new Date()` is rejected, and it is; Scenario 6 names `dependencies` and
`peerDependencies`, and those are checked. They are reported because §2 calls this "the single rule
that prevents more bugs than any other line in this document", and nineteen tasks inherit it.

### N1 · HIGH · A date library in `devDependencies` walks past the purity guard entirely

**Where** `tools/guards/scheduler-purity.test.ts:43` — reads `dependencies` and `peerDependencies`,
not `devDependencies`.

**Reproduce** Add `dayjs` to `packages/scheduler/package.json` `devDependencies`; `pnpm test` stays
green (2/2). A file containing `import dayjs from 'dayjs'; dayjs().valueOf()` lints with zero
messages.

**Why it matters** pnpm installs `devDependencies` by default and Wrangler bundles whatever is
imported, so this is not a technicality — it ships. It is also the *first* thing an engineer reaches
for when told they may not use `Date`: install a date library. The ban and the purity guard both
miss it, so nothing in CI objects.

### N2 · MEDIUM · `Intl.DateTimeFormat` with no argument reaches the clock

`new Intl.DateTimeFormat().format()` formats *now*. Lints clean. `packages/scheduler` does no
formatting at all — `formatRoc()` lives in `packages/domain` — so `Intl` has no legitimate use here.

### N3 · MEDIUM · `performance.timeOrigin + performance.now()` reaches the clock

Lints clean. Same argument: pure day arithmetic has no use for `performance`.

### N4 · MEDIUM · `InstanceType<typeof Date>` evades the type-position rule

The fix's selector is `TSTypeReference[typeName.name='Date']`; a `typeof` query is a `TSTypeQuery`
and is not matched.

### N5 · LOW, accepted as unfixable · Runtime-computed access

`Reflect.get(globalThis, "Date")` and `globalThis['Da' + 'te']` both lint clean. **These are
statically undecidable** — no lint rule can catch a property name assembled at runtime, and any rule
broad enough to try would fire on legitimate code. Recorded as an accepted limitation, not a bug.
The threat model here is an engineer reaching for the clock by habit, not one working around a rule
deliberately; someone doing the latter can always win.

## Also noted

**A guard shells out to `git`.** `scaffold.test.ts`'s R3 check runs `git check-ignore`, so
`pnpm test` fails with `fatal: not a git repository` in a tree without `.git`. Not a defect —
`actions/checkout` always produces `.git`, and the cold CI run with `.git` present was clean — but it
is a dependency on the working tree being a git repository that nothing states, and it would bite
anyone running the suite in a stripped container.

## Coverage gaps

- **Scenario 1 still cannot be proven literally.** Nothing is committed; `git clone` yields an empty
  directory. Unchanged from validation 01, and unfixable by an agent. **T10's CI cannot pass until
  T01 is committed.**
- Filter matching remains pnpm-version-dependent; the Date-ban glob still would not match a `.tsx`
  file under `packages/scheduler`; no third-party surface exists to exercise.

## Verdict

**BUGS FOUND.** The four original bugs are genuinely fixed and mutation-confirmed. N1 is HIGH and
cheap to close; N2–N4 are MEDIUM and equally cheap. N5 is rejected as statically undecidable.

The contract as frozen is fully met — every one of R1–R7 and S1–S10 passes or is the known S1 gap.
These findings are against the spec's intent rather than the contract's letter, which is the right
place to be strict: this is the task that sets the rule everything else inherits.
