# WhereGo

Home-visit scheduling and routing for a clinic in 高雄市大寮區. Cloudflare Worker + D1 + one
Durable Object. Interface language is 繁體中文 throughout.

## Documents, in order of authority

| | |
|---|---|
| `docs/PLAN.md` | **The specification.** Outranks everything below it |
| `docs/plans/ROADMAP.md` | Execution order — 8 phases, the standing gates, the open questions |
| `docs/plans/NN-*.md` | One execution-ready plan per phase |
| `docs/plans/NN-*/` | Harness state for that phase: `progress.md`, `tasks/`, `work/` |
| `doc.md` · `feature.md` | What exists **today**. Never what is planned |

Where two disagree, the higher one wins and the lower one is wrong — fix it rather than working
around it.

## Delivery harness

```
/run-plan 00
```

That is the whole interface. It scopes the phase into tasks and drives each one through the cycle
below. **It asks you exactly once per task**, up front, and then runs to `done` without
interrupting. **`.claude/harness/CONVENTIONS.md` is the contract** every skill shares — paths, the
state machine, `progress.md`, the standing rules.

```
/run-plan <phase>           ← entry point; orchestrates everything below
  /scope-tasks <phase>        plan → plan folder + tasks/ + progress.md
  /design-task <task>         task + existing code → work/<task>/plan.md
                              NEVER GUESSES — asks you, waits, records the answer
  /write-acceptance-criteria  → work/<task>/acceptance.md    ← the contract (global skill)
  ─── THE ONE PAUSE ─── answers + plan + criteria, together, one confirmation ───
  /build-task <task>          plan + ACs → code                     (sonnet 5 agent)
  /validate-task <task>       code → validation-NN.md               (sonnet 5 agents, local e2e, mocked APIs)
  /fix-task-execution <task>  bugs → fix-NN.md → back to validate    (sonnet 5 agents, max 3 round trips)
  /doc-feature [task]         validated code → doc.md + feature.md, task → done
                              report, then straight into the next task's design
```

Everything you decide, you decide before any code is written. After that confirmation the task
builds, validates, fixes its own bugs and documents itself without asking. Bugs found in validation
are not a reason to stop — fixing them is the run. The only other interruptions are `/run-plan`'s
halt conditions, and each of those is a failure rather than a question.

Each step is callable on its own for repair and re-runs.

**To resume after any interruption:** `/run-plan` with no argument. It picks up the earliest phase
not `complete`, at whatever step its first unfinished task stopped at. `progress.md` is the only
source of truth for where the build is.

## Standing rules

Full list in `.claude/harness/CONVENTIONS.md`. The ones worth knowing before touching anything:

- **Six columns, never a seventh** — 姓名 · 出生日期 · 收案日期 · 核定迄日 · 地點 · 預訪日期. This is
  a scheduling app; it does not hold diagnoses, 身分證號 or health data.
- **Never commit patient data.** The sample CSV is never committed, never made into a fixture,
  never pasted into an agent prompt. Validation fixtures are synthetic.
- **`Date` is banned in `packages/scheduler`** — `PlainDate` integer day arithmetic, CI failure.
- **Every D1 write goes through the `PlanCoordinator` Durable Object.** Reads may be direct.
- **No rule has a second implementation.** One `respectsCap`, one last-chance test, one
  `formatRoc()` pair.
- **Migrations are expand-only.** One touching `patients` drops and recreates
  `schedulable_patients`.
- **No validation reaches a real third party.** Google and LINE are mocked at `tools/mocks/`;
  Cloudflare runs under Miniflare.
- **Never commit, push or deploy without being asked.**
