---
name: run-plan
description: Run a whole WhereGo phase plan end to end — scope it into tasks, then drive every task through design → acceptance criteria → build → validate → fix → docs, one at a time. Pauses once per task, at design, to answer questions and agree the criteria; then runs to done without interruption. Trigger: /run-plan <plan file or phase number>
---

# run-plan

The entry point. Give it a phase plan and it delivers the phase, one task at a time.

This skill **sequences the other skills and enforces the gates between them**. It does not
re-implement any of them, and it never skips one to save time — every gate exists because it is a
place where a defect otherwise becomes invisible until Phase 7.

**Read `.claude/harness/CONVENTIONS.md` first.**

---

## Input

`/run-plan 00`, `/run-plan docs/plans/02-scheduler-core.md`, or `/run-plan` with no argument to
**resume** — pick the earliest phase whose `progress.md` is not `complete` and continue from the
first task that is not `done`, at whatever step it stopped at.

Resume is the normal case. A phase takes days; the session will not.

---

## The cycle

For each task, in board order:

```
┌─ THE ONE PAUSE ─────────────────────────────────────────────────────────────┐
│ /design-task <T>                  → plan.md                                 │
│    ↳ any ambiguity → ASK THE HUMAN, wait, record the answers. Never guess.  │
│ /write-acceptance-criteria        → acceptance.md   ← the contract          │
│    ↳ the global skill; task + plan.md as the story. You save and annotate.  │
│                                                                             │
│ Present the answered questions, the plan and the criteria TOGETHER.         │
│ One confirmation. This is the only interactive stop in a task.              │
└─────────────────────────────────────────────────────────────────────────────┘
        ↓ on confirmation, run straight through — no stops, no check-ins
/build-task <T>                   → code               (sonnet 5 agent)
/validate-task <T>                → validation-NN.md   (sonnet 5 agents)
   ↳ BUGS FOUND → /fix-task-execution <T> → /validate-task <T> → repeat, max 3 round trips
/doc-feature <T>                  → doc.md + feature.md, task → done
        ↓ report, then straight into the next task's design pause
```

Invoke each with the Skill tool. Each one updates `progress.md` itself; the orchestrator's own
state is that file and nothing else.

**One pause per task, at the front.** Everything the human decides is decided before any code is
written; everything after is machine work that reports rather than asks. The next task's design
pause is the next stop — and it is a real one, because `/design-task` cannot guess.

The only exceptions are the **halt conditions** at the bottom of this file. Those are not check-ins;
they are the run failing and needing a person.

---

## Steps

### 1. Scope, if it is not scoped

If `docs/plans/<slug>/progress.md` does not exist, invoke `/scope-tasks <plan>`.

Then **stop and show the board.** Task count, the order, anything starting `blocked`, anything you
merged or split. Ask for a go-ahead before the first task.

This is the one place worth interrupting for unconditionally: a scoping error gets multiplied by
every agent downstream, and it is nearly free to fix now.

If `progress.md` already exists, show the board as it stands, say which task you are resuming and
at which step, and continue without asking.

### 2. Design — and never guess

`/design-task <T>`.

That skill's hard rule is **NEVER GUESS**. If it surfaces questions, this skill is where they get
answered:

- Present them with `AskUserQuestion`, with your recommended answer first and labelled
  *(Recommended)*. Batch them — one round of four questions beats four rounds of one.
- **Do not proceed on any answer you did not receive.** Not on a default, not on "the spec probably
  means", not on what a neighbouring module does.
- Record every answer in `plan.md` under `## Answered questions`, with the date. It is now a
  decision of record, and the next task inherits it rather than re-asking.
- If an answer changes the task's scope, say so and re-run `/design-task` rather than patching the
  plan by hand.
- If a question needs the **clinic** rather than you — the seven in `ROADMAP.md`, or anything about
  NHI rules — the task goes `blocked`, and the run moves to the next unblocked task. Do not stall
  the whole phase on one absent answer.

### 3. Acceptance criteria

`/write-acceptance-criteria` — the **global** skill, Rent.com.au house format. Give it the task file
and `work/<T>/plan.md` as the story, including the `## Answered questions`.

**Only after every question is cleared.** Criteria written against an ambiguous plan encode the
ambiguity and then validate it as correct.

Save its output to `work/<T>/acceptance.md` and annotate it per the **Acceptance contract** section
of `CONVENTIONS.md`: an evidence method per criterion (`unit` / `property` / `integration` / `e2e` /
`manual` / `inspection`), the mocks needed, and an *Explicitly not required* list. Un-annotated
criteria are the ones validation quietly skips.

**Then stop — this is the one pause in the task.** Present, in a single message:

1. the questions from step 2 and the answers given;
2. what the plan decided where it had a real choice, and what lost;
3. the criteria themselves, and specifically anything that surprised you — a task criterion you had
   to re-read, an exclusion you added, a criterion you could only prove by substitute.

This is the contract — `build-task` builds to it and `validate-task` judges against it — so it is
the last cheap moment to hear "that is not what I meant", and **the last stop before the task is
`done`.** Everything after this runs without asking, so anything you were going to raise later
belongs here.

On confirmation: set `Status: agreed`, state `planned → criteria-set`, and go to step 4 **in the
same turn.** Do not report the state change and wait.

### Steps 4–7 run uninterrupted

**Once the criteria are agreed, steps 4 through 7 are one continuous run.** Do not stop between
them, do not ask how to proceed, do not report a state change and wait for acknowledgement. The
human has already decided everything that is theirs to decide. Narrate as you go if it is useful,
but keep going.

The only things that stop this run are the **halt conditions** below. They are failures, not
check-ins.

### 4. Build

`/build-task <T>`.

If the agent stops because the plan was wrong, **go back to step 2** — revise the plan, re-issue the
criteria if they changed, then build again. Do not dispatch a second agent with a patched brief; a
plan gap that gets papered over in a brief is invisible to everything downstream. Returning to
step 2 means returning to the pause: a revised plan gets re-confirmed.

### 5. Validate, and fix, and validate

`/validate-task <T>`.

- **PASS** / **PASS WITH NOTES** → step 6, immediately.
- **BUGS FOUND** → `/fix-task-execution <T>`, which re-invokes `/validate-task` itself. Let it.
  **Do not ask whether to fix the bugs.** Fixing them is the run, not a decision.
- **CANNOT VALIDATE** → the task is not testable as written. Back to step 2, not to a fix agent.

**Stop at three round trips.** A fourth means the defect is in the plan or the task, and another
agent cannot see that. Report what keeps recurring and hand it to the user.

### 6. Document

`/doc-feature <T>`. Task goes `done`.

### 7. Report, then start the next task

**Do not ask permission to continue.** Report what changed and what was proven — not steps
completed — then invoke `/design-task` for the next task in board order in the same turn.

> **T03 done.** 4 files, 2 bugs found and fixed, 18 tests green; the Tuesday off-by-one reproduced
> and fixed. Next: **T04 · 28-day cap predicate**.

The next task's design pause is the next stop, and it arrives on its own — `/design-task` cannot
guess, so it will surface its questions and wait there.

**Context.** A long run fills the context window, and a run that dies mid-task loses the thread
though nothing permanent. `/compact` is a command **the user types**; you cannot run it. So do not
stop to offer it — instead, when context is getting long, say so in the step-7 report and note that
`/compact` now is cheap and `/run-plan` with no argument resumes exactly here. Then carry on. The
user interrupts if they want to take it.

### 8. End of phase

When every task is `done`, `dropped` or `blocked`:

- Check the exit gate quoted at the top of `progress.md` against what actually exists. **Say plainly
  whether it is closed.** An exit gate is not closed because the tasks ran out — that is the exact
  failure the gates exist to catch.
- List anything still `blocked` and the answer each is waiting on.
- Set the header status, and name the next phase.

---

## Halt conditions

**These are the only things that stop a run**, other than the design pause itself. Each is a failure
that needs a person — none of them is a check-in. Do not work around any of them:

| | |
|---|---|
| A question needs the clinic | Task → `blocked`, continue with the next unblocked task; halt only if all remaining tasks are blocked |
| Three failed validate↔fix round trips | The plan or the task is wrong |
| Two consecutive tasks stop on plan defects | Scoping is wrong — re-scope, do not keep designing |
| A task needs a purchase, a console click, or a person | It cannot be agent-executed; hand it over with the task file's `## Manual checklist` |
| Validation cannot stand up the local environment | Fix the environment before continuing; a skipped validation is worse than a failed one |
| The user did not answer the design pause | Wait. This is the one pause; nothing proceeds without it |

Note what is **not** on this list: bugs found in validation, a fix round trip, a long-running agent,
a lot of output, or the end of a task. Those are the run working.

---

## Rules

- **This skill never dispatches a subagent.** It runs inline and invokes the other skills; only
  `/build-task`, `/validate-task` and `/fix-task-execution` call the `Agent` tool, and they do it
  themselves. If a step here feels slow, that is the human-in-the-loop working, not a bottleneck to
  parallelise.
- **One task at a time, in board order.** No parallel tasks, no starting the next while the current
  is not `done`. Dependencies are real and validation cannot attribute findings across two tasks'
  changes.
- **Never skip a step to save time.** Not the criteria, not the validation, not the docs. If a task
  looks too small to need the full cycle, the cycle costs minutes on a small task.
- **Never mark a state a skill did not set.** The orchestrator sequences; the skills own their
  transitions.
- **Never commit, push or deploy.** Not at the design pause, not at the end of a task, not at the
  end of the phase.
- **Ask once per task, at the design pause, and batch everything into it.** A second interruption
  during build, validation or docs means something that should have been settled up front was not.
  The exception is a halt condition, which is a failure rather than a question.
- Report in terms of what changed and what was proven, not in terms of steps completed. "18 tests
  green, the Tuesday off-by-one reproduced and fixed" is a status; "step 5 complete" is not.
