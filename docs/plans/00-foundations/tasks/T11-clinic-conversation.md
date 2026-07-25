# T11 · The clinic conversation — 個資法 and all seven open questions

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-16
**Spec** `docs/PLAN.md` §9.1, §12 *Open questions* · **Depends on** — · **State** `blocked`
**Execution** **manual** — a conversation with the clinic. No code.

> **Notes for the board:** blocked on the clinic. **Book it in week 1.** It blocks nothing else in
> Phase 0, but it holds the answers to Q1 and Q2 which block Phase 2, and Q3 and Q4 which block
> Phase 1. It has the longest lead time of anything in this phase and it is the only task here that
> depends on someone else's calendar.

## Outcome

A half-page 個資法 document exists and the clinic has acknowledged the cross-border transfer in
writing; all seven open questions have been asked and their answers are recorded in §12 of
`docs/PLAN.md`.

## Scope

- **In:** the conversation, the half-page document, and recording the answers.
- **Out:** implementing anything the answers imply. The hard-delete *procedure* is documented here;
  it is **implemented in Phase 7**. Q1's effect on `respectsCap` is Phase 2.

## Detail

§9.1 frames this as a conversation, not legal work:

> This is health-adjacent PII collected by a 醫療機構 in Taiwan. 個資法 applies to names, birth
> dates and home addresses of medical patients regardless of whether any diagnosis is stored, so
> the six-column rule reduces the exposure without removing the obligation.

The half page covers seven points:

- **Named controller** — the clinic is the 蒐集者; WhereGo is a tool they operate.
- **Processor list** — Cloudflare (hosting, D1), Google (geocoding, routing), LINE (messaging),
  1Password (credentials), GitHub (CI, encrypted backups).
- **Cross-border transfer** — addresses go to Google; D1 has no Taiwan region and runs APAC (T03).
  **The clinic acknowledges this in writing.**
- **Purpose and notice** — in the terms the clinic already uses with patients.
- **Retention** — "records live until binned" is not a policy. State one.
- **Deletion** — verbatim from §9.1, because the reason is the whole point:
  > **The soft-delete-only model cannot honour a 刪除權 request** — `deleted_at` hides a row, it
  > does not remove the name and address. Document a hard-delete procedure: purge the patient row
  > and anonymize their visits to a tombstone id, retaining only the counts the clinic needs for
  > reporting. `delete_reason` (§3) distinguishes a duplicate from a discharge from a deletion
  > request.
- **Incident response** — a lost or stolen phone is an incident: 封鎖 the `line_recipients` row and
  have the conversation deleted. An offboarding staff member gets the same treatment — **approval
  controls who joins, and nothing controls what has already left.**

**Ask all seven open questions in this same conversation** (ROADMAP § *Open questions*), not
staggered by the phase they block:

| # | Question | Blocks |
|---|----------|--------|
| 7 | Who is the named 個資 controller, and what retention rule? | §9.1, Phase 0 |
| 3 | What are the last 41 rows of the sample file? | Phase 1 |
| 4 | Will the clinic re-export with 地點? | Phase 1 |
| 1 | Rolling 28-day window, or NHI 「每月至多2次」 calendar month? | §5.7, Phase 2 |
| 2 | Is 61 days acceptable against 57 days of supply? Does 慢性病連續處方箋 limit how *early*? | §5.2, Phase 2 |
| 5 | How does the doctor want leave handled? | §5.6, Phase 3 |
| 6 | How many LINE recipients, on which Taiwan OA tier? | Phase 5 |

Two of these change the shape of the build rather than a value in it. **Q1 changes `respectsCap`
fundamentally.** **Q4 decides whether go-live scope is 38 patients or 38 patients plus a data-entry
project of ~120 addresses that needs a named owner.**

While the roster is being discussed, `settings.expected_roster_size` (T09) is the number to come
away with.

## Manual checklist

1. Book the conversation. Everything else in this task waits on it.
2. Walk the seven 個資法 points; write the half page.
3. Get the cross-border-transfer acknowledgement **in writing**.
4. Ask all seven questions from the table. Record verbatim answers, not interpretations.
5. Get `expected_roster_size`.
6. Write the answers into `docs/PLAN.md` §12, and the retention rule into §9.1.
7. Where an answer contradicts the spec, **the spec is what changes** — raise it rather than
   working around it.

## Acceptance criteria

- [ ] The 個資法 half-page exists and covers all seven points.
- [ ] The clinic's acknowledgement of the cross-border transfer exists in writing.
- [ ] A retention rule is stated. "Until binned" is not one.
- [ ] The hard-delete procedure is documented (implementation is Phase 7).
- [ ] All seven open questions have an answer recorded in `docs/PLAN.md` §12.
- [ ] `expected_roster_size` has a number.
- [ ] Any answer that contradicts the current spec is flagged, and the spec updated.

## Validation

Read the artifacts. Every criterion is `manual` — no agent can satisfy any of them, and none should
be reported as met on the strength of an intention to hold the meeting. An unanswered question left
recorded as answered is the most expensive possible outcome of this task.

## Open questions

This task **is** the open questions. It stays `blocked` until the conversation is scheduled.
