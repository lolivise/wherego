# Delivery harness — shared conventions

Every harness skill reads this file first. It is the single definition of paths, task-file shape,
the state machine and `progress.md`. **If a skill and this file disagree, this file wins** — fix the
skill rather than working around it.

The harness exists so that a build spanning months survives interruption. At any moment the answer
to *"where was I?"* is one file: the phase's `progress.md`.

---

## The loop

**`/run-plan <plan>` is the entry point.** It sequences everything below, one task at a time, and
enforces the gates between the steps. The individual skills are still callable on their own for
repair and re-runs.

```
/run-plan <plan>  ─── orchestrates the whole phase ───────────────────────┐
                                                                          │
/scope-tasks <plan>     plan file       → plan folder + tasks/ + progress.md
      │                                   ↳ show the board, get a go-ahead
      ▼
/design-task <task>     task + code     → work/<task>/plan.md
      │                 ↳ ANY ambiguity → ask the human, wait, record. NEVER GUESS.
      ▼
/write-acceptance-criteria              → work/<task>/acceptance.md  ← THE CONTRACT
      │                 (the global skill; annotate + save per "Acceptance contract" below)
      │
   ═══════════════ THE ONE PAUSE ═══════════════════════════════════════════
   Present answers + plan + criteria together. One confirmation. Then the
   rest of the task runs uninterrupted — no check-ins, no "shall I continue".
   ══════════════════════════════════════════════════════════════════════════
      ▼
/build-task <task>      plan + ACs      → code                          (sonnet 5 agent)
      │
      ▼
/validate-task <task>   code            → work/<task>/validation-NN.md  (sonnet 5 agents)
      │                                   local e2e + mocked third parties
      ├── bugs found ──► /fix-task-execution <task> ──► back to /validate-task  (max 3)
      │
      ▼
/doc-feature [task]     validated code  → doc.md + feature.md, task → done
      │
      ▼
   Report what changed and what was proven ───────────► the next task's design
```

One task at a time. Do not start the next task while the current one is not `done`.

**Where the human is, and is not.** Every decision that is the human's belongs to the design pause —
the questions `/design-task` refuses to guess at, and the criteria the whole task is then judged
against. After that confirmation the task runs to `done` on its own: build, validate, fix, validate
again, document. Bugs found in validation are not a reason to stop and ask; fixing them is the run.
The only other interruptions are the halt conditions in `/run-plan`, and each of those is a failure
rather than a question.

---

## Paths

| Thing | Path |
|-------|------|
| Specification | `docs/PLAN.md` |
| Roadmap | `docs/plans/ROADMAP.md` |
| Phase plan | `docs/plans/<slug>.md` |
| **Plan folder** | `docs/plans/<slug>/` |
| Progress tracker | `docs/plans/<slug>/progress.md` |
| Task files | `docs/plans/<slug>/tasks/T<NN>-<task-slug>.md` |
| Task artifacts | `docs/plans/<slug>/work/T<NN>-<task-slug>/` |
| Project doc | `doc.md` (repo root) |
| Feature inventory | `feature.md` (repo root) |

**Slug rule.** The plan folder takes the plan file's basename verbatim.
`docs/plans/02-scheduler-core.md` → `docs/plans/02-scheduler-core/`. No renaming, no prefixes.

**Task IDs are stable and never reused.** `T07` means the same thing forever, even if the task is
dropped — mark it `dropped`, do not renumber. Reference them in commit messages:
`T07: Held–Karp over asymmetric matrix`.

Artifacts inside a task's work folder:

```
docs/plans/02-scheduler-core/work/T07-held-karp/
  plan.md            ← /design-task   (overwritten on replan, previous kept as plan-v1.md)
  acceptance.md      ← /write-acceptance-criteria — the contract; frozen once agreed
  execution.md       ← /build-task    (append-only across attempts)
  validation-01.md   ← /validate-task
  fix-01.md          ← /fix-task-execution
  validation-02.md   ← /validate-task (re-run)
```

Mock servers are **not** per-task. They live at `tools/mocks/<service>/`, are committed, and are
shared across every phase — the Google geocoding mock is needed by Phases 1, 2 and 7, and three
drifting copies is worse than none. Fixtures are synthetic; see `/validate-task`.

---

## State machine

```
todo ──► awaiting-answers ──► planned ──► criteria-set ──► executed ──► validating ──┬──► validated ──► done
              (never guess)                                   ▲                      │
                                                              │                      ▼
                                                           fixing ◄──────────── bugs-found
```

| State | Means | Set by |
|-------|-------|--------|
| `todo` | Task file exists, nothing started | `/scope-tasks` |
| `awaiting-answers` | Design found an ambiguity; **waiting on the human**. Nothing proceeds | `/design-task` |
| `planned` | `plan.md` written, **zero open questions** | `/design-task` |
| `criteria-set` | `acceptance.md` written, annotated and agreed | `/run-plan` (the global AC skill knows nothing of `progress.md`) |
| `executed` | Code written, task's own checks pass locally | `/build-task` |
| `validating` | Validation agents running | `/validate-task` |
| `bugs-found` | Validation report has ≥1 open bug | `/validate-task` |
| `fixing` | Fix agents running | `/fix-task-execution` |
| `validated` | Validation report has zero open bugs | `/validate-task` |
| `done` | `doc.md` and `feature.md` reflect it | `/doc-feature` |
| `blocked` | Needs a human answer; **`Notes` must say what and who from** | any |
| `dropped` | Not being built; **`Notes` must say why** | any |

`blocked` is not a parking space. A task sitting `blocked` for more than a day is a question that
was never actually asked.

---

## `progress.md`

Created by `/scope-tasks`, updated by every other skill, **never rewritten wholesale** — edit the
board row and append to the log. This is the resume point; a skill that fails to update it has
failed.

````markdown
# Progress — Phase 2 · Scheduler core

**Plan** [`../02-scheduler-core.md`](../02-scheduler-core.md) · **Spec** `docs/PLAN.md` §5, §6
**Scoped** 2026-07-25 · **Updated** 2026-07-25 · **Status** in progress — 3/14 done

## Exit gate

> Every property test green, including *every due date is last-chance on exactly one run*;
> simulation passes at 38/100/330.

## Board

| ID | Task | Plan tasks | Deps | State | Attempt | Latest artifact | Notes |
|----|------|-----------|------|-------|---------|-----------------|-------|
| T01 | PlainDate & ROC day math | P2-01 | — | done | 1 | work/T01-plaindate/validation-01.md | |
| T02 | Working-day calendar | P2-02 | T01 | validated | 2 | work/T02-calendar/validation-02.md | |
| T03 | Reachability last-chance test | P2-03, P2-03a | T02 | bugs-found | 1 | work/T03-last-chance/validation-01.md | 2 open: off-by-one on Tue |
| T04 | 28-day cap predicate | P2-04 | T01 | blocked | 0 | — | Q1 unanswered — rolling vs calendar month (clinic) |

## Log

Append-only. One line per state transition. Newest last.

- `2026-07-25 14:02` · **T01** · `todo → planned` · work/T01-plaindate/plan.md
- `2026-07-25 15:31` · **T01** · `planned → executed` · 4 files, 210 LOC
- `2026-07-25 16:05` · **T01** · `executed → validated` · 0 bugs
- `2026-07-25 16:12` · **T01** · `validated → done` · doc.md, feature.md updated
````

Rules:

- **Attempt** counts execute→validate round trips. It increments in `/fix-task-execution`, not in
  `/validate-task`. Three attempts on one task is a signal the task was scoped wrong or the plan is
  wrong — stop and say so rather than starting a fourth.
- **Status** in the header is recomputed on every write: `in progress — N/M done`, or
  `complete — exit gate closed`, or `blocked — N tasks`.
- Log entries record what changed, not what was attempted. Never delete a log line.

---

## Acceptance contract — `work/<task>/acceptance.md`

Written by the **global `/write-acceptance-criteria`** skill (Rent.com.au house format) from the
task file plus `plan.md`, including its `## Answered questions`. The harness then adds three things
that skill does not produce, and saves the result here.

**This file is the contract.** `/build-task` builds to it; `/validate-task` judges against it.

### 1. An evidence method per criterion

The column that makes the file worth writing — without it, validation quietly skips whatever is
awkward to check.

| Method | Use for |
|--------|---------|
| `unit` | Pure logic; name the test file |
| `property` | An invariant over generated inputs; state the invariant and the generator |
| `integration` | Miniflare — real Worker, real D1, local |
| `e2e` | The real entry point driven end to end against `tools/mocks/` |
| `manual` | A console, a purchase, a person. State the exact check and who does it |
| `inspection` | Last resort — reading the code. **More than a couple means the task is not testable as written**; send it back to `/design-task` |

Cover, deliberately, the four that get missed: **error paths** (dependency times out, 5xx,
malformed), **boundaries** (empty, one, exactly at the limit, one over, a past date, a leap year, a
Monday, a holiday), **concurrency** (two writers on a day, a stale `row_version`, a re-delivered
webhook), and **negative security** (unauthenticated → 403, bad signature → rejected, no patient
data in the log). State what must *not* happen where absence-of-effect is the real requirement:
"no row is written to `visits` when validation rejects."

### 2. `## Explicitly not required`

Named exclusions, so validation does not report an absence as a bug and scope creep has a boundary.

### 3. `## Needs a mock` and `## Manual checks`

Which service, and whether the mock exists yet — the first task needing a service pays for it, and
that cost belongs here rather than as a surprise inside validation. Manual criteria are restated as
a checklist with the exact thing to look at, since no agent can satisfy them.

### Rules

- **Frozen once agreed.** If validation fails against a criterion, that is the file working.
  Changing it to make a validation pass is laundering a defect — and it happens under exactly the
  deadline pressure §12 warns about. A change requires the user and goes in the log.
- **Never drop a task-file criterion silently.** Move it to *Explicitly not required* with a reason.
- **Never write a criterion you cannot say how to prove.** That is an aspiration, not a criterion.
- Ten sharp criteria beat forty vague ones. Length is not coverage.

---

## Model policy

| Skill | Runs as | Why |
|-------|---------|-----|
| `/run-plan` | inline (session model) | Sequences the rest; holds the phase and talks to the human |
| `/scope-tasks` | inline (session model) | Decomposition judgment; must hold the whole plan |
| `/design-task` | inline (session model) | Reads spec + existing code and decides design |
| `/write-acceptance-criteria` | inline (session model) | The global skill. Contract-writing, must not drift |
| `/build-task` | **`Agent` with `model: "sonnet"`** | Mechanical implementation against a written plan |
| `/validate-task` | **`Agent` with `model: "sonnet"`**, parallel | Independent adversarial verification |
| `/fix-task-execution` | **`Agent` with `model: "sonnet"`** | Bounded repair against a named bug |
| `/doc-feature` | inline (session model) | Small, and must not drift |

### Exactly three skills dispatch subagents

**`/build-task`, `/validate-task`, `/fix-task-execution`. No others. No exceptions.**

Every other skill in the harness runs **inline, in the session**, and does its own reading,
searching, writing and judging. `/run-plan`, `/scope-tasks`, `/design-task`, the acceptance-criteria
step and `/doc-feature` must not call the `Agent` tool — not to "speed up a search", not to
"parallelise the reading", not for a second opinion.

The reason is not economy. Those five steps are where judgment is exercised and where the human is
in the loop:

- **Scoping** decides what gets built. A bad decomposition is multiplied by every agent downstream.
- **Design** must **NEVER GUESS** — it has to notice ambiguity and *ask you*. A subagent cannot ask
  you; it resolves the ambiguity on its own and returns prose that reads like a decision.
- **Acceptance criteria** are the contract. Delegating the contract means nobody in the session
  ever held it.
- **`doc-feature`** must prune, which requires knowing what was actually built this session.

Delegating any of these launders a judgment call into a summary, and a summary is what the next
step then treats as fact.

**Validation agents must never be the agent that wrote the code.** Spawn fresh; give them
`acceptance.md`, the task file and the repo — **not** the execution narrative. An agent shown its
own reasoning validates the reasoning, not the code.

---

## Standing rules

These come from `docs/plans/ROADMAP.md` and apply to every task in every phase.

| Rule | |
|------|--|
| **The spec wins** | `docs/PLAN.md` outranks a plan file, which outranks a task file, which outranks a `plan.md`. Disagreement means the lower document is wrong — fix it, don't route around it |
| **Carry reasoning verbatim** | Where a plan explains *why* a design avoids a specific defect, copy that reasoning into the task file. Paraphrased, it reads as an arbitrary preference and gets optimized away |
| **No real third parties in validation** | Google Maps, LINE, and any external API are mocked. Cloudflare runs under Miniflare (`wrangler dev --local`). See `/validate-task` |
| **Never commit patient data** | `居家11506112.csv` and any derivative contains 身分證號, diagnoses and home addresses. It is never committed, never pasted into a file, never sent to an agent |
| **Six columns, never a seventh** | 姓名 · 出生日期 · 收案日期 · 核定迄日 · 地點 · 預訪日期. Any request to add 主診斷 / 照護階段 / 身分證號 is weighed against §9, not waved through |
| **`Date` is banned in `packages/scheduler`** | Lint failure, not a warning |
| **Every write through the Durable Object** | Reads may hit D1 directly. Writes may not |
| **Migrations are expand-only** | Two-release drops and renames. A migration touching `patients` drops and recreates `schedulable_patients` |

---

## Templates

### Task file — `tasks/T<NN>-<slug>.md`

```markdown
# T07 · Held–Karp exact TSP over ≤8 stops

**Phase** [`../../02-scheduler-core.md`](../../02-scheduler-core.md) · **Plan tasks** P2-07
**Spec** `docs/PLAN.md` §5.3 · **Depends on** T02, T06 · **State** `todo`

## Outcome

One sentence stating what is true when this is done.

## Scope

- **In:** …
- **Out:** … (name where it *is* done — a task that silently excludes something is a gap)

## Detail

The substance, carried from the plan file. Where the plan reasons about a defect, that reasoning
is copied verbatim, not summarized.

## Acceptance criteria

- [ ] Falsifiable. A criterion nobody can fail is not a criterion.

## Validation

How to prove it locally: commands, fixtures, which third parties need a mock, which property
tests must be green.

## Open questions

- Anything that would change the implementation. If one blocks, the task is `blocked`, not `todo`.
```

### Validation report — `work/<task>/validation-NN.md`

```markdown
# Validation 01 — T07 Held–Karp

**Verdict** BUGS FOUND (2 open, 1 minor) · **Date** 2026-07-25 · **Attempt** 1

## What was run

- Command, and its outcome.
- Mocks stood up, and what they returned.
- Acceptance criteria exercised, one line each: ✅ / ❌ / ⚠️ not exercised (why).

## Bugs

### B1 · HIGH · Asymmetric matrix indexed transposed

**Where** `packages/scheduler/src/route.ts:88`
**Reproduce** [exact steps or a failing test]
**Expected / actual**
**Why it matters** [consequence in the running system, not "it's wrong"]

## Not bugs but worth saying

- …

## Coverage gaps

- What this validation could **not** prove, and what it would take to prove it.
```

### Fix report — `work/<task>/fix-NN.md`

```markdown
# Fix 01 — T07 Held–Karp

**Against** validation-01.md · **Date** 2026-07-25

| Bug | Verdict | Fix |
|-----|---------|-----|
| B1 | fixed | `route.ts:88` — index order corrected; regression test added at `route.test.ts:142` |
| B2 | not a bug | [argument, with evidence] |
| B3 | deferred | [why, and where it is now tracked] |

## Changes

Files touched, and the reason for each.

## Re-validation

Handed back to `/validate-task` as attempt 2.
```
