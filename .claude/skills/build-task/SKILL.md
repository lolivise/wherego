---
name: build-task
description: Implement one WhereGo harness task by dispatching a Sonnet 5 agent against work/<task>/plan.md, then record the result in execution.md and progress.md. Use after /design-task. Trigger: /build-task <task id>
---

# build-task

Implement one planned task. The implementation is done by a **Sonnet 5 agent** working from
`work/<task>/plan.md`; this skill prepares its brief, dispatches it, and records what came back.

**Read `.claude/harness/CONVENTIONS.md` first.**

> Part of the WhereGo delivery harness. Distinct from the global `/execute-task`, which runs the
> Linear/branch flow.

---

## Input

`/build-task T07`, or no argument to resume the first task in state `planned`.

**Refuse to run if the task is not `planned`.** `todo` means run `/design-task` first. Anything past
`executed` means the work exists — re-running would overwrite it. Say which and stop.

---

## Steps

### 1. Pre-flight

- Read `progress.md`, the task file, and `work/<task>/plan.md` in full.
- Confirm every dependency in the task's `Depends on` is `validated` or `done`. If one is
  `bugs-found`, stop: building on unvalidated code is how one bug becomes three tasks' worth of
  rework.
- Confirm the working tree is clean, or that the only changes are this task's. Dispatching an agent
  into a dirty tree makes the diff unreadable and validation unreliable.
- If `plan.md` has open questions or unresolved choices, **do not dispatch.** Go back to
  `/design-task`.

### 2. Dispatch the implementation agent

One `Agent` call, `model: "sonnet"`, `subagent_type: "general-purpose"`, run synchronously
(`run_in_background: false`) — the rest of this skill needs its result.

The brief:

```
Implement one task in the WhereGo repository. Work only from the documents named below.

Read first, in this order:
1. .claude/harness/CONVENTIONS.md          — standing rules you must not violate
2. docs/plans/<slug>/work/T<NN>-<slug>/acceptance.md — THE CONTRACT. Build to this.
3. docs/plans/<slug>/tasks/T<NN>-<slug>.md — the task: outcome and scope
4. docs/plans/<slug>/work/T<NN>-<slug>/plan.md — the implementation plan. Implement THIS.
5. docs/PLAN.md, sections <the ones the task cites> — the specification, authoritative

Then implement the plan's Changes table in order.

Hard rules:
- Implement the plan. If the plan is wrong or incomplete, STOP and report what is wrong.
  Do not improvise a different design — a plan gap is a planning defect, and silently
  filling it hides it.
- Stay inside the task's scope. Anything the task lists as out of scope stays unwritten,
  even if it is a two-line change.
- No rule may have a second implementation. Before writing logic that enforces a
  scheduling rule, search the repo for an existing implementation and call it.
- `Date` is banned inside packages/scheduler — use PlainDate integer day arithmetic.
- Every D1 write goes through the PlanCoordinator Durable Object. Reads may be direct.
- Migrations are expand-only. A migration touching `patients` must drop and recreate
  the `schedulable_patients` view.
- Never commit patient data, never create a fixture from the real CSV, never write real
  addresses or 身分證號 into any file.
- Never edit acceptance.md. It is frozen. If a criterion cannot be met, STOP and say which
  and why — do not adjust the contract to match what you built.
- Never touch docs/PLAN.md or the phase plans docs/plans/NN-*.md. Those are specification.
- Never commit, never push, never deploy.

Write the tests named in the plan's Tests section as part of the implementation, not after.

Before finishing, run the repo's own checks — typecheck, lint, unit tests — and make them
pass. If you cannot make one pass, leave it failing and report it precisely; do not delete
or skip the test, and do not weaken an assertion to make it green.

Return, as your final output:
- Files created and modified, with a one-line reason for each
- Each criterion in acceptance.md, marked met / not met / not verifiable here, with the
  evidence. A criterion whose evidence method is `manual` is "not verifiable here" — say so
  rather than claiming it
- Commands you ran and their outcomes, verbatim for anything that failed
- Anything you had to decide that the plan did not specify — this list is the most
  important thing you return
- Anything you could not do, and why
```

Substitute the real paths and spec sections. Do not paste file contents into the brief — the agent
can read the repo, and pasted context goes stale.

**Large tasks:** if the plan's `Changes` table has independent groups (say, a package and an
unrelated migration), dispatch one agent per group in parallel and only if they touch disjoint
files. If they share files, run serially — parallel agents on the same file produce a merge you did
not plan.

### 3. Check what came back

Do not accept the agent's summary at face value. Independently:

- `git status` / `git diff --stat` — do the files match the plan's `Changes` table? Extra files are
  scope creep; missing files are incomplete work.
- Run the repo's checks yourself. An agent reporting green while a test fails is common enough to
  be worth thirty seconds.
- Read the diff for the standing rules: a `new Date()` in the scheduler, a direct D1 write, a
  duplicated rule implementation, a weakened assertion, a `.skip` on a test.
- Read the agent's "had to decide" list carefully. **Every item on it is a planning defect.** If any
  changed the design, fold it back into `plan.md` so the next revision starts from the truth.

If the agent stopped because the plan was wrong: do **not** dispatch a second agent with a patched
brief. Return to `/design-task`, revise the plan, and re-execute.

### 4. Write `work/<task>/execution.md`

Append-only — attempt 2 goes below attempt 1, it does not replace it.

```markdown
## Attempt 1 — 2026-07-25

**Agent** sonnet · **Outcome** complete / partial / stopped

### Changed
| File | Change |
|------|--------|

### Checks
| Command | Result |
|---------|--------|

### Decided beyond the plan
- … (each of these is a planning defect; folded back into plan.md: yes/no)

### Not done
- … and why
```

### 5. Update `progress.md`

State `planned → executed`. Log line with the file count and the checks' outcome.

Then say: **validation has not run.** Executed is not working. Point at `/validate-task`.

---

## Rules

- **Never commit, never push, never deploy.** The harness produces reviewable changes; releasing
  them is a human decision.
- Never mark a task `validated` from this skill, however green the checks are. The agent that wrote
  the code is not the agent that may judge it.
- Never let an agent weaken a test to pass. A deleted assertion is a defect that has been hidden,
  which is worse than one that is visible.
- If two consecutive attempts stop on plan defects, stop dispatching and escalate — the task is
  scoped wrong, and a third agent will not discover that.
