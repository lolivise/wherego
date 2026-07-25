# Phase 4 — Web app

**Estimate** 3.5 weeks · **Depends on** Phase 3 · **Blocks** Phase 5, Phase 6
**Spec** [`../PLAN.md`](../PLAN.md) §7, §6.7

---

## Goal

The only surface that mutates anything. React + Vite SPA, Workers Static Assets, behind Cloudflare
Access, **mobile-responsive** — it gets opened in the field.

**One permission level.** Doctor and nurse can both do everything. No admin role, no approval step,
no request queue: the people who file changes are the same people who apply them.

---

## Prerequisites

- Phase 3 exit gate closed.
- **P4-00 must be complete before any component is written.** It is the reason this phase carries
  the plan's largest estimate and the phase most likely to over-run.

---

## P4-00 · Close the four open engineering decisions — **step zero, one day**

§7 and §8 specify screens in exhaustive detail and specify **no API contract**. Starting components
before these are settled is how a 3.5-week phase becomes six.

1. **Endpoint list and error envelope.** Every route the SPA needs, with request/response shapes
   derived from the existing zod schemas in `packages/domain`. One error envelope, carrying the
   §6.2 `Violation[]` unchanged.
2. **Client-side `PlanState` sync.** §6.7 requires drop targets to colour green/amber/red *before*
   release, which means `preview` runs in the browser over a client-held `PlanState`.
   Architecturally fine — the package is pure and already ships to the client. Decide: what the
   client fetches, when it invalidates, and how a stale client is detected (`plan_days.row_version`
   is already there for this). **The DO re-validates on apply regardless; the client preview is an
   affordance, never the authority.**
3. **Libraries** — map, drag-and-drop, data fetching. Pick and commit.
4. **Mobile breakpoints and the field-use cases.** Which screens must work one-handed on a phone:
   import review, patient list, day view. The calendar month view may be desktop-first.

Write the outcome into this file before proceeding.

---

## Tasks

### P4-01 · Shell, Access integration, localization

- Workers Static Assets serving the SPA behind Access; the JWT middleware (P0-07) already
  default-denies.
- **No i18n framework** — single locale, literals in 繁體中文 directly in source.
- `lang="zh-Hant-TW"` with a **Traditional Chinese font stack first**, or shared characters render
  Simplified glyph variants.
- **Store ISO, display 民國**, via the one `formatRoc()` pair. Never format a date inline anywhere.
- `Asia/Taipei` everywhere.
- Mobile-responsive from the first component, not retrofitted.

Spec: §7 *Access*, §7 *Localization*.

### P4-02 · Patients — the home screen

Where import Save redirects to.

- **Sorted by urgency**: overdue first, then next-due ascending.
- Status column: 逾期 / 已排程 / 待排程 / 地址無法定位 / 授權到期.
- Inline edit of every field. **Editing an address re-geocodes** (P1-07 semantics: status back to
  `pending`, attempts zeroed, coordinates cleared).
- Bin icon → soft delete with a **confirmation modal** and a `delete_reason`
  (duplicate / discharged / deceased / error).
- Search, and a 「可能重複」 filter.

Spec: §7 *Screens*.

### P4-03 · Dashboard

- Urgent-placement queue (overdue, blocked, missed).
- Auto-completed visits awaiting confirmation.
- Geocode exceptions **split by reason** — `pending`, `failed`, `no_address`, `ambiguous` are four
  different human actions.
- Expiring authorizations.
- Last successful plan run; next 7 days at a glance.

**Capacity, computed rather than asserted.** A 28-day window holds exactly **20** weekdays (4 × 5),
not 21, and averages ~19 after national holidays — so 1 doctor × 8/day ≈ **152–160 visits per
cycle**, not 168. At 330 patients, prescription demand alone is 330 × (28/56) = **165 per 28 days,
already over capacity before a single general visit**; if general visits run at one per patient per
56 days, per-patient demand doubles and the real ceiling is nearer **150**.

**Do not display a static constant.** Derive the ceiling from working days minus holidays and
absences, times 8, times an 80% utilization target, and from the **observed** general-visit rate
over the trailing 90 days. Staff read whatever number is on this screen as real headroom.

**Roster reconciliation.** `settings.expected_roster_size` records what the clinic believes. If the
app holds 88 and the clinic says 120, the dashboard says so. This catches the incomplete-import
failure, which no amount of technical correctness will.

Spec: §7 *Screens*.

### P4-04 · Schedule — calendar and day view

- Calendar month view with per-day load bars.
- Day detail: the ordered route on a map, drag-to-reorder, drag-to-another-day, lock toggle,
  two-visit multi-select for an explicit **swap**.
- Adding a general visit uses the §5.5 ranked-day picker (P4-05).

**Live validation during drag** (§6.7): drop targets colour green / amber / red *before* release,
and an invalid drop is refused with the reason inline. This runs `preview` client-side per P4-00
decision 2.

**Two patients at one address geocode identically** — a nursing home gives Held–Karp a zero-cost
edge. Benign, but it looks strange on a route map; render coincident stops legibly rather than
stacking them invisibly.

Spec: §7 *Screens*, §6.7.

### P4-05 · Ranked-day picker for general visits

Surfaces P2-10: top 3 days, cheapest first — 「8/6(四) — 多 2.1 公里，順路」. Blocked requests state
why, **naming the specific blocking dates**. Optional free-text `note` describing the purpose,
which appears on the LINE card.

Spec: §5.5.

### P4-06 · Pre-apply summary and override confirmation

A summary panel listing every violation, the route delta per affected day, and any cascade of
shifted due dates.

An `override` violation is presented as **a refusal with a single explicit confirmation** —
「超過處方期限 5 天，仍要安排？」 — **never as a checkbox that can be ticked absent-mindedly.**
Overrides are confirmed here and nowhere else.

The full resolution flow (swap partner search, cheapest-day suggestions) is Phase 6; the panel and
the confirmation ceremony are here.

Spec: §6.7, §6.2.

### P4-07 · Plan runs screen

Trigger a run or the catch-up backfill, watch progress, **review the proposal before committing.**

The catch-up approval screen is the highest-consequence surface in the app (P3-09): per patient,
days overdue, proposed day, resulting interval since their last visit, any `warn` violations.
**Requires the doctor, not the nurse.** Written to `audit_log` with the full proposed set.

Also surface the decision trace (`stats_json`) in readable form — it is the only forensic tool the
architecture provides.

Spec: §5.4, §7 *Screens*.

### P4-08 · Doctor absences screen

Mark leave, illness and conference days. Non-working for planning, auto-completion suppressed
(R16). **Marking a day with visits already on it routes them to urgent placement** — show that
consequence in the confirmation, do not just do it.

Spec: §7 *Screens*.

### P4-09 · LINE recipients screen

Pending join requests; **6-digit approval code generation** with the 10-minute TTL visible on
screen; list of approved recipients; **one-tap 封鎖 as the lost-phone response.**

The bot side of this flow is Phase 5. The code generation, TTL and 封鎖 endpoint are here so Phase
5 has something to authenticate against.

Spec: §8.1, §7 *Screens*, §9.1 *Incident response*.

### P4-10 · Export

Pick a date range, download visits as CSV: date, stop order, patient name, address, visit type,
note.

**Every export is written to `audit_log`.** It creates an uncontrolled copy of every name and
address, and §9's "audit_log on every mutation" would not otherwise cover it, because an export
mutates nothing.

**Offline fallback is a practice, not a screen.** The Export screen only helps someone who exported
*in advance*. The clinic gets a standing procedure: a printed or exported week, refreshed every
Monday, as the documented response when the app is unavailable — not an improvisation discovered
during an outage. Write it down and hand it over.

Spec: §7 *Screens*, §7 *Offline fallback*, §9.

### P4-11 · Settings — split by tier

**Operational, editable:** notice days, day-open penalty μ, γ, λ, route thresholds, horizon,
expected roster size, `auto_complete_enabled`, `notifications_enabled`.

**Structural, read-only with an explanatory note:** cycle days, early/late window, commit lead,
`general_cap_per_28d`, anchor mode. Changed by migration only.

`commit_lead_days` alone defines the freeze horizon, the last-chance computation and the gap-audit
window **simultaneously** — editing it from 14 to 10 on a Tuesday afternoon silently orphans every
patient whose last chance falls in the discontinuity, and the gap audit then "correctly" reports no
gaps over the new, shorter window.

The whole table is parsed through a zod schema with defaults at load, and **load fails loudly** on
an unknown key or an unparseable value. A key/value table of TEXT otherwise turns one typo into a
NaN propagating silently through the cost function.

Spec: §7 *Screens*, §3 `settings`.

### P4-12 · Copy review

Every string reviewed by a native 繁體中文 reader before the pilot. Violation messages especially —
they name conflicting facts and dates, and a mistranslated one is worse than no message.

Spec: §7 *Localization*.

---

## Acceptance criteria

- [ ] P4-00's four decisions are written into this file, with the endpoint list committed.
- [ ] An unauthenticated browser hitting any app route gets the Access login, and any app **API**
      route returns 403.
- [ ] Every date on every screen renders 民國 and every stored value is ISO — verified by grepping
      for inline date formatting and finding none.
- [ ] Import → Save → patient list redirect works on a phone, one-handed.
- [ ] Dragging a visit onto a full day colours the target red **before** release and refuses with
      the reason inline.
- [ ] Dragging into a day that violates the 28-day cap shows a message naming both existing visit
      dates and the resulting window.
- [ ] An override refusal requires an explicit confirmation and writes `override_ack` +
      `audit_log`.
- [ ] The dashboard capacity figure changes when a holiday or an absence is added — it is computed,
      not a constant.
- [ ] Setting `expected_roster_size` above the actual count surfaces the reconciliation warning.
- [ ] Marking an absence day that has 3 visits on it moves all 3 to urgent placement and says so
      before confirming.
- [ ] Generating a LINE approval code shows 6 digits and a visible 10-minute countdown.
- [ ] An export writes an `audit_log` row.
- [ ] Structural settings are visibly read-only with the explanation; a hand-crafted PATCH to a
      structural key is rejected server-side.
- [ ] A malformed `settings` value makes load fail loudly rather than yielding NaN.
- [ ] Copy reviewed by a native reader; sign-off recorded.

---

## Exit gate

**The doctor and the nurse can run a full week end to end on a phone** — import a file, curate the
list, review the committed days, move a visit, add a general visit, mark an absence — without
anyone explaining a screen to them.

Watch them do it. Every remaining gap in this app is a gap in the only surface that can fix a
scheduling mistake.
