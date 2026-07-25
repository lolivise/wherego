# Phase 1 — Import

**Estimate** 2.5 weeks · **Depends on** Phase 0 · **Blocks** Phase 3 (real patients), Phase 4
**Spec** [`../PLAN.md`](../PLAN.md) §4, §3 (`patients`, `csv_imports`, `geocode_cache`), §7

---

## Goal

Turn a Big5 CSV from the clinic's system into geocoded patient records, with every unparseable
field fixable inline and nothing written until a human presses Save.

Import is **a way to gather records, not a system of record.** After Save, the patient page (§7)
is where everything is maintained.

---

## Prerequisites

- Phase 0 complete, including the Google Maps ToS answer (P0-09) — it decides whether
  `geocode_cache.fetched_at` needs a reader.
- Open questions 3 (what are the last 41 rows?) and 4 (will the clinic re-export with 地點?)
  asked. Q4's answer sets the real scope of this phase's output.
- The sample file `居家11506112.csv` available locally. **It contains 身分證號, diagnoses and
  home addresses — never commit it, never paste its rows anywhere.**

---

## Tasks

### P1-01 · `packages/domain` — `PlainDate` and ROC arithmetic

The single most important type in the system.

- `PlainDate = string & { __plainDate }`, `YYYY-MM-DD`, with integer day-number arithmetic:
  `addDays`, `diffDays`, `weekday`, `compare`, `parseIso`, `today(tz)`.
- `formatRoc()` / `parseRoc()` — **one pair, used by the app, the bot and the CSV parser.** Never
  format a date inline anywhere else.
- `no-restricted-globals` lint rule banning `Date` inside `packages/scheduler`, wired as a CI
  failure (already scaffolded in P0-12 — turn it on here).

A JS `Date` is an instant, not a date. `addDays(d, 28)` on a `Date` parsed from an ISO string is
UTC-midnight, and any local accessor downstream shifts it a day — which surfaces as a visit on the
wrong day. This rule prevents more bugs than any other line in the spec.

Spec: §2, §7 *Localization*.

### P1-02 · CP950 / Big5-HKSCS decoding

Workers' `TextDecoder` is not guaranteed to support non-UTF-8 labels, and implementations
disagree — macOS `iconv -f BIG5` fails on this file where Python's `big5` codec succeeds. **That
disagreement is the diagnosis: the file is CP950 / Big5-HKSCS, not strict Big5.**

- Bundle a JS decoder built on the **WHATWG `big5` index** (HKSCS-based, what browsers implement).
- A minimal Big5 table fails on exactly the rare surname characters a patient roster contains.
  **Put 堃, 淼, 喆, 妘 in the fixture.**
- Detect and record the encoding into `csv_imports.encoding`.

Spec: §4 *Big5 decoding*.

### P1-03 · Golden-file test fixture — **commit this before writing the parser**

A synthetic fixture carrying every pathology found in the real file, with the exact expected parse
asserted in CI:

- the 核定迄日 that parses to the year **3067**
- the phone number sitting in the column labelled **性別**
- mixed `YYYMMDD` and `YYY/MM/DD` forms
- the address variants `X之Y號`, `X號之Y`, `X-Y號`, and one with an embedded 鄰
- blank 地點, blank 出生日期, blank 姓名
- the HKSCS surnames from P1-02
- a 收案日期 of **2027-06-11** — a future registration date, which must be rejected

The date parser is the one component where a bug schedules a real visit on a wrong day. A manual
check does not survive the second month.

Spec: §4 *Big5 decoding*.

### P1-04 · Six-column mapping and required-header enforcement

| Column | Maps to | Required |
|--------|---------|----------|
| 收案日期 | `registered_on` | **yes** |
| 出生日期 | `birth_mmdd` — last 4 digits only | **yes** |
| 姓名 | `name` | **yes** |
| 地點 | `address_raw` | **yes** |
| 預訪日期 | `clinic_next_visit_on` | no |
| 核定迄日 | `authorized_until` | no |

- Locate columns **by header name**. **Fail the import loudly** if any of the four required
  headers is missing.
- **Never fall back to position** — column 5 is labelled 性別 and holds phone numbers.
- 主診斷, 身分證號, 性別, 照護階段, 機構簡稱 and 里 are **not read** and never leave the uploaded
  bytes (R13).

Spec: §4 *The six columns*, §9.

### P1-05 · ROC date conversion with per-field sanity bounds

`+1911`. Accepts `YYYMMDD` and `YYY/MM/DD`. Strip separators, `year = all but last 4`,
`month = [-4:-2]`, `day = [-2:]`, add 1911, validate as a real calendar date. Store ISO, display
民國.

**Bounds are per field, not one global range:**

| Field | Bounds |
|-------|--------|
| `registered_on` | `[today − 20y, today]` |
| `authorized_until` | `[today − 5y, today + 5y]` |
| `clinic_next_visit_on` | `[today − 1y, today + 1y]` |

A single `[today − 20y, today + 5y]` window is **not sufficient and was wrong here**: the sample's
收案日期 of 2027-06-11 falls comfortably inside it. That matters because `registered_on` seeds
cycle 1 when 預訪日期 is absent (§5.1), and a future registration date feeds
`ceil((today − registered_on)/56)` a negative numerator.

**出生日期 → last 4 digits only (MMDD).** The birth year is never read or stored. A 4-character
string, not a date.

**Reject, never coerce.** A coerced date schedules a real visit on a wrong day. A date outside its
field's bounds is treated as *unparseable*, not as valid.

Spec: §4 *Date conversion*.

### P1-06 · Address normalization

Sample forms: `三隆村興隆路316號`, `上寮(里)路212-28號`, `上寮路225之32號`, `上寮路39號之17`,
`上寮里016鄰上寮路212之2號`.

- **Prepend `高雄市大寮區`** (`settings.district_prefix`) to every address.
- **`X之Y號` and `X號之Y` are DIFFERENT addresses. Do not collapse them.** `上寮路225之32號` is
  building 225-32; `上寮路39號之17` is **unit 17 of** building 39. Both appear in the sample.
  Collapsing them sends the doctor to the wrong house — and Google will geocode the wrong one at
  `ROOFTOP` confidence, so the confidence gate will not catch it. Normalize `X之Y號` → `X-Y號`
  and leave `X號之Y` intact as a distinct form.
- **Strip 鄰.** Leave 里 embedded in the address text — R13 forbids importing the *里 column*, not
  discarding text the clinic wrote into 地點, and it aids disambiguation.
- Property-test the `之`-form distinction explicitly. It is the normalization step most likely to
  be "simplified" by a later reader.

Spec: §4 *Address normalization*.

### P1-07 · Geocoding

- **Cache-first, always.** Look up `geocode_cache` by normalized-address hash before calling
  Google. A re-plan must never hit Google for coordinates. If P0-09 found caching to be
  time-limited, key on `place_id` and re-resolve on expiry.
- **Three distinct non-success states, because they need three different human actions:**
  `pending` = not tried yet · `failed` = Google cannot resolve it, someone must correct or pin it
  · `no_address` = nobody ever gave us one, someone must ask the clinic. Collapsing these is how
  129 missing addresses become invisible.
- **Negative caching.** After 3 failed attempts (`geocode_attempts`), move to `failed` and stop
  retrying. A rural lane Google does not have would otherwise generate one call per night forever.
- **Confidence gating.** `APPROXIMATE` → `ambiguous`, not `ok`. A manual pin sets `manual`.
- **Bounds-check** against a 大寮區 bounding box (`packages/geo`); outside → `ambiguous`.
- **Editing an address resets geocoding** — `geocode_status = 'pending'`, `geocode_attempts = 0`,
  clear `lat`/`lng`/`place_id`, **including for records previously fixed by hand.** A manual pin
  is only valid for the address it was placed for.
- An address typed during review sets `address_source = 'manual'`, not `'csv'`.
- **A patient without valid coordinates is never auto-scheduled.** They appear on the exceptions
  list — never dropped silently, never placed at (0,0).

Spec: §4 *Geocoding rules*.

### P1-08 · Upload endpoint

```
POST /api/imports  →  decode, parse in memory, sha256 the raw bytes,
                      write csv_imports (status='parsed'), return rows, forget them.
```

- **Bounded: max 2 MB, max 2000 rows. Reject beyond — do not truncate.**
- Patient data never touches storage at this step. `csv_imports` is an audit row only: filename,
  sha256, byte size, uploader, encoding, counts. **No file contents, no parsed rows.**

Spec: §4 *The import flow*, §3 `csv_imports`.

### P1-09 · Review screen — two blocks, both editable

**Valid block (top).** All four required fields parsed. Missing 預訪日期 or 核定迄日 shows as an
amber cell that can be filled but does not demote the row.

**Invalid block (bottom).** Missing at least one required field; each missing field is an empty
input. **The moment a row becomes complete it moves up into the valid block.** Rows left
incomplete are never saved.

Also on the screen:

- **Live geocoding on blur** — resolved address with a green tick, amber for `APPROXIMATE` or
  outside the bounding box. Render Google's `address_formatted` back so a human who knows the
  district sees what was actually matched. Typing 129 addresses blind and discovering afterwards
  that a third failed means a second pass over all of them.
- **Duplicate badge** — any row whose 姓名 + 出生MMDD already exists among non-deleted patients is
  marked 「可能重複」 with a link to the existing record. **Advisory only** — nothing merges,
  nothing is blocked. It turns "find the duplicates" into "look at the amber rows".
- **Counts** — total, valid, invalid, filled-by-hand, possible duplicates.

Spec: §4 *The review screen*.

### P1-10 · Durability of the working set — `sessionStorage`, not React state

"In the browser" must not mean "in volatile React state." 129 of 188 sample rows need a hand-typed
地點, and this screen gets used on a phone in the field. iOS Safari evicts background tabs
aggressively; one incoming call destroys a morning of typing, and the recovery — start over — is
one nobody performs, so the roster ships partial and nobody records it as an incident.

- Mirror the working set to **`sessionStorage`**, keyed by `csv_imports.id`, written on every
  edit, cleared on Save or explicit discard.
- **`beforeunload` guard** while unsaved rows exist.
- Persistent 「尚未儲存 N 筆」 banner.
- **Incremental Save** — save what is ready, keep working on the rest. §4's no-upsert model makes
  partial saves semantically safe, so there is no reason to force one all-or-nothing commit at the
  end of a long typing session.

Spec: §4 *The import flow*.

### P1-11 · Save endpoint — server-side re-validation

```
POST /api/imports/:id/rows  →  RE-VALIDATE with the same zod schemas and sanity bounds,
                               INSERT, update csv_imports to status='saved' with real counts.
```

**Never trust the client's verdict on validity.** The endpoint is behind Access, so this is an
integrity problem rather than an external attack surface — but a UI bug, a stale tab, or a
half-applied inline edit will otherwise write a malformed `registered_on` or a five-character
`birth_mmdd`, and every downstream date computation inherits it. `NOT NULL` catches absence, not
nonsense. Reject the batch with per-row errors.

**Every saved row inserts a new patient.** No natural key, no matching, no upsert. A re-import of
the same file produces a second full set of records; the duplicate badge and the bin icon are how
that is resolved. This is deliberate — the doctor and nurse own the patient list, and the app's
job is scheduling, not identity resolution.

Writes go through the `PlanCoordinator` Durable Object (stubbed in Phase 0, real in Phase 3) —
wire the call path now even if the DO is thin.

Spec: §4 *No matching, no upsert*, §6.5.

### P1-12 · Nightly geocode sweep (partial)

Retry `geocode_status = 'pending'` patients, cache-first, honouring the 3-attempt cap. This is
item 2 of the Phase 3 nightly job; build it here because it is pure import concern and Phase 1
needs it to clear the first import's stragglers.

Spec: §5.6 item 2.

### P1-13 · Audit logging

`audit_log` rows for: import parsed, import saved, patient created, patient edited, patient soft-
deleted. `actor` is the email from the Access JWT.

Spec: §9.

---

## Acceptance criteria

- [ ] The golden fixture parses to exactly the expected output in CI, including all four HKSCS
      surnames and the `之`-form address variants.
- [ ] The 2027-06-11 收案日期 is **rejected**, and the year-3067 核定迄日 is **rejected**.
- [ ] A file missing any of the four required headers fails loudly, naming the missing header.
- [ ] `上寮路225之32號` and `上寮路39號之17` normalize to **different** strings and geocode to
      different `place_id`s.
- [ ] The real `居家11506112.csv` imports and yields the expected valid-row count; the counts panel
      matches a manual tally.
- [ ] Between upload and Save, `SELECT count(*) FROM patients` is unchanged and no table holds any
      parsed row — verified against the local D1.
- [ ] Reloading the review tab mid-edit restores every typed value from `sessionStorage`.
- [ ] Closing the tab with unsaved rows triggers the `beforeunload` guard.
- [ ] Saving half the valid rows, then the rest, produces the same result as saving all at once.
- [ ] A crafted request posting a five-character `birth_mmdd` is rejected server-side with a
      per-row error.
- [ ] Editing an address on a `manual`-pinned patient resets it to `pending` and clears the
      coordinates.
- [ ] A patient at `failed`, `no_address` and `ambiguous` each appear in a distinct exception
      bucket.
- [ ] Three consecutive geocode failures move a patient to `failed` and stop further attempts.
- [ ] `csv_imports` holds no file contents and no parsed rows.

---

## Exit gate

**The clinic's real file imports end to end, and the resulting patient list is one the clinic
recognizes.** Sit with them for that check — the roster-completeness failure is the one no amount
of technical correctness catches, and it is cheaper to find here than in Phase 7.

If open question 4 came back "no re-export with 地點", record the named owner of the ~120-address
data-entry project before closing this phase. Do not let it become an unowned assumption that
Phase 7 discovers.
