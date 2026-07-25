# Phase 6 — Mutation surfaces

**Estimate** 1 week · **Depends on** Phase 4 (Phase 5 may run in parallel) · **Blocks** Phase 7
**Spec** [`../PLAN.md`](../PLAN.md) §6

---

## Goal

Wire up the surfaces for the validator that already exists. **Phase 2 built all of this logic**;
this phase is the last mile — the resolution flows that turn a refused drag into a decision, and
the guarantee that every apply lands inside the Durable Object.

If this phase feels large, something was left out of Phase 2. Check before adding logic here: no
rule may have a second implementation.

---

## Prerequisites

- Phase 4 complete — the calendar, day view, drag-and-drop and pre-apply panel exist.
- Phase 2's `mutate.ts` complete, including `suggest()`.

---

## Tasks

### P6-01 · Swap partner search

When the only blocking violation is `CAPACITY_EXCEEDED` on day D:

```
for each visit w on day D:              # at most 8 candidates
    p = preview(state, swap(v, w))
    if p.violations has no 'block':
        keep (w, p.routeDelta)
return top 3 by routeDelta ascending
```

Surface as three ranked options, each showing the partner patient, the day they move to, and the
route delta on both days.

Spec: §6.4.

### P6-02 · Cheapest-day suggestions

For `CAP_28D_EXCEEDED`, `AUTH_EXPIRED` or an out-of-window prescription, return the nearest legal
days from the §5.5 ranker rather than a swap.

**`add` always falls through to the ranker** — an insertion into a full day has no partner day to
swap against, so swap is the wrong fallback for it.

**A blocked change never dead-ends.** Every refusal offers either a swap or a ranked day.

Spec: §6.4, §5.5.

### P6-03 · Override confirmation flow, completed

The `override` ceremony from P4-06, now covering every override path: out-of-window placement,
`VISIT_LOCKED`, and the urgent-placement approvals.

- A refusal with **a single explicit confirmation**, never a checkbox.
- Accepted overrides stored in `visits.override_ack` and logged to `audit_log` with the actor.
- Overrides are confirmed on this panel **and nowhere else** — no second path.

Spec: §6.2, §6.5.

### P6-04 · DO apply-path wiring

Every mutation surface — drag-and-drop, swap, reorder, cancel, add, ranked-day picker, urgent
placement, catch-up commit — calls `PlanCoordinator.apply`.

`apply` re-reads state fresh, **re-runs the full validation**, and aborts if any `block` appeared
since preview. Surface that abort in the UI as a specific message ("someone else changed this
day"), not a generic error — a stale-client rejection is the expected outcome of two people using
the app at once, not an exception.

Audit: the client's `plan_days.row_version` is sent with every apply and checked.

Spec: §6.5.

### P6-05 · Rule audit screen

Output of the nightly sweep (§6.6): every finding from the validator run over the whole published
schedule, grouped by severity, each linking to the day or patient it concerns and offering the same
resolution actions as a live drag.

An edited `registered_on` or a lapsed `authorized_until` can retroactively invalidate planned
visits — this screen is where those surface. Findings affecting the next 7 days are also pushed to
LINE (P3-08).

Spec: §6.6, §7 *Screens*.

### P6-06 · Cascade display

The preview's `cascade` — future due dates that shift as a result of this mutation, the default
under `anchor_mode = visit`. Show the shifted dates in the pre-apply panel; `CYCLE_SHIFT` is a
`warn`, and a warning nobody can see the consequences of is not a warning.

Spec: §6.2, §6.3.

### P6-07 · Mobile-responsive day view

The day view is the screen most likely to be used standing in a corridor. Finish the responsive
work here: the ordered route, the reorder handles, the swap multi-select and the pre-apply panel
all usable one-handed.

Spec: §7.

---

## Acceptance criteria

- [ ] Dragging into a full day offers three ranked swap partners, each with both route deltas.
- [ ] Dragging into a day that breaks the 28-day cap offers ranked legal days, **not** a swap.
- [ ] Adding a general visit to a full day offers ranked days, never a swap.
- [ ] No blocked mutation anywhere in the app dead-ends without an offered alternative.
- [ ] Every apply path goes through the DO — verified by instrumenting `PlanCoordinator` and
      exercising each surface.
- [ ] Two browsers open on the same day: the second apply is rejected with the stale-state message,
      not a 500, and the day is never left at 9 visits.
- [ ] An override writes `override_ack` and an `audit_log` row naming the actor and the code.
- [ ] The rule audit screen shows findings from a deliberately corrupted state (edit a
      `registered_on` so a planned visit falls out of window) and offers a resolution.
- [ ] The cascade panel shows the shifted future due dates for a moved prescription visit.
- [ ] The whole day view is usable one-handed on a phone.

---

## Exit gate

**Every refusal in the application offers a next step, and every apply is serialized.**

Test the second half adversarially: open two sessions, race them at a day sitting at 7/8, and
confirm the outcome is one visit and one clear rejection. That race is the specific failure the
Durable Object was bought to prevent, and this is the last phase where it can be verified before
real patients are on the days in question.
