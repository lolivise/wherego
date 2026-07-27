# Fix 03 — T04 `wrangler.toml`

**Date** 2026-07-26 · **Attempt** 5 · **Bugs addressed** B17–B21, all five
**Files changed** `tools/guards/wrangler-config.test.ts` and `apps/api/src/index.test.ts`

Tests **174 → 184**. Nothing removed, skipped or loosened. Both configuration files untouched,
sha256 re-verified by the harness after every probe:

```
d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c  apps/api/wrangler.toml
1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e  apps/api/src/index.ts
```

## B17 and B20 were fixed by deletion, and that was the instruction

`stripJsoncComments` is **gone**. It was not made smarter, and the brief said so in as many words:
three rounds were spent removing hand-rolled comment stripping from this file, B17 was it growing
back, and a cleverer version is the same defect with a longer fuse.

`readWranglerConfig` now does the whole job in three lines: `.toml` → `smol-toml`, `.json` and
`.jsonc` → plain `JSON.parse` on the raw text with **no preprocessing whatsoever**. The insight that
makes this work is that there was never anything to strip — `/*`, `*/` and `//` inside a quoted
string are just characters, and the only reason they were dangerous is that something was looking
for them.

The second half matters as much: **a parse failure, for any extension, is now a named violation
rather than a thrown exception.**

> `R11 could not read …/apps/probe/wrangler.jsonc — Expected property name or '}' in JSON at
> position 4 (line 2 column 3). An unparseable wrangler configuration can never be silently treated
> as one that sets nothing; fix or remove it.`

A comment-free `wrangler.jsonc` parses and is read structurally. One with real comments fails
loudly, by name. The scan supports the JSON that `JSON.parse` supports, not JSONC — stated on the
check rather than left for someone to discover.

## The other three

| Bug | Fix |
|---|---|
| B18 | `apps/api/src/index.test.ts:44-47` reads `index.ts` as text and asserts it names Phase 3. Raw text is the right instrument for a claim about a comment — R6 already does exactly this for the Asia/Taipei cron lines, and the alternative is a brace matcher, which is what we just deleted |
| B19 | `findWranglerConfigPaths` `statSync`s a symlink and follows it **if it resolves to a file**. Directory symlinks are deliberately not followed; a dangling link is caught and skipped rather than throwing ENOENT |
| B21 | `assertProbeEnvironmentIsFree(cfg, probeName)` runs at the top of each B7 test. The agent chose asserting the probe name is free over renaming it, so the test names stay intelligible and the failure lands where the collision actually is |

## Fail-then-pass, re-run by the harness against the REAL repo-wide scan

The guard's own new tests use temp directories. The harness ran these against the real tree
instead — the path a genuine accident would take — then removed every probe and re-verified both
checksums.

| Probe | Result |
|---|---|
| B17's exact fixture at `apps/probe/wrangler.jsonc` | red — `found 1 illegitimate setter(s): top-level="prod" in …/apps/probe/wrangler.jsonc`. **Caught as an ENVIRONMENT violation, not as unparseable** — the file is valid JSON throughout, so it parses and the `vars` table survives intact |
| a `wrangler.jsonc` with real `//` comments | red — the named `R11 could not read …` violation above. Not a silent pass, not a raw throw |
| `apps/rogue/wrangler.toml` symlinked outside the tree | red — `top-level="evil-symlinked" in …/apps/rogue/wrangler.toml` |
| **two nested self-referential directory symlinks** | **suite completes in 1 second, exit 0.** No loop |
| a broken symlink named `wrangler.toml` | 184 passed, no throw |
| the sole `Phase 3` comment removed | red — `expected '// Placeholder Worker entry point. Th…' to match /Phase 3/` |
| `[env.staging.vars]` appended to the real config | red on **its own named message** — *"B7's tests probe with the environment name `env.staging`, which must not collide with real configuration … pick a different probe environment name"* — no TOML redefine error |

## A false alarm of the harness's own, recorded because the lesson is the point

**The first B18 reproduction reported PASS and the fix was fine.** The probe was
`s/is Phase 3\./is LATER./`, and in the source `is` ends one line while `Phase 3.` begins the next
behind a `// ` — so the pattern never matched and the mutation silently did nothing. All 184 tests
passed because **the file was unchanged**, not because the assertion was weak.

Caught by checking the mutation had applied (`grep -c "Phase 3"`) before believing its result. That
is the same class of defect as B11's `assertMutated` — *a mutation that quietly fails to mutate* —
this time in the harness's own probe rather than in the guard, which is a fair reminder that the
diagnostic exists because the failure mode is easy to hit.

A second false alarm, less interesting: `timeout` does not exist on macOS, so the symlink-loop probe
exited 127 and tripped an `|| echo "HUNG"` fallback. Re-run with real timing: 1 second.

## Stated limitation, not hidden

**B18's assertion matches `Phase 3` anywhere in `index.ts`, not specifically inside the class
body.** R13's wording is *"the class body is a 501 with a comment naming Phase 3 as its owner"*, and
scoping the match to the class body requires finding the class body — a brace matcher, which is
precisely what revision 2 deleted and what produced B15, B16 and N1. Whole-file is the right trade
for a comment check, and it is the same scope R6's cron-comment assertion uses.

## Rejections carried forward, unchanged

All four from `validation-04.md` stand and are not revisited: the unit test's `toBe` identity
assertion, the percent-encoded 307, a throwing ASSETS binding, and `scaffold.test.ts`'s
non-portability to a `.git`-less copy.
