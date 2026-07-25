# Progress — Phase 0 · Foundations

**Plan** [`../00-foundations.md`](../00-foundations.md) · **Spec** `docs/PLAN.md` §2, §3, §9, §10, §11
**Scoped** 2026-07-25 · **Updated** 2026-07-25 · **Status** in progress — 1/21 done

## Exit gate

> **A green production deploy through the full chain, and an unauthenticated app route returning
> 403.** Do not begin Phase 1 until both are true — every later phase deploys through this chain,
> and a authentication hole found in Phase 4 has by then been assumed correct by four phases of
> work.

## Board

`Exec` is `agent` (the harness builds it) or `manual` (a purchase, a console click, or a person —
`/build-task` cannot run it; `/run-plan` halts and hands over the task file's checklist).

| ID | Task | Plan tasks | Deps | Exec | State | Attempt | Latest artifact | Notes |
|----|------|-----------|------|------|-------|---------|-----------------|-------|
| T01 | Monorepo scaffold | P0-02 | — | agent | **done** | 3 | [`validation-03.md`](work/T01-monorepo-scaffold/validation-03.md) | Sets every convention downstream copies. 61 tests, 18 mutations all red. **Must be committed before T10's CI can pass** |
| T02 | Cloudflare account & zone check; app hostname | P0-01a | — | manual | todo | 0 | — | 10 min. Must precede T03 |
| T03 | Cloudflare provisioning — Workers Paid, D1 APAC | P0-03a | T02 | manual | todo | 0 | — | A purchase |
| T04 | `wrangler.toml` — limits, bindings, crons, `[assets]`, `[env.local]` | P0-03b, P0-01b | T01, T03 | agent | todo | 0 | — | Needs `database_id` from T03. Owns Workers Static Assets. Open Q: worker-first vs assets-first — settle before T08 |
| T05 | Migration 0001 — the full §3 schema | P0-04 | T01 | agent | todo | 0 | — | |
| T06 | Local loop — `wrangler dev --local` with real D1 | P0-15a | T04, T05 | agent | todo | 0 | — | Gate: every later validation runs through it |
| T07 | `/healthz` and the Hono skeleton | P0-05 | T04, T06 | agent | todo | 0 | — | |
| T08 | Default-deny Access JWT middleware + CI test | P0-07 | T07 | agent | todo | 0 | — | Half the exit gate. Mock JWKS at `tools/mocks/cf-access/` |
| T09 | Seed data — `doctors`, `holidays`, `settings` | P0-17a | T05 | agent | todo | 0 | — | `expected_roster_size` stays NULL until T11 |
| T10 | `ci.yml` | P0-12 | T01, T08, T09 | agent | todo | 0 | — | |
| T11 | The clinic conversation — 個資法 + seven questions | P0-16 | — | manual | blocked | 0 | — | **Clinic.** Book in week 1 — longest lead time; blocks Phases 1 and 2, not Phase 0 |
| T12 | Google Cloud project + Maps ToS caching answer | P0-09 | — | manual | todo | 0 | — | The ToS answer is a schema gate for Phase 1 |
| T13 | LINE channels — production and development | P0-08 | T02 | manual | todo | 0 | — | Webhook path must match T08's allowlist |
| T14 | healthchecks.io checks + `age` backup keypair | P0-10 | — | manual | todo | 0 | — | |
| T15 | 1Password vault, service account, `production` Environment | P0-11 | T03, T12, T13, T14 | manual | todo | 0 | — | Required reviewer is the only human gate before production |
| T16 | `deploy.yml` | P0-13 | T10, T15 | agent | todo | 0 | — | Authoring only; T20 runs it |
| T17 | `backup.yml` | P0-14 | T15 | agent | todo | 0 | — | Decrypt drill is T20 |
| T18 | Bootstrap deploy and bind the custom domain | P0-17b, P0-01c | T07, T15 | manual | todo | 0 | — | `secret bulk` needs a Worker to exist |
| T19 | Cloudflare Access application | P0-06 | T18 | manual | todo | 0 | — | `/healthz` on **bypass**, not allow-everyone |
| T20 | First green production deploy + four negative proofs | P0-13v, P0-14v | T16, T19 | manual | todo | 0 | — | **This is the exit gate** |
| T21 | Preview-version flow and the dev-channel tunnel | P0-15b | T13, T18 | manual | todo | 0 | — | |

## Log

Append-only. One line per state transition. Newest last.

- `2026-07-25` · **phase** · `— → scoped` · 21 tasks from 17 plan tasks; 9 agent, 12 manual. T11 seeded `blocked` (clinic).
- `2026-07-25` · **phase** · board approved · Manual tasks: `/run-plan` halts and hands over the task file's `## Manual checklist`. No change to `CONVENTIONS.md`. `/validate-task` still verifies the *result* where it can be observed (dig the zone, curl for 403, confirm `op://` refs resolve) — never the clicking.
- `2026-07-25` · **T01** · `todo → planned` · [`work/T01-monorepo-scaffold/plan.md`](work/T01-monorepo-scaffold/plan.md) · 4 questions answered. Repo confirmed greenfield — `git ls-files` empty. **Node 22 → 24 across the spec** (`docs/PLAN.md` §11.1/§11.2, `00-foundations.md`, the T01 task file) on the user's decision.
- `2026-07-25` · **T04** · scoping gap fixed · Workers Static Assets (§2, §8, §11.2) had **no owner** in Phase 0 — T04 never mentioned assets and neither did P0-03. T04 now owns the `[assets]` block, +3 criteria. New open question recorded there: worker-first vs assets-first routing, which decides what §9(d)'s "app route returns 403" means for T08 and T20.
- `2026-07-25` · **T01** · `planned → criteria-set` · [`work/T01-monorepo-scaffold/acceptance.md`](work/T01-monorepo-scaffold/acceptance.md) · **agreed and frozen.** 7 config requirements + 10 scenarios; 14 evidence rows, all `unit`/`e2e`, no `inspection`, no `manual`, no mocks. Task criterion 3 (`migrations/` as a workspace member) re-read as tracked-directory + 6 code members, on the record.
- `2026-07-25` · **T01** · `criteria-set → executed` · [`work/T01-monorepo-scaffold/execution.md`](work/T01-monorepo-scaffold/execution.md) · attempt 1, complete. ~30 files, all six root scripts exit 0 (re-run by the harness, not taken from the agent), 41 tests in 3 files, `Date` ban proven both directions with a real eslint probe. 3 plan gaps folded back. **Plan Risk 1 closed** — `pnpm --filter web build` resolves, T16 copies §11.2 verbatim. **T10 gained a criterion**: pnpm 11's build-script approval gate, survivable only because `allowBuilds` is committed.
- `2026-07-25` · **harness** · **one pause per task.** `/run-plan` now stops only at design — questions, plan and criteria presented together for a single confirmation — then runs build → validate → fix → doc straight through to `done` and into the next task's design. Bugs found in validation no longer prompt; fixing them is the run. Halt conditions unchanged, and are failures rather than check-ins. Edited: `run-plan/SKILL.md`, `CONVENTIONS.md`, `CLAUDE.md`.
- `2026-07-25` · **T01** · `executed → bugs-found` · [`work/T01-monorepo-scaffold/validation-01.md`](work/T01-monorepo-scaffold/validation-01.md) · 3 agents, 3 lenses. **B1 HIGH** `globalThis.Date` walks straight past the ban. **B2 HIGH** no app declares a `@wherego/*` dependency, so nothing can import them. **B3/B4 MEDIUM** five script names unguarded; `engines` range vs `.nvmrc` pin. 8 guard mutations run, 7 went red. Coverage gap: Scenario 1 unprovable until the repo is committed — **T10's CI fails until then.**
- `2026-07-25` · **T01** · `bugs-found → fixing` · [`work/T01-monorepo-scaffold/fix-01.md`](work/T01-monorepo-scaffold/fix-01.md) · all 4 fixed, 8 files, 4 regression tests each proven to fail first. Tests 41 → 54. LOW purity finding rejected in writing (faithful to frozen Scenario 6). B4 fixed rather than routed back to design: the contract outranks `plan.md`, which has been corrected.
- `2026-07-25` · **T01** · `fixing → bugs-found` · [`validation-02.md`](work/T01-monorepo-scaffold/validation-02.md) · B1–B4 confirmed fixed and mutation-tested. 5 **new** holes in §2's `Date` rule, none a contract violation: a date library in `devDependencies` (HIGH — pnpm installs devDeps and Wrangler bundles them), `Intl.DateTimeFormat()`, `performance.timeOrigin`, `InstanceType<typeof Date>`. N5 (runtime-computed access) rejected as statically undecidable.
- `2026-07-25` · **T01** · `bugs-found → fixing` · [`fix-02.md`](work/T01-monorepo-scaffold/fix-02.md) · N1–N4 closed in two layers — manifest guard catches declaring a date library, `no-restricted-imports` catches using it. Tests 54 → 61.
- `2026-07-25` · **T01** · `fixing → validated` · [`validation-03.md`](work/T01-monorepo-scaffold/validation-03.md) · **PASS**, round trip 3 of 3. All 8 prior bugs fixed; N5's rejection independently upheld. **No leak** — every banned construct still legal in `domain`, `geo`, `api` and `web`. 18 mutations, none stayed green. Cold CI all six exit 0.
- `2026-07-25` · **T01** · `validated → done` · `doc.md` and `feature.md` **created** (first run). `doc.md`: one line per file across all 34, the stack marked honestly where things are not yet wired, and the `Date` ban documented as the convention it is. `feature.md`: **no user-facing feature exists** — T01 is infrastructure and gets no entry, per the rule. Four enforced invariants recorded instead, since they are the only thing the repo currently does.
