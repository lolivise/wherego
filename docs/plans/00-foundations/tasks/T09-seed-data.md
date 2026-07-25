# T09 · Seed data — `doctors`, `holidays`, `settings`

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-17 (seed half)
**Spec** `docs/PLAN.md` §3, §5.3 *Non-working target days*, §10.7 steps 8–9 · **Depends on** T05 · **State** `todo`
**Execution** agent

## Outcome

A repeatable seed applies the clinic's doctor row, the current year's holidays including 補班
make-up Saturdays, and every §3 `settings` key with its correct value and `tier`.

## Scope

- **In:** the seed itself — `doctors`, `holidays`, `settings` — and the zod schema that parses
  `settings` at load.
- **Out:** the bootstrap `wrangler deploy` and applying the seed to remote D1 (T18). Patient data
  of any kind. γ and λ *tuned* values — Phase 2 sets those from the §5.8 simulation; this task
  writes the §3 defaults.

## Detail

`doctors`: the clinic's base coordinates (大寮衛生所 — the route start and end, §3) and
`max_visits_per_day = 8`. `working_days` defaults to `'1,2,3,4,5'`.

`holidays`: the current year from the 行政院人事行政總處 calendar — **including 補班 make-up
Saturdays modelled as an explicit working-day override, not as an absent holiday** (P0-17). A
make-up Saturday is a working day that the weekday rule says is not one; leaving it out of the
table means the calendar is silently wrong on exactly the days the clinic is open and the scheduler
believes it is closed.

`settings`: all §3 defaults with correct `tier` values.

**structural** — read-only in the UI, changed only by migration:

```
cycle_days=56, early_window_days=5, late_window_days=5, general_cap_per_28d=2,
commit_lead_days=14, anchor_mode=visit
```

§3's reasoning for why these are structural, carried verbatim because a settings screen that lets
someone edit them is a one-line mistake:

> These define the last-chance invariant, the freeze horizon and the gap-audit window
> simultaneously. Editing commit_lead_days from 14 to 10 on a Tuesday afternoon silently orphans
> every patient whose last chance falls in the discontinuity, and the gap audit then "correctly"
> reports no gaps over the new, shorter window.

**operational** — editable on the Settings screen (§7):

```
notice_days=3, min_day_batch=2, day_open_penalty_km=8,
due_deviation_km_per_day=1.5,   -- γ: km-equivalent cost of one day off due
late_tiebreak_km=0.5,           -- λ: flat km penalty for landing on/after due
route_cost_spike_km=5, max_route_minutes=300, horizon_days=120,
district_prefix='高雄市大寮區', expected_roster_size=NULL,
auto_complete_enabled=1, notifications_enabled=1
```

γ and λ are **in kilometres** so the §5.3 objective is dimensionally consistent. Initial values come
from the §5.8 simulation, not from intuition — Phase 2's job, and the reason the numbers above are
defaults rather than answers.

The loader, verbatim from §3:

> The whole table is parsed through a zod schema with defaults at load, and load FAILS LOUDLY on an
> unknown key or an unparseable value. A key/value table of TEXT will otherwise turn one typo into
> a NaN propagating silently through the cost function.

`settings.expected_roster_size` comes from the clinic (T11) and stays `NULL` until then. That is the
§3 default, so this task is **not** blocked on T11.

## Acceptance criteria

- [ ] Applying the seed to a freshly migrated empty database succeeds, and applying it a second
      time is idempotent — no duplicate rows, no error.
- [ ] `doctors` has one row with the clinic's base lat/lng and `max_visits_per_day = 8`.
- [ ] Every `settings` key listed above exists, with the stated value and the correct `tier`, and
      no key exists that is not in §3.
- [ ] The zod loader parses the seeded table successfully.
- [ ] The loader **fails loudly** on an unknown key, and on an unparseable value for a numeric key.
      Both proven by seeding a bad row and observing the failure — not by reading the schema.
- [ ] `holidays` contains the current year's national holidays.
- [ ] At least one 補班 make-up Saturday is present as an explicit working-day override, and a test
      shows that day is treated as a working day while an ordinary Saturday is not.
- [ ] `expected_roster_size` is `NULL`, and the loader accepts that.
- [ ] No patient data of any kind appears in the seed.

## Validation

Local, against Miniflare D1 (T06). Apply, re-apply, and assert row-by-row. Exercise the loader's
failure paths by inserting a junk row, since "fails loudly" is the criterion and a silent default is
the defect it exists to catch. The 補班 case is checked against the calendar for the current year,
and both directions are asserted. Synthetic data only; no third party.

## Open questions

- **The clinic's base coordinates for 大寮衛生所.** `/design-task` asks the user for the exact
  lat/lng rather than geocoding a guess — every route in the system starts and ends here.
- **Which year's holiday calendar**, and where it is sourced from, given the pilot lands in
  November. Ask; do not assume the current calendar year covers go-live.
