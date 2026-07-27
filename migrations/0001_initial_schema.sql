-- Migration 0001: initial schema.
-- Verbatim copy of docs/PLAN.md §3 (lines 142-428), plus this header.
-- See migrations/README.md for how it is tested.

-- Single doctor today, modelled as a table so a second one is a data change.
CREATE TABLE doctors (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  base_lat            REAL NOT NULL,        -- 大寮衛生所: route start/end
  base_lng            REAL NOT NULL,
  max_visits_per_day  INTEGER NOT NULL DEFAULT 8,
  working_days        TEXT NOT NULL DEFAULT '1,2,3,4,5',  -- ISO weekday numbers
  active              INTEGER NOT NULL DEFAULT 1
);

-- Six columns come from the CSV (§4). Everything else is derived or operational.
-- 身分證號, 性別, 主診斷, 照護階段, 機構簡稱 and 里 are NOT read and NOT stored (R13).
-- There is NO natural key. Every imported row inserts a new patient; the doctor or
-- nurse curates the list by hand (§4, §7). Duplicates are flagged, never merged.
CREATE TABLE patients (
  id                 TEXT PRIMARY KEY,      -- surrogate, the only identity
  -- Required four (R7). All NOT NULL: a record cannot exist without them.
  name               TEXT NOT NULL,         -- 姓名
  birth_mmdd         TEXT NOT NULL,         -- 出生日期 last 4 digits. A disambiguator, NOT a date
  registered_on      TEXT NOT NULL,         -- 收案日期 as ISO
  address_raw        TEXT NOT NULL,         -- 地點 as it appeared, or as typed in review
  -- Optional two.
  clinic_next_visit_on TEXT,                -- 預訪日期 as ISO; seeds cycle 1 (§5.1)
  authorized_until   TEXT,                  -- 核定迄日 as ISO; hard block once passed (R12)
  -- Derived.
  address_source     TEXT NOT NULL DEFAULT 'csv',  -- csv | manual
  address_normalized TEXT,                  -- prefix added, 之/-/鄰 normalized (§4)
  address_formatted  TEXT,                  -- Google's normalized form
  place_id           TEXT,
  lat                REAL,
  lng                REAL,
  geocode_status     TEXT NOT NULL DEFAULT 'pending'
                     CHECK (geocode_status IN
                       ('pending','ok','ambiguous','failed','no_address','manual')),
                     -- 'no_address' and 'failed' are distinct from 'pending': three
                     -- different human actions, so the sweep must not conflate them (§4).
  geocode_confidence TEXT,                  -- ROOFTOP | RANGE_INTERPOLATED | APPROXIMATE ...
  geocode_attempts   INTEGER NOT NULL DEFAULT 0,   -- negative caching (§4)
  last_geocode_at    TEXT,
  notes              TEXT,
  deleted_at         TEXT,                  -- soft delete via the bin icon (§7)
  deleted_by         TEXT,
  delete_reason      TEXT,                  -- duplicate | discharged | deceased | error
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (length(birth_mmdd) = 4),
  CHECK (address_source IN ('csv','manual'))
);
-- The planner reads through this and nothing else.
-- Columns are ENUMERATED deliberately: SQLite expands SELECT * at view-creation time, so
-- under the expand-only migration rule (§11.4) a later ADD COLUMN would silently not appear
-- here, producing a baffling "my new column is undefined in the planner" bug. Any migration
-- touching `patients` must drop and recreate this view.
CREATE VIEW schedulable_patients AS
  SELECT id, name, birth_mmdd, registered_on, address_raw, clinic_next_visit_on,
         authorized_until, address_normalized, address_formatted, place_id, lat, lng,
         geocode_status, geocode_confidence
  FROM patients
  WHERE deleted_at IS NULL AND geocode_status IN ('ok','manual');

CREATE INDEX idx_patients_sched ON patients(deleted_at, geocode_status);
-- Powers the advisory duplicate badge (§4). Not a uniqueness constraint.
-- deleted_at is in the key because the badge query filters on it.
CREATE INDEX idx_patients_dupe  ON patients(name, birth_mmdd, deleted_at);

CREATE TABLE visits (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT NOT NULL REFERENCES patients(id),
  doctor_id      TEXT NOT NULL REFERENCES doctors(id),
  visit_type     TEXT NOT NULL CHECK (visit_type IN ('prescription','general')),
  note           TEXT,                      -- free-text purpose, shown on the LINE card (§8)
  cycle_index    INTEGER,                   -- k, for prescription visits (NULL for general)
  attempt_no     INTEGER NOT NULL DEFAULT 1,-- 2nd+ attempt at the same cycle after a miss
  due_on         TEXT,                      -- NULL for general
  scheduled_on   TEXT NOT NULL,
  sequence_no    INTEGER,                   -- 1..8, stop order within the day
  status         TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned','completed','missed','cancelled','skipped')),
  auto_completed INTEGER NOT NULL DEFAULT 0,-- closed by the nightly job, not by a tap (§5.6)
  locked         INTEGER NOT NULL DEFAULT 0,-- pinned; optimizer plans around it, never moves it
  lock_reason    TEXT,
  skip_reason    TEXT,                      -- required when status = 'skipped'
  override_ack   TEXT,                      -- JSON: violation codes explicitly accepted (§6.2)
  row_version    INTEGER NOT NULL DEFAULT 1,-- optimistic concurrency (§6.5)
  completed_on   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- PARTIAL unique index, not a table constraint. A plain
-- UNIQUE(patient_id, visit_type, cycle_index) would make the two most common non-happy
-- paths structurally impossible: §5.1 ("a missed visit does not advance the cycle — the
-- patient stays due and becomes mandatory on the next run that can reach them") and §6.4
-- ("cancelling does not cancel the obligation — the patient becomes a candidate again")
-- both require a SECOND row for the same (patient, 'prescription', k). Under a table
-- constraint the very next commit run throws on that INSERT.
-- Constraining only LIVE obligations keeps generation idempotent while preserving the
-- missed/cancelled attempt as an auditable row.
CREATE UNIQUE INDEX uq_visits_cycle_live ON visits(patient_id, visit_type, cycle_index)
  WHERE cycle_index IS NOT NULL AND status IN ('planned','completed');
-- General visits carry cycle_index IS NULL and are excluded by the WHERE clause, so they
-- are unconstrained. This is deliberate, not an accident of NULL semantics.

CREATE INDEX idx_visits_day     ON visits(doctor_id, scheduled_on, status);
CREATE INDEX idx_visits_patient ON visits(patient_id, scheduled_on);
CREATE INDEX idx_visits_cycle   ON visits(patient_id, visit_type, cycle_index, status);

-- Denormalized per-day summary for the LINE bot.
CREATE TABLE plan_days (
  doctor_id       TEXT NOT NULL,
  day             TEXT NOT NULL,
  visit_count     INTEGER NOT NULL,
  route_km        REAL,
  route_minutes   INTEGER,
  route_source    TEXT,                     -- haversine | google_routes
  committed       INTEGER NOT NULL DEFAULT 0, -- set by a commit run (§5.3)
  committed_at    TEXT,
  row_version     INTEGER NOT NULL DEFAULT 1, -- bumped on ANY change to the day, so a
                                              -- validation that merely READ this day's
                                              -- capacity has something to guard against
  PRIMARY KEY (doctor_id, day)
);

-- One row per job invocation (§5.3). A run commits one or more days.
CREATE TABLE plan_runs (
  id              TEXT PRIMARY KEY,
  trigger         TEXT NOT NULL,            -- cron | manual | catchup | urgent
  run_date        TEXT NOT NULL,            -- local (Asia/Taipei) date the job fired
  target_days     TEXT,                     -- JSON array; a run may commit several (R9)
  started_at      TEXT NOT NULL,
  lease_until     TEXT,                     -- staleness: a run is reclaimable past this
  finished_at     TEXT,
  status          TEXT NOT NULL CHECK (status IN ('running','ok','failed','skipped')),
  error_text      TEXT,                     -- populated by the top-level catch (R15)
  mandatory_count INTEGER,                  -- last chance
  optional_count  INTEGER,                  -- pulled forward to fill the day
  appended_count  INTEGER,                  -- placed on an earlier committed day (§5.3)
  blocked_count   INTEGER NOT NULL DEFAULT 0, -- last-chance but failed a block rule (§5.3)
  overdue_count   INTEGER NOT NULL DEFAULT 0, -- due < reachable window; urgent queue (§5.3)
  unplaced_count  INTEGER NOT NULL DEFAULT 0, -- mandatory that did NOT fit — alert
  route_km        REAL,
  gap_alert       TEXT,                     -- JSON: working days still uncommitted in range
  stats_json      TEXT,                     -- the decision trace (§5.3)
  UNIQUE(id)
);
-- NOT UNIQUE(target_day). That constraint PREVENTED retries rather than enabling them: a
-- run that inserted its row and then crashed left status='running' occupying the slot
-- forever, and a manual retry violated the constraint. Idempotency comes from
-- plan_days.committed and from uq_visits_cycle_live, which is where it belongs.
CREATE INDEX idx_plan_runs_date ON plan_runs(run_date, status);

-- Audit trail ONLY: no patient data, no file contents, no parsed rows.
-- One row is written when the Worker parses an upload, and updated when the user saves.
CREATE TABLE csv_imports (
  id           TEXT PRIMARY KEY,
  filename     TEXT NOT NULL,
  sha256       TEXT NOT NULL,                -- of the raw uploaded bytes
  byte_size    INTEGER NOT NULL,
  uploaded_by  TEXT NOT NULL,
  encoding     TEXT,                         -- detected: big5 | utf-8 | ...
  row_count    INTEGER,                      -- rows in the file
  valid_count  INTEGER,                      -- valid at parse time
  saved_count  INTEGER,                      -- actually written on Save
  filled_count INTEGER,                      -- rows completed by hand during review
  status       TEXT NOT NULL,                -- parsed | saved | abandoned
  created_at   TEXT NOT NULL,
  saved_at     TEXT
);

CREATE TABLE geocode_cache (
  address_hash      TEXT PRIMARY KEY,        -- sha256 of normalized address
  place_id          TEXT,
  lat REAL, lng REAL,
  address_formatted TEXT,
  confidence        TEXT,
  fetched_at        TEXT NOT NULL
);

-- LINE recipients. Adding the bot creates a pending row; the person is approved by
-- typing a code generated in the web app (§8.1). Unapproved users receive nothing.
CREATE TABLE line_recipients (
  line_user_id    TEXT PRIMARY KEY,
  display_name    TEXT,                       -- self-chosen; NEVER an authenticator
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','blocked')),
  doctor_id       TEXT REFERENCES doctors(id),
  approval_code   TEXT,                       -- 6 digits, generated in the web app
  code_expires_at TEXT,                       -- now + 10 minutes
  code_attempts   INTEGER NOT NULL DEFAULT 0, -- 3 strikes, then the code is burned
  approved_by     TEXT,
  approved_at     TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT
);

-- Days the doctor does not work, beyond weekends and national holidays: leave, illness,
-- conferences. Absence days are non-working for planning AND suppress auto-completion —
-- without this, a week of leave silently converts ~23 planned visits into ~23 fabricated
-- completed records, each of which then anchors the next 56-day cycle (R16, §5.6).
CREATE TABLE doctor_absences (
  doctor_id TEXT NOT NULL REFERENCES doctors(id),
  day       TEXT NOT NULL,
  reason    TEXT,
  PRIMARY KEY (doctor_id, day)
);

-- LINE webhook replay protection (§8.6). An HMAC signature is valid forever, and LINE
-- legitimately redelivers on timeout. Idempotent status handling stops a repeat of the
-- SAME transition, but not a replayed 完成 arriving after a corrective 未遇.
CREATE TABLE line_events (
  event_id   TEXT PRIMARY KEY,   -- LINE's webhookEventId
  received_at TEXT NOT NULL
);

-- Pairwise road distances, keyed on Place IDs (§5.3). The same patient pairs recur every
-- cycle in a fixed roster, so the matrix warms within weeks and day SELECTION can use road
-- distance rather than haversine — which matters in a district cut by 高屏溪 and 台88.
-- ASYMMETRIC: one-way streets and divided highways mean d(i,j) != d(j,i).
CREATE TABLE road_distances (
  from_place_id TEXT NOT NULL,
  to_place_id   TEXT NOT NULL,
  meters        INTEGER NOT NULL,
  seconds       INTEGER NOT NULL,
  fetched_at    TEXT NOT NULL,
  PRIMARY KEY (from_place_id, to_place_id)
);

-- Deploy log. Exists so the D1 Time Travel bookmark — which IS the rollback plan (§11.3) —
-- lives somewhere durable and queryable rather than only in a GitHub Actions log that
-- expires and is unreadable at 2 a.m.
CREATE TABLE deploys (
  id            TEXT PRIMARY KEY,
  commit_sha    TEXT NOT NULL,
  d1_bookmark   TEXT,
  deployed_at   TEXT NOT NULL,
  deployed_by   TEXT
);

-- Short-lived conversation state for the LINE navigation tree (§8.3). Exists only so a
-- typed reply can be matched to the question the server just asked. Holds NO patient data.
CREATE TABLE line_sessions (
  line_user_id TEXT PRIMARY KEY REFERENCES line_recipients(line_user_id),
  awaiting     TEXT NOT NULL,      -- date_for_schedule | date_for_history | patient_name
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT NOT NULL,      -- now + 5 minutes
  created_at   TEXT NOT NULL
);

CREATE TABLE holidays (day TEXT PRIMARY KEY, label TEXT);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  tier       TEXT NOT NULL CHECK (tier IN ('structural','operational'))
);
-- STRUCTURAL — read-only in the UI, changed only by migration. These define the
-- last-chance invariant, the freeze horizon and the gap-audit window simultaneously.
-- Editing commit_lead_days from 14 to 10 on a Tuesday afternoon silently orphans every
-- patient whose last chance falls in the discontinuity, and the gap audit then
-- "correctly" reports no gaps over the new, shorter window.
--   cycle_days=56, early_window_days=5, late_window_days=5, general_cap_per_28d=2,
--   commit_lead_days=14, anchor_mode=visit   -- 'registration' is the alternative (§5.1)
--
-- OPERATIONAL — editable on the Settings screen (§7).
--   notice_days=3, min_day_batch=2, day_open_penalty_km=8,
--   due_deviation_km_per_day=1.5,   -- γ: km-equivalent cost of one day off due
--   late_tiebreak_km=0.5,           -- λ: flat km penalty for landing on/after due
--   route_cost_spike_km=5, max_route_minutes=300, horizon_days=120,
--   district_prefix='高雄市大寮區', expected_roster_size=NULL,
--   auto_complete_enabled=1, notifications_enabled=1
--
-- γ and λ are in KILOMETRES so the §5.3 objective is dimensionally consistent — the
-- previous formula mixed km against (undefined units)·days, leaving the single most
-- important tuning knob in the system undefined. Initial values come from the §5.8
-- simulation, not from intuition.
--
-- The whole table is parsed through a zod schema with defaults at load, and load FAILS
-- LOUDLY on an unknown key or an unparseable value. A key/value table of TEXT will
-- otherwise turn one typo into a NaN propagating silently through the cost function.

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail_json TEXT
);
