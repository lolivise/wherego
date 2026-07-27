# Fix 01 — T04 `wrangler.toml`

**Date** 2026-07-26 · **Attempt** 1 · **Bugs addressed** B1–B6, all six
**Files changed** `tools/guards/wrangler-config.test.ts` **only**

`apps/api/wrangler.toml` and `apps/api/src/index.ts` were never touched. Their sha256 is unchanged
from before validation, re-verified by the harness after every probe below:

```
d8e8e3f40e1c3695deec94fd4df7e88aceae61ead04ebb5d130caa7db2221e8c  apps/api/wrangler.toml
1660df21cacaa87f3df2b6a5637d3d35b07893de021a86f589b0c443d6e4990e  apps/api/src/index.ts
```

Tests **155 → 168** repo-wide; 45 → 58 in this file. Nothing was removed, skipped or loosened.

## One root cause behind four bugs

B1, B2, B3 and B4 were not four defects. They were one: **the guard's assertions were inline
`expect()` calls against a single module-level parsed config, so a mutation test had no way to
re-run them against a different input.** Having no way to exercise the real check, the tests
re-asserted something trivially true in their own bodies — which is precisely why they could not
fail.

The fix extracts `findViolations(config, rawToml): string[]`, a pure function returning
self-explanatory violation strings. Every `R` test asserts it reports nothing for its field; every
`Scenario` test mutates the real `rawToml`, re-parses it with `smol-toml`, and asserts the returned
list contains the specific expected violation. The scenario tests now run the same code path the
guard runs.

| Bug | Verdict | Fix | Where |
|---|---|---|---|
| B1 | fixed | violation string states the array-form bypass; surfaced via vitest's message argument | `:210-215`, `:293-296`, `:415` |
| B2 | fixed | violation string names §2 and the Free plan | `:139-142`, `:308-319` |
| B3 | fixed | scenario tests call `findViolations` on a mutated parse instead of asserting in-body | throughout |
| B4 | fixed | `findEnvironmentLocalAssignments(roots)` takes explicit roots; Scenario 8 scans a fresh temp root the real config cannot be inside | `:631-644`, `:755-782` |
| B5 | fixed | walk every file with a UTF-8 check, not an extension allowlist | `:721-745` |
| B6 | fixed | binding-type census, both directions, quoting §2 | `:255-278`, `:640-670` |

## The fix that did not land the first time

The agent's first attempt got `findViolations` and the ordering right — the descriptive check runs
before the bare structural ones, so it fails first — and reported B1 and B2 as fixed. **They were
not.** The harness re-ran the reproduction rather than believing the report, and got:

```
AssertionError: expected [ Array(1) ] to deeply equal []
```

`expect(arrayOfOneLongString).toEqual([])` collapses the nested array, so **the violation text never
reached the terminal.** The logic was correct and the output was useless, which for a bug whose whole
subject is the failure *message* is the same as not fixed. Sent back with the literal terminal output
attached; closed by passing `matches.join('\n')` as vitest's second `expect` argument, which prints
verbatim ahead of the diff, applied at all 17 call sites.

Worth keeping in the record: this is the second time in this task that a claim survived until someone
ran the thing. The first was the task file's four assumptions about wrangler.

## Fail-then-pass, re-run by the harness

Every probe below was applied by the harness to the real tree, run, and reverted, with the sha256 of
both untouched files re-checked afterwards.

**B1** — `run_worker_first = true` → `["/api/*", "/healthz"]`:

> `AssertionError: assets.run_worker_first must be the boolean true, not an array — the array form
> causes paths outside the list to bypass the Worker entirely, since it inverts the default for
> every unlisted path (served assets-first and never reaching the Worker at all)`

**B2** — `[limits]` / `cpu_ms = 50` appended:

> `AssertionError: [limits] must not appear anywhere in the file (found at: top level) — §2:
> limits.cpu_ms is a Paid-only setting and the account is on the Workers Free plan, where the 10ms
> CPU ceiling cannot be raised`

**B3** — the property that was missing. Loosened the rule *inside* `findViolations`
(`if (false && Array.isArray(...))`) and re-ran: **1 failed, 57 passed**, and the one failure is
`Scenario 4 — run_worker_first cannot be weakened to the array form > the array form fails, naming
the bypass it causes`. Before the fix, loosening the check left every Scenario test green.

**B4** — the test that could not fail. Neutered the roots parameter
(`for (const root of [repoRoot])`) and re-ran: **1 failed, 57 passed**, the failure being
`Scenario 8 … a second file assigning ENVIRONMENT="local" is caught and named, scanning only a fresh
root`. Before the fix, deleting the entire `extraFiles` loop left it green.

**B5** — wrote `tools/probe-b5.sh` containing `ENVIRONMENT="local"`, a file type the old extension
allowlist skipped entirely: **1 failed, 57 passed**, `R11 — a repo-wide scan finds exactly one
assignment, in this file`.

**B6** — appended `[[kv_namespaces]]`:

> `AssertionError: the set of declared binding types must be exactly
> ["d1_databases","durable_objects","assets","triggers","vars"] — §2: "No R2, no KV, no Queues, no
> Workflows" …; found [… "kv_namespaces" …]; unexpected: ["kv_namespaces"]`

All five probe files and edits reverted; `pnpm typecheck`, `pnpm lint` and `pnpm test` (168) green
afterwards, and both sha256 values unchanged.

## Decided during the fix, and flagged rather than buried

**`docs/` is excluded from R11's widened scan.** B5 said to skip only `node_modules`, `.git`,
`dist`, `.wrangler` and the lockfile. Taken literally that scans `docs/`, where the T04 task file,
`plan.md`, `acceptance.md`, `validation-01.md`, T08's task file and `00-foundations.md` all quote
`ENVIRONMENT = "local"` verbatim as exposition — this repo's own convention is to carry reasoning
verbatim, and the fix agent is barred from editing anything under `docs/`. So R11 would have failed
against the real repo for a reason that is not a defect.

The agent added `docs` to the skip list with the reasoning in a comment and said so rather than
treating it as a silent scope decision, which is the correct handling. **Accepted.** The property
that matters is that no *executable or config* file other than `wrangler.toml` sets the value, and
`docs/` is prose. Confirmed by grep: outside `docs/`, only `wrangler.toml` and the guard itself
mention `ENVIRONMENT` at all.

It does narrow R11's literal wording — *"nothing else in the repository"* — and that narrowing is
now in the record rather than only in a comment.

## Rejected findings, carried forward unchanged

The three rejections in `validation-01.md` stand and are not revisited here: an `[env.production]`
block is inert; a present-but-empty `dist` passing the dry run is wrangler's behaviour and is already
named in the frozen contract, with the mitigation handed to T10; and the hand-triggered cron's
opaque 500 is correct until Phase 3 exports `scheduled()`.
