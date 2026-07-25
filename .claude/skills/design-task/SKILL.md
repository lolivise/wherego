---
name: design-task
description: Plan the implementation of a single WhereGo harness task — reads progress.md, the task file, the spec and the existing code, then writes work/<task>/plan.md. Use before executing any task. Trigger: /design-task <task id>
---

# design-task

Produce the implementation plan for **one** task: what to write, where, in what order, and how it
will be proven. `/build-task` implements this file and nothing else, so a gap here becomes a
guess there.

**Read `.claude/harness/CONVENTIONS.md` first.**

> Part of the WhereGo delivery harness. Distinct from the global `/plan-task`, which fetches Linear
> issues via MCP — WhereGo tasks come from `docs/plans/`, not from Linear.

---

## Input

`/design-task T07`, or `/design-task` with no argument.

**With no argument, resume.** Read every `docs/plans/*/progress.md`, find the earliest phase not
`complete`, and inside it the first task not `done`. State which task you picked and why, then
proceed. If that task is past `planned`, say so and ask rather than replanning over work.

---

## Steps

### 1. Load the context, in this order

1. **`progress.md`** for the phase — the board, the log, and specifically what happened to the tasks
   this one depends on. A dependency that came out of validation with a deferred bug changes this
   plan.
2. **The task file** `tasks/T<NN>-*.md` — completely.
3. **The phase plan** section the task derives from, and **`docs/PLAN.md`** at every section the
   task cites. The task file compresses; the spec is authoritative.
4. **The existing code.** Search the repo for what already exists in this area. This is the step
   most worth doing properly:
   - Does a function that does this already exist under a different name?
   - What do the neighbouring modules look like — naming, error handling, test layout, whether
     things are exported through an index?
   - Which existing tests will this change break?
   - Is there a migration already touching these tables?
   
   In a greenfield repo this step returns nothing and that is a finding: **say so**, because it
   means this task sets the conventions everything after it copies.
5. **Prior artifacts for this task**, if any — `work/<task>/plan.md`, `execution.md`, and every
   `validation-*.md`. Replanning after a failed validation without reading why it failed produces
   the same failure.

### 2. NEVER GUESS — ask

**This is the hard rule of this skill.** If anything about the task is ambiguous, **stop and ask the
user.** Do not pick the likely reading. Do not infer from a neighbouring module. Do not write "assume
X" into the plan and carry on.

A guess here is uniquely expensive: it becomes `plan.md`, which becomes `acceptance.md`, which is
what validation certifies as correct. Three agents then agree the wrong thing works, and it is
discovered when a patient is on the wrong day.

Ask when:

- the spec and the task file can be read two ways, or one is silent;
- a value is unspecified — a threshold, a limit, a timeout, a default, a sort order;
- a name, a shape or a location has no precedent in the repo and will be copied by everything after
  it (in a greenfield repo this is most of them — **ask, and ask early**);
- an error path is not defined: what happens when the dependency fails, the row is missing, the
  input is empty;
- an answered question from another task appears to contradict this one;
- you are about to write the words *assume*, *presumably*, *for now*, or *TODO*.

**Search first — the codebase answers the question if it can.** A question the repo, `PLAN.md` or a
prior `plan.md` already answers is not a question, and asking it wastes the user's attention on the
ones that matter.

How to ask:

- Use `AskUserQuestion`. **Batch them** — one round of four beats four rounds of one.
- Give your **recommended answer first**, labelled *(Recommended)*, with the reasoning. You have read
  the spec; a bare question with no recommendation makes the user do your work.
- Say what each option would change, concretely.
- If it is a question for the **clinic** rather than the user — the seven in `ROADMAP.md`, anything
  about NHI rules or 個資法 — do not ask the user to guess on the clinic's behalf. Mark the task
  `blocked`, name the question and who owns it, and stop.

Then record every answer in `plan.md` under `## Answered questions` with the date. It is now a
decision of record: the next task inherits it, `/write-acceptance-criteria` turns it into a
criterion, and nobody re-litigates it.

**Do not proceed to step 3 with an open question.** A plan with an unanswered question in it is not
a plan.

### 3. Decide the design

Where the task leaves a *choice* open — two defensible designs, both correct — **make it and record
why, naming the alternative and why it lost.** That is judgment, and it is yours. Ambiguity about
what is *required* is not a choice; that is step 2.

Check against the spec before committing to anything:

- Does a rule (R1–R16) constrain this? Quote it.
- Is this logic already implemented somewhere? **No rule may have a second implementation** — the
  28-day cap is one `respectsCap`, the last-chance test is one function, ROC formatting is one
  `formatRoc()` pair. A duplicate is a defect the moment the two copies diverge.
- Does it write to D1? Then it goes through `PlanCoordinator`.
- Does it touch dates inside `packages/scheduler`? Then `Date` is banned; use `PlainDate` integer
  day arithmetic.
- Does it add a migration? Expand-only, and a migration touching `patients` drops and recreates
  `schedulable_patients`.
- Does it touch patient data? Six columns, never a seventh.

### 4. Write `work/T<NN>-<slug>/plan.md`

```markdown
# Implementation plan — T07 Held–Karp exact TSP

**Task** [`../../tasks/T07-held-karp.md`](../../tasks/T07-held-karp.md) · **Spec** §5.3
**Written** 2026-07-25 · **Revision** 1

## What exists now

What is already in the repo that this touches, with file:line references. "Nothing — this is the
first module in `packages/scheduler`" is a valid and important answer.

## Approach

The design, and the reasoning for each decision that had an alternative. Name the alternative and
why it lost.

## Changes

| # | File | Change | Why |
|---|------|--------|-----|
| 1 | `packages/scheduler/src/route.ts` | new — `solveTour(matrix, origin, dest)` | … |
| 2 | `packages/scheduler/src/route.test.ts` | new — unit + property tests | … |

Ordered so the repo is coherent after each step, not only at the end.

## Interfaces

Exact signatures, types, SQL, and schema changes. Copy from the spec where the spec gives them —
never retype a schema.

## Tests

Which test proves which acceptance criterion. Every criterion in the task file maps to at least
one, or you state why it can only be proven by `/validate-task`.

## Risks

What is most likely to be wrong, and what would catch it. Each of these becomes a criterion in
`acceptance.md`, or it was not a real risk.

## Answered questions

Every ambiguity from step 2, the answer, and the date. Decisions of record — the next task
inherits these rather than re-asking.

- **2026-07-25 · Does an out-of-window override shift the cycle anchor?** No — `anchor_mode`
  stays `visit`; the cascade is displayed but the anchor is unchanged. (user)

## Out of scope

Named, with where it is actually done.
```

If a previous `plan.md` exists, move it to `plan-v<N>.md` and increment `Revision`. Never lose a
plan — the diff between revisions is why validation failed.

### 5. Review it before handing it over

Read your own plan against the task's acceptance criteria and ask: **could an agent that has never
seen this conversation implement this without guessing?** Every guess it would have to make is a
gap you should close now — go back to step 2 and ask. That agent will be a Sonnet 5 agent with the
repo and this file, nothing else, and it has been told to stop rather than improvise.

### 6. Update `progress.md`, then hand to acceptance criteria

State `todo → planned`. Log line with the path to `plan.md` and the number of questions answered.
If planning surfaced a blocker, state `blocked` instead, with the question and its owner in `Notes`.

**Next step is `/write-acceptance-criteria`, not `/build-task`.** Say so. Nothing gets built until
the contract exists at `work/<task>/acceptance.md`.

---

## Rules

- **NEVER GUESS.** Ask. An unanswered question is a `blocked` task, not an assumption written in
  smaller type. This rule outranks finishing the task.
- **Never dispatch a subagent.** This skill runs inline. Only `/build-task`, `/validate-task` and
  `/fix-task-execution` use the `Agent` tool. A subagent sent to explore the codebase cannot ask you
  a question — it resolves the ambiguity itself and hands back prose that reads like a decision,
  which is precisely the failure the rule above exists to prevent.
- **Do not write implementation code.** Signatures and schemas in `plan.md` are specification, not
  a partial implementation. Writing code here means it never gets validated as executed work.
- **Do not expand scope.** Something the task excludes stays excluded; note it and move on.
- If the task cannot be implemented as written — a dependency does not exist, the spec contradicts
  it, an open question genuinely blocks it — **stop and say so.** Mark it `blocked`. Producing a
  confident plan for an impossible task is the most expensive failure mode in this harness.
- One task per invocation. Planning two tasks together produces a plan that only works if both are
  executed together, which the harness will not do.
