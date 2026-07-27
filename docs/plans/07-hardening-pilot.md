# Phase 7 — Hardening & pilot

**Estimate** 2 weeks · **Depends on** Phases 5 and 6 · **Blocks** nothing — this is go-live
**Spec** [`../PLAN.md`](../PLAN.md) §5.3, §5.4, §9.1, §11.3, §11.4

---

## Goal

Turn a complete system into one a clinic can rely on: real road distances, a rehearsed restore, a
load test against the real ceiling, and the go-live catch-up run — **the highest-consequence human
decision in the project.**

---

## Prerequisites

- Phases 5 and 6 complete.
- The clinic's roster loaded and reconciled against `expected_roster_size` (P4-03).
- The doctor available for the catch-up approval, unhurried. If the schedule has slipped, slip this
  rather than compressing it — landing go-live in a rush is precisely when the catch-up run gets
  approved without careful review, and that is the opening move in both reviewers' pre-mortems.

---

## Tasks

### P7-01 · Routes API and the road-distance cache

- A committed day with **3 or more stops** is re-optimized once against the live Routes API. With
  1–2 stops there is nothing to reorder and the call is skipped.
- Populate `road_distances`, keyed on **Place IDs**, **asymmetric** — `d(i,j) ≠ d(j,i)` because of
  one-way streets and divided highways.
- **Day selection uses road distance where the cache is warm**, falling back to haversine. In a
  fixed roster the same patient pairs recur every cycle, so the matrix self-warms within weeks at
  negligible API cost, and clustering improves where 高屏溪 and 台88 make straight-line distance
  actively misleading.
- Confirm Held–Karp still returns optimal tours now that it is actually being fed an asymmetric
  matrix — this is the moment the P2-07 symmetry assumption would have broken.
- Store `route_km` / `route_minutes` on `plan_days`; these are Routes content and fall under the
  same ToS answer as geocoding (P0-09).

Spec: §5.3, §3 `road_distances`, §9.

### P7-02 · Audit log coverage sweep

Verify `audit_log` rows exist for: imports, patient edits, soft deletes, reschedules, overrides,
lock changes, LINE approvals, **exports**, absence marking, catch-up approval, and settings
changes.

Export is the one that gets missed — it mutates nothing, so a "log every mutation" rule does not
cover it, and it creates an uncontrolled copy of every name and address.

Spec: §9.

### P7-03 · Load test at 2× patients, with a CPU budget assertion

Run the system at **twice the pilot roster** and assert:

- the commit run stays inside **the CPU ceiling of the plan actually in force** — on Workers Free
  that is a flat **10 ms** per invocation and `limits.cpu_ms` does not exist; on Paid it is the
  pinned `limits.cpu_ms` (§2, T03, T04). At twice the pilot roster this is the sharpest test in the
  phase: it is the measurement §2 defers the Free-vs-Paid decision to, and if it fails, the fix is
  either splitting the commit run per doctor or US$5/month — decide it here with the number in hand,
  not by argument;
- the nightly job's nine items complete inside their window;
- Held–Karp on 8 stops plus origin and destination stays in microseconds, as predicted (2,048
  states, ~16,384 relaxations);
- the DO absorbs the write throughput without queueing observably.

Assert the CPU number, don't eyeball it. This is the check that tells you whether the roster ceiling
is a capacity problem or a runtime problem.

Spec: §2, §5.3.

### P7-04 · Backup restore drill — **actually do it**

1. Take a `backup.yml` artifact, decrypt it with the `age` private key from 1Password, and restore
   it into a scratch D1 database. Confirm the roster is complete.
2. Rehearse `wrangler rollback` (code only, loses nothing).
3. Rehearse `wrangler d1 time-travel restore` against the scratch database using a recorded
   bookmark from a `deploys` row.

**Read and rehearse the restore playbook, including its two warnings:**

- **It restores the whole database.** Every 完成/未遇 mark, patient edit, and visit committed since
  the bookmark is discarded.
- **It interacts badly with auto-completion.** The nightly job will re-close the reverted `planned`
  visits as `completed`, so a restore silently converts every lost 未遇 into a false 完成 — in
  bulk, and exactly the corruption R16 exists to prevent. **Set `auto_complete_enabled = 0` before
  restoring** and reconcile by hand.
- State the data-loss window to the clinic **before** restoring, not after.

An unrehearsed restore procedure is a document, not a capability.

Spec: §11.3, §11.4 item 5, *Restore playbook*.

### P7-05 · Hard-delete procedure, implemented

Phase 0 documented it (P0-16); implement it now. **Soft delete cannot honour a 刪除權 request** —
`deleted_at` hides a row, it does not remove the name and address.

Purge the patient row and anonymize their visits to a tombstone id, retaining only the counts the
clinic needs for reporting. `delete_reason` distinguishes a duplicate from a discharge from a
deletion request. Audit-logged, and restricted to a deliberate action rather than the bin icon.

Spec: §9.1.

### P7-06 · Operational handover

- **The offline fallback practice** (P4-10): a printed or exported week, refreshed every Monday, as
  the documented procedure when the app is unavailable. Hand it over as a written standing
  practice, not a suggestion.
- **Incident response**: a lost or stolen phone → 封鎖 the `line_recipients` row (one tap) and have
  the conversation deleted. An offboarding staff member gets the same treatment — approval controls
  who *joins*, and nothing controls what has already left.
- **The notification kill switch**: `notifications_enabled = 0` before risky work.
- **Who to call, and what the alerts mean.** The clinic receives the R14 push, the run-failure push
  and the Monday digest. Explain what each one means and what to do about it, or they become noise
  inside a month.

Spec: §7, §9.1, §11.4 item 7.

### P7-07 · The go-live catch-up run

**At go-live, over half the roster is already overdue** — of the 38 importable sample rows, 20 have
a 預訪日期 between 3 and 59 days in the past. They cannot go through the normal path, which only
ever targets forward.

Run P2-09 / P3-09 with `trigger = 'catchup'`. At 20 patients and 8/day that clears in about three
days of visits.

**The approval, and it is the reason this task is last:**

- The screen shows, per patient: days overdue, the proposed day, the resulting interval since their
  last visit, and any `warn` violations.
- **It requires the doctor — not the nurse.**
- The approval is written to `audit_log` with the full proposed set.
- **It must not be a single 確認 button at the end of a long build.** Sit with the doctor and walk
  the list.

**One property to state out loud before approving:** placing 20 overdue patients across three
consecutive days synchronizes most of the roster onto those three weekdays *for the life of the
system*, since 56 days preserves weekday. The reachability-based last-chance test (P2-03) handles
it correctly, and the simulation covers the scenario — but the clinic should know their week will
look lumpy, and why.

Spec: §5.4.

### P7-08 · Pilot with real data

Run live with the clinic's real roster. During the pilot, watch specifically:

| Watch | Because |
|-------|---------|
| The Monday digest's 「最久未訪視」 number | It is the single best summary of whether anything is silently broken |
| `unplaced_count`, `blocked_count`, `overdue_count` across runs | Non-zero means the four-class partition is meeting reality |
| Auto-completion rate | A high rate means 完成 tapping has not become a habit; the 「昨日未回報」 prompt is the intervention |
| Dashboard capacity vs actual | The computed ceiling (~150, not 330) against what the clinic actually books |
| Geocode exceptions by reason | `no_address` count is the data-entry project's burn-down |
| Road-distance cache warmth | Selection quality improves as it fills |
| Push volume against the OA tier | Replies are free; pushes are not, counted per recipient |

Keep `auto_complete_enabled` on but review the 「自動結案」 list daily for the first fortnight.

---

## Acceptance criteria

- [ ] A 4-stop committed day is re-optimized against the live Routes API and the tour differs from
      the haversine tour at least once — proving the asymmetric matrix is actually in use.
- [ ] `road_distances` fills over a week of runs; a warm pair is served from cache with no API call.
- [ ] `audit_log` covers all twelve action types in P7-02, verified by exercising each.
- [ ] The load test at 2× roster passes with a **numeric** CPU assertion, not an observation.
- [ ] A `backup.yml` artifact was decrypted and restored into a scratch database, and the roster
      was complete.
- [ ] `wrangler rollback` rehearsed. `time-travel restore` rehearsed with
      `auto_complete_enabled = 0` set first.
- [ ] Hard delete removes the name and address and leaves a tombstoned visit history.
- [ ] The offline fallback practice and the incident-response procedure are written down and handed
      over.
- [ ] The catch-up proposal was reviewed line by line **with the doctor** and approved by them; the
      `audit_log` row records the full set.
- [ ] Pilot live; the first Monday digest arrived and the numbers are the ones expected.

---

## Exit gate

**The pilot is live, the doctor approved the catch-up run with the list in front of them, and the
restore drill was performed rather than documented.**

After go-live the standing checks are the Monday digest, the R14 count, and the healthchecks.io
status. All three exist because every other detector in this system lives inside the thing being
detected.
