---
name: validate-task
description: Independently validate an executed WhereGo task using parallel Sonnet 5 agents — runs the code end to end locally, stands up mock servers for any third-party API, and reports bugs. Use after /build-task or /fix-task-execution. Trigger: /validate-task <task id>
---

# validate-task

Prove — or fail to prove — that an executed task actually works. Not by reading the code and
agreeing with it, but by **running it end to end locally**, with every third-party API replaced by
a mock server that the validation controls.

**Read `.claude/harness/CONVENTIONS.md` first.**

The premise: the agent that wrote the code cannot judge it. Validation agents are spawned fresh,
are given the task and the repo, and are **not** given the execution narrative.

---

## Input

`/validate-task T07`, or no argument to resume the first task in `executed` or `fixing`.

Refuse if the task is `todo` or `planned` — there is nothing to validate. If it is already
`validated`, say so and ask whether to re-run.

---

## Steps

### 1. Prepare the brief

Read `progress.md`, **`work/<task>/acceptance.md` — the contract, and the thing you are judging
against** — the task file's `Validation` section, and `git diff` for what the task actually changed.
Identify:

- every criterion in `acceptance.md` and its stated evidence method. A criterion marked `manual`
  cannot be agent-proven: collect it for the human rather than passing it silently;
- the attempt number, and if >1, the bugs from the previous validation — **a re-validation must
  re-check every previously reported bug**, not only the ones the fix claimed to address;
- which third parties the changed code touches.

Do **not** read `execution.md` into the agents' briefs. You may read it; they may not.

### 2. Stand up the local environment

| Dependency | How it runs in validation |
|------------|---------------------------|
| Workers runtime, D1, Durable Objects, KV | **Miniflare** — `wrangler dev --local`, `@cloudflare/vitest-pool-workers`. Real code paths, local storage. Never the deployed Worker |
| Google Geocoding / Places / Routes | **Mock server** — `tools/mocks/google/` |
| LINE Messaging API | **Mock server** — `tools/mocks/line/` |
| healthchecks.io | **Mock server** — assert the ping was made; do not ping |
| 1Password, GitHub Actions, Cloudflare API | **Not exercised.** Validate the config, never the credential |

**No validation run may reach a real external host.** Beyond cost and quota, a validation that
depends on someone else's uptime is a test that fails for reasons unrelated to the code, and gets
ignored within a fortnight.

#### Mock servers

Mocks live in `tools/mocks/<service>/`, are **committed**, and are reused across tasks and phases —
Google geocoding is needed by Phases 1, 2 and 7, and three drifting copies is worse than none.

Each mock is a small local HTTP server that:

- **speaks the real wire format**, including the real error shapes. A Google mock that only ever
  returns `OK` cannot exercise `ZERO_RESULTS`, `OVER_QUERY_LIMIT` or an ambiguous multi-result
  response — and those three are the entire point of the geocode exception states;
- serves from **fixtures under `tools/mocks/<service>/fixtures/`**, which are **synthetic**. Never
  build a fixture from the real CSV: addresses in 大寮區 for the shape, invented for the content;
- **records every request** so validation can assert on what was sent — the signature header, the
  payload size, the fact that a cached geocode produced *no* call at all;
- can be told to fail: timeout, 5xx, rate-limit, malformed body. **Reach for these.** The code's
  behaviour on a Google timeout mid-import is a real requirement, and the happy path never finds it.

If a mock does not exist yet, the validation agent builds it, and the report says so — the first
task that needs a service pays for its mock, everyone after inherits it.

For LINE specifically the mock must verify the outbound side too: **compute the HMAC-SHA256
signature over the body and reject a bad one**, so signature-verification code is exercised rather
than assumed.

### 3. Dispatch three validation agents in parallel

Three `Agent` calls, `model: "sonnet"`, `subagent_type: "general-purpose"`, in **one message** so
they run concurrently. Different lenses, because redundancy finds the same bug three times and
diversity finds three bugs.

Shared preamble for all three:

```
You are validating one task in the WhereGo repository. You did not write this code and
you have no stake in it being correct.

Read:
- .claude/harness/CONVENTIONS.md
- docs/plans/<slug>/work/T<NN>-<slug>/acceptance.md  — THE CONTRACT. Judge against this.
- docs/plans/<slug>/tasks/T<NN>-<slug>.md   — the task: outcome and scope
- docs/PLAN.md sections <cited>              — the specification, authoritative
- the diff for this task: <git range or file list>

The contract is frozen. If a criterion looks wrong, report that as a finding — do not
reinterpret it into one the code satisfies.

You may run anything locally. You may NOT reach any external network host — Google, LINE
and every other third party are mocked at tools/mocks/. Cloudflare runs under Miniflare.
If a mock you need does not exist, build it under tools/mocks/<service>/ with synthetic
fixtures and say that you did.

Do not fix anything. Report.

Return: for each acceptance criterion, met / not met / not exercised with evidence; then
each bug as { severity HIGH|MEDIUM|LOW, location file:line, reproduction steps, expected
vs actual, why it matters in the running system }. Reproduction steps must be exact
enough for another agent to run them without you. If you find nothing, say so plainly —
do not manufacture findings.
```

Then, per agent:

**Agent A — acceptance.** *Walk the task's acceptance criteria one at a time and try to establish
each by running something, not by reading. A criterion you can only satisfy by reading the code is
'not exercised', and say what would exercise it.*

**Agent B — end to end.** *Drive the feature the way the system will: start the local stack, run
the real entry point (the cron, the HTTP route, the import, the CLI), with the mocks in place.
Assert on what the mocks received, not only on what the code returned. Then break the mocks —
timeout, 5xx, rate limit, malformed body — and report what the code does. Partial failure
behaviour is the finding here.*

**Agent C — adversarial.** *Assume there is a defect and go find it. Check the diff against the
spec section by section; hunt boundary cases (empty, one, exactly at the limit, one over, past
dates, a leap year, a Monday, a national holiday, two writers at once); check every standing rule
in CONVENTIONS.md against the diff — `Date` in the scheduler, a direct D1 write, a duplicated rule
implementation, a weakened or skipped test, a seventh column of patient data; and check whether the
tests that exist would actually fail if the code were wrong — mutate a constant and see.*

If the task touches scheduling arithmetic, tell Agent C specifically to attack the calendar:
`56 = 8 weeks exactly` preserves weekday, `9 mod 7 = 2` is where the last-chance blind spot lived,
and `d(i,j) ≠ d(j,i)` for road distances.

### 4. Triage the findings yourself

Do not concatenate three reports. For each reported bug:

- **Reproduce it.** A bug that does not reproduce is a note, not a bug. Say which.
- **Deduplicate.** Same root cause reported by two agents is one bug; note the corroboration,
  because two independent lenses hitting one defect raises confidence.
- **Judge severity against the running system**, not against tidiness:
  - **HIGH** — wrong schedule, lost or fabricated data, a rule violated, a security or PII exposure,
    a write outside the DO, a silent failure. Blocks the task.
  - **MEDIUM** — correct but fragile: an unhandled error path, a missing test for a stated
    criterion, a duplicated rule implementation.
  - **LOW** — naming, structure, a comment that has already drifted.
- **Reject the invalid ones, in writing.** An agent objecting to a deliberate design decision that
  the spec justifies is not a bug; record the rejection and the reason, so the next validation does
  not re-report it.

### 5. Write `work/<task>/validation-NN.md`

Template in `CONVENTIONS.md`. `NN` increments per validation run.

**The `Coverage gaps` section is mandatory and is not a formality.** State plainly what this run
could not prove and what would be needed to prove it: "the Routes API asymmetry is mocked
symmetric, so P7-01's asymmetric-tour behaviour is unproven here." A validation that claims total
coverage is the one that gets trusted when it should not be.

Verdict:

- **PASS** — every acceptance criterion met by something that ran; zero HIGH, zero MEDIUM.
- **PASS WITH NOTES** — as above, LOW findings only. Record them; they do not block.
- **BUGS FOUND** — any HIGH or MEDIUM open.
- **CANNOT VALIDATE** — the environment could not be stood up, or the task is not testable as
  written. This is a finding about the *task*, and it goes back to `/design-task`, not to a fix agent.

### 6. Update `progress.md`

- PASS / PASS WITH NOTES → `validated`. Point at `/doc-feature`.
- BUGS FOUND → `bugs-found`, with the open count in `Notes`. Point at `/fix-task-execution`.
- CANNOT VALIDATE → `blocked`, with what is missing.

Log line with the verdict and the report path.

---

## Rules

- **Never fix anything in this skill.** Finding and fixing in one pass produces a report describing
  code that no longer exists. Fixing is `/fix-task-execution`.
- **Never hit a real third-party API.** Not once, not "just to check the shape".
- **Never use real patient data.** Fixtures are synthetic. The sample CSV is not an input to
  validation and is never pasted into an agent brief.
- Never lower a verdict to unblock the loop. A task marked `validated` with a known HIGH bug is a
  defect that has been laundered into the record and will be discovered in Phase 7 at the worst
  possible moment.
- On a re-validation, **re-check every bug from every previous report** for this task, including the
  ones the fix claimed were not bugs.
- Three round trips on one task without reaching PASS: stop, and escalate to the human. The problem
  is the task or the plan, and a fourth fix agent cannot see that.
