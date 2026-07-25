---
name: doc-feature
description: Maintain doc.md (purpose + file structure) and feature.md (what the project can actually do) so they reflect only what exists in the repo right now. Run after every validated task; closes the task to done. Trigger: /doc-feature [task id]
---

# doc-feature

Keep two files honest:

- **`doc.md`** — what this project is for, and its file structure with a one-line description of
  every file.
- **`feature.md`** — every feature the project actually has.

**Read `.claude/harness/CONVENTIONS.md` first.**

The single rule both files live under: **they describe what exists, not what is planned.** A
roadmap already exists at `docs/plans/ROADMAP.md` and a specification at `docs/PLAN.md`. If these
two files also carry intentions, nobody can tell the built from the intended by reading them, and
they stop being worth reading. Documentation that overstates the system is worse than none, because
it is trusted.

---

## Input

`/doc-feature T07` — run after that task's validation passed; closes it to `done`.

`/doc-feature` with no argument — full reconciliation sweep against the whole repo. Run this after
a phase exit gate, or whenever the files feel stale.

Refuse to close a task that is not `validated`. Documenting unvalidated work puts a claim in
`feature.md` that nothing has proven.

---

## Steps

### 1. Establish what is actually there

Never update from the task description alone — that is the intent, and the intent is what drifts.

- `git diff` for the task (or the whole tree, for a sweep) — the files that actually changed.
- Read the new and modified files enough to describe what each **does**, not what it is named.
- Check for **deletions and renames.** A stale entry pointing at a file that no longer exists is
  the failure mode these files die of.
- Read the current `doc.md` and `feature.md` if they exist.

### 2. Update `doc.md`

```markdown
# WhereGo

[2–4 sentences: what the system does and who for. Home-visit scheduling and routing for a
clinic in 高雄市大寮區 — the 56-day prescription cycle, the 8-patients-a-day cap, the routing.
This section changes almost never.]

## Stack

[One line each: runtime, storage, deployment. Only what is actually wired up.]

## Structure

  packages/
    domain/            Shared types, zod schemas, PlainDate & ROC date arithmetic
      src/
        date.ts        PlainDate branded type; integer day arithmetic; formatRoc/parseRoc
        rules.ts       R1–R16 as named predicates; respectsCap is the single 28-day cap
    scheduler/         Pure scheduling engine — no Cloudflare, no D1, no fetch, no Date
      src/
        route.ts       Held–Karp exact TSP over ≤8 stops; asymmetric matrix

[Every file gets one line. Directories get one line stating what belongs in them.]

## Conventions

[Only the ones a reader needs to navigate: where rules live, the DO write path, expand-only
migrations, the Date ban. Point at CONVENTIONS.md rather than restating it.]

## Running it

[The commands that work today. If a command does not work yet, it does not appear.]
```

Description-writing rules:

- One line per file. If a file needs two, either the file does too much or the description is
  restating the code.
- Say the **purpose**, not the contents. `route.ts — Held–Karp exact TSP over ≤8 stops` beats
  `route.ts — routing functions`. A description that could be generated from the filename is not
  worth the line.
- Name the file that owns a rule, so the "no second implementation" rule is enforceable by reading:
  `rules.ts — R1–R16 as named predicates; respectsCap is the single 28-day cap`.
- Test files: only where the test is the interesting artifact — a property test, the simulation
  harness, a golden-file fixture. Do not list one line per `*.test.ts` mirroring the source tree.

### 3. Update `feature.md`

A feature is something a person can **do**, or something the system **does on its own** — not a
module, not a function, not a task ID.

```markdown
# Features

What WhereGo does today. Every entry is implemented and validated; nothing here is planned.

## Import

- **CSV import with CP950/Big5-HKSCS decoding** — parses the clinic export, converts 民國 dates,
  and holds nothing server-side until Save. `T02`
- **Geocoding with exception states** — pending / failed / no_address / ambiguous surfaced
  separately, with negative caching. `T05`

## Scheduling

- **56-day prescription cycle with ±5 day tolerance** — … `T11`

## Not yet built

[Optional, and only as a short pointer at ROADMAP.md — never as a checklist. If you find
yourself maintaining this section, delete it.]
```

- Group by user-visible area — Import, Scheduling, Schedule editing, Notifications, Operations —
  not by package or phase.
- One line each. Bold the capability, then the sentence that makes it concrete.
- Cite the task ID that delivered it. That is the trail from a feature back to its validation
  report, and it is the only reason anyone can later ask "how do we know this works?"
- **Prune.** A feature that was removed comes out. `feature.md` is not a changelog.

### 4. Verify before writing

Both files, every line:

- Does the file it names exist? Does the feature it claims actually run?
- For a sweep: is there a source file with no line in `doc.md`, or a shipped capability with no
  entry in `feature.md`?

Then read both end to end and ask whether they are still **lean**. These files are read by someone
orienting in five minutes. If `doc.md` has grown into a second specification, cut it back and point
at `docs/PLAN.md`; that is what the spec is for.

### 5. Close the task

State `validated → done` in `progress.md`, with a log line naming what changed in each file.

If that was the phase's last task, check the exit gate quoted at the top of `progress.md`. **Say
plainly whether it is closed or not** — an exit gate that gets marked closed because the tasks ran
out is exactly the failure the gates exist to prevent. Then set the header status to
`complete — exit gate closed`, or leave it `in progress` and say what remains.

---

## Rules

- **Only what exists.** No planned features, no "coming in Phase 5", no TODO lists. Both files
  answer *what is true now*.
- **Never dispatch a subagent.** This skill runs inline. Only `/build-task`, `/validate-task` and
  `/fix-task-execution` use the `Agent` tool. Pruning is the job here, and it needs first-hand
  knowledge of what actually changed — an agent's summary of the tree cannot tell you which line
  in `doc.md` is now a lie.
- **Never document unvalidated work.** `validated` is the minimum state for an entry.
- **Prune every run.** Adding is easy and is not the job; the job is that a line removed from the
  repo is removed from the docs in the same breath.
- Never restate `docs/PLAN.md`. It is the specification and it is 1,500 lines. `doc.md` orients;
  the spec explains.
- Never put patient data, credentials, `op://` references or real addresses in either file. Both are
  committed and both are read by everyone.
- If a task delivered nothing user-visible — a refactor, a test harness, a CI change — `feature.md`
  gets nothing. Say so rather than inventing an entry to make the run feel productive.
