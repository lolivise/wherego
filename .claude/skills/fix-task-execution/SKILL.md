---
name: fix-task-execution
description: Fix bugs reported by /validate-task using Sonnet 5 agents, record the fix, and hand the task straight back to /validate-task. Use when a task is in state bugs-found. Trigger: /fix-task-execution <task id>
---

# fix-task-execution

Repair the bugs a validation run found, then return the task to validation. Bounded work: fix the
named bugs, nothing else.

**Read `.claude/harness/CONVENTIONS.md` first.**

---

## Input

`/fix-task-execution T07`, or no argument to resume the first task in state `bugs-found`.

Refuse unless the state is `bugs-found`. A task in `validated` has nothing to fix; a task in
`blocked` needs an answer, not an agent.

---

## Steps

### 1. Read the report and decide what is actually being fixed

Read the **latest** `validation-NN.md` and every earlier one for this task.

For each open bug, decide before dispatching anything:

| Verdict | When | What happens |
|---------|------|--------------|
| **fix** | It is real and in scope | Goes into the agent brief |
| **not a bug** | The behaviour is correct and the spec says so | Written up with the argument and the spec citation. Never dismissed silently — the next validation will re-report it, and the written rejection is what stops that |
| **plan defect** | The code matches `plan.md`; the plan was wrong | **Do not send this to a fix agent.** Back to `/design-task`, revise, re-execute. Patching around a wrong plan leaves two documents disagreeing, and the plan is the one the next task reads |
| **task defect** | The bug reveals the task was scoped wrong | Escalate to the human. Do not silently re-scope |
| **defer** | Real, LOW, and genuinely out of scope | Only with somewhere it is now tracked. A deferral with no destination is a bug you have agreed to forget |

State this triage out loud before dispatching. It is the decision that matters; the agent that
follows is the easy part.

### 2. Dispatch fix agents

`Agent`, `model: "sonnet"`, `subagent_type: "general-purpose"`, synchronous.

**One agent per independent bug**, in parallel, when the bugs touch disjoint files. **One agent for
the whole set** when they share files or share a root cause — parallel agents editing one file
produce a merge nobody planned, and two agents fixing one root cause fix it twice, differently.

Brief:

```
Fix specific, already-diagnosed bugs in the WhereGo repository. You are not reviewing the
code and you are not improving it.

Read:
- .claude/harness/CONVENTIONS.md               — standing rules you must not violate
- docs/plans/<slug>/work/T<NN>-<slug>/acceptance.md — the contract. Frozen; never edit it
- docs/plans/<slug>/tasks/T<NN>-<slug>.md      — the task: outcome and scope
- docs/plans/<slug>/work/T<NN>-<slug>/plan.md  — the intended implementation
- docs/plans/<slug>/work/T<NN>-<slug>/validation-NN.md — the bug report

Fix exactly these bugs: <IDs, verbatim titles>.

Rules:
- Fix the root cause, not the symptom. If the reproduction passes because you special-cased
  its inputs, you have hidden the bug.
- Do not change anything the listed bugs do not require. No refactors, no renames, no
  drive-by improvements. An unrelated change in this diff makes the re-validation unable
  to attribute what it finds.
- Add a regression test for every bug fixed, one that FAILS against the current code.
  Verify it fails first, then fix, then verify it passes. State both outcomes.
- Never weaken, skip or delete an existing test to make something pass.
- Standing rules still apply: no `Date` in packages/scheduler, every D1 write through the
  Durable Object, no second implementation of any rule, migrations expand-only, no patient
  data in any file, six columns never a seventh.
- Never reach a real external host. Mocks are at tools/mocks/.
- Never touch docs/PLAN.md or docs/plans/*.md. Never commit, push or deploy.

If a bug cannot be fixed without a design change, STOP and explain what change is needed.
Do not make the design change.

Return per bug: fixed / not fixed / not a bug (with the argument); the files changed and
why; the regression test and its file:line; the fail-then-pass evidence.
```

### 3. Verify before believing

- `git diff` — is the change confined to what the bugs required? Scope creep here is what makes the
  next validation ambiguous.
- Run the repo's checks yourself.
- Re-run each bug's reproduction steps from the validation report. **Yourself.** The agent claiming
  a fix is not evidence that the reproduction now passes.
- Check that each regression test actually fails against the old code — `git stash` the fix and run
  it. A regression test that passes both ways tests nothing and will not catch the reintroduction.

### 4. Write `work/<task>/fix-NN.md`

Template in `CONVENTIONS.md`. Include the rejected bugs with their arguments — that section is what
prevents the same objection cycling forever.

Append to `execution.md` as the next attempt.

### 5. Hand back to validation

Increment **Attempt** on the board. State `bugs-found → fixing`, then immediately invoke
`/validate-task <task>` — **the fix is not finished until validation says so.** Do not stop here
and report success; a fix that has not been re-validated is a claim.

If this reaches **attempt 4**, do not dispatch. Stop and escalate with: the bugs that keep
recurring, what each fix tried, and your reading of why it is not converging. Three failed round
trips means the defect is in the plan or the task, and a fourth agent cannot see that.

---

## Rules

- **Only fix what the validation report names.** A bug you noticed while reading goes into the next
  validation report, not into this diff.
- **Never edit the validation report** to mark bugs resolved. It is the record of what was found;
  `fix-NN.md` is the record of what was done. Overwriting the first destroys the history that makes
  a recurring defect visible.
- Never mark a task `validated` from this skill. Only `/validate-task` may.
- A "not a bug" verdict needs a spec citation or a reproduction that fails to reproduce. An opinion
  is not a rebuttal.
