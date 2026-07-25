---
name: scope-tasks
description: Break a WhereGo phase plan into independently executable, independently validatable task files. Creates the plan folder, tasks/ and progress.md. Use when starting a new phase from docs/plans/, or when a phase's tasks need re-scoping. Trigger: /scope-tasks <plan file or phase number>
---

# scope-tasks

Turn one phase plan into a set of task files a harness can execute one at a time, plus the
`progress.md` that makes the phase resumable.

**Read `.claude/harness/CONVENTIONS.md` first.** It defines paths, the task-file template, the state
machine and `progress.md`. This skill does not restate them.

---

## Input

A phase plan: `/scope-tasks 02`, `/scope-tasks docs/plans/02-scheduler-core.md`, or
`/scope-tasks scheduler`. Resolve loosely against `docs/plans/*.md`; if it matches more than one,
ask which.

If the plan folder already exists with a `progress.md`, **do not overwrite it.** Report the current
board and ask whether to add tasks, re-scope specific ones, or leave it alone. Re-scoping a task
that is past `todo` throws away work.

---

## Steps

### 1. Read the whole plan, and its context

- The phase plan file, **completely** — not skimmed for headings.
- `docs/plans/ROADMAP.md` for the phase's dependencies, exit gate and standing gates.
- Every `docs/PLAN.md` section the plan cites in its `**Spec**` line. The plan file compresses; the
  spec has the detail a task file needs.
- The prerequisite phases' `progress.md`, if they exist. A prerequisite not `complete` is worth
  saying out loud before scoping work that assumes it.

### 2. Decompose

The phase plans already carry numbered tasks (`P2-01`…`P2-14`). **Those are the raw material, not
the answer.** They were written to explain a phase to a human reader; a harness task has a different
job — it must be executable in one sitting and validatable on its own.

Map plan tasks to harness tasks:

- **1 → 1** is the common case and the default.
- **Merge** when a plan task cannot be validated without another. `P2-03` (last-chance test) and
  `P2-03a` (its mandatory property test) are one task: the test *is* the acceptance criterion.
- **Split** when a plan task carries more than one falsifiable outcome, touches more than two
  subsystems, or would take more than a day. `P0-13` (the whole `deploy.yml`) splits along its
  natural seam — build-and-upload versus secrets-and-smoke-test.
- **Never invent work the plan does not call for.** If you think something is missing, say so in
  your report and let the human decide. A task with no line in the plan has no acceptance criteria
  anyone agreed to.

Sizing check, applied to every candidate task:

| Question | If no |
|----------|-------|
| Can it be validated on its own, without a later task? | Merge it forward |
| Does it have a single falsifiable outcome? | Split it |
| Is it one sitting of work? | Split it |
| Would failing it be visible? | Its acceptance criteria are too weak — rewrite them |

Then **order** them: dependencies first, then the tasks that unblock the most others. Within a
phase, put the task whose failure would invalidate the most downstream work first — in Phase 2 that
is the day-arithmetic primitives, in Phase 0 the domain registration.

### 3. Write the files

Create `docs/plans/<slug>/`, `docs/plans/<slug>/tasks/` and `docs/plans/<slug>/work/`.

One file per task, using the template in `CONVENTIONS.md`. On content:

- **Carry the plan's reasoning verbatim** wherever it explains why a design avoids a specific
  defect — the Mon/Tue last-chance weekday table, the D1-has-no-interactive-transactions argument,
  the auto-completion-fabricates-完成 argument, the partial-index rationale. Summarized, these read
  as arbitrary preferences and get optimized away by whoever implements the task.
- Copy code blocks, SQL, formulae and tables **exactly**. Never retype a schema or a cost function.
- Cite the spec section, so the executor can go deeper without guessing where.
- Acceptance criteria must be falsifiable and, where the plan gives one, taken from the plan's own
  acceptance list rather than reinvented.
- The `Validation` section states how to prove it locally: the command, the fixture, which third
  party needs a mock. `/validate-task` reads this section first.
- Carry the plan's open questions down to the tasks they actually block, and mark those tasks
  `blocked` rather than `todo`.

### 4. Write `progress.md`

Board seeded with every task at `todo` (or `blocked`), the phase's exit gate quoted verbatim from
the plan file, and one log line recording the scoping.

### 5. Report

- Task count, and where you merged or split, with the reason.
- Any task starting `blocked`, and the question that blocks it.
- Anything in the plan you could not turn into a task — the honest gap, not a silent omission.
- The first task to run.

---

## Rules

- **Do not write code.** This skill produces markdown only.
- **Never dispatch a subagent.** This skill runs inline. Only `/build-task`, `/validate-task` and
  `/fix-task-execution` use the `Agent` tool. Decomposition is the judgment every downstream agent
  inherits; it has to be made by whoever is holding the whole plan.
- **Do not modify the phase plan or `docs/PLAN.md`.** If the plan is wrong, report it; changing the
  spec is a human decision.
- Task IDs are sequential within a phase from `T01`, never reused, never renumbered.
- A task that mentions patient data names the constraint: the sample CSV is never committed and
  never pasted into a file or an agent prompt.
- If the phase plan is one you cannot decompose confidently — the reasoning is thin, or the
  acceptance criteria are unfalsifiable — say that instead of producing plausible-looking tasks.
  Bad tasks are more expensive than no tasks, because the harness will execute them.
