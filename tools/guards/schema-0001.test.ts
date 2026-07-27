// R1–R7 and Scenarios 1–8 of
// docs/plans/00-foundations/work/T05-migration-0001/acceptance.md.
//
// Every structural criterion is asserted against `sqlite_master` / `PRAGMA` after applying
// `migrations/0001_initial_schema.sql` to a fresh in-memory `node:sqlite` database — never by
// reading the .sql file. The two exceptions are R6 and R7, which are assertions about the file
// itself and say so. Every test builds its own database: no shared state, because a CHECK test
// that leaves a half-inserted row behind would make the next test's failure unattributable.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(repoRoot, 'migrations/0001_initial_schema.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migrationSql);
  return db;
}

function objectSql(db: DatabaseSync, name: string): string | null {
  const row = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as
    | { sql: string | null }
    | undefined;
  return row?.sql ?? null;
}

function countRows(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

// --- Fixture builders. Every value below is invented and synthetic — none derives from
// 居家11506112.csv, which is never read by anything in this file. ---

function insertDoctor(db: DatabaseSync, overrides: Partial<{ id: string }> = {}): string {
  const id = overrides.id ?? randomUUID();
  db.prepare('INSERT INTO doctors (id, name, base_lat, base_lng) VALUES (?, ?, ?, ?)').run(
    id,
    'Dr. 測試醫師',
    22.6273,
    120.4653,
  );
  return id;
}

interface PatientFields {
  id: string;
  name: string;
  birth_mmdd: string;
  registered_on: string;
  address_raw: string;
  address_source: string;
  geocode_status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function insertPatient(db: DatabaseSync, overrides: Partial<PatientFields> = {}): string {
  const fields: PatientFields = {
    id: randomUUID(),
    name: '測試患者',
    birth_mmdd: '0101',
    registered_on: '2026-01-01',
    address_raw: '測試路1號',
    address_source: 'csv',
    geocode_status: 'pending',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO patients
       (id, name, birth_mmdd, registered_on, address_raw, address_source, geocode_status,
        deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fields.id,
    fields.name,
    fields.birth_mmdd,
    fields.registered_on,
    fields.address_raw,
    fields.address_source,
    fields.geocode_status,
    fields.deleted_at,
    fields.created_at,
    fields.updated_at,
  );
  return fields.id;
}

interface VisitFields {
  id: string;
  patient_id: string;
  doctor_id: string;
  visit_type: string;
  cycle_index: number | null;
  attempt_no: number;
  status: string;
  scheduled_on: string;
  created_at: string;
  updated_at: string;
}

function insertVisit(
  db: DatabaseSync,
  overrides: Partial<VisitFields> & { patient_id: string; doctor_id: string },
): string {
  const fields: VisitFields = {
    id: randomUUID(),
    visit_type: 'general',
    cycle_index: null,
    attempt_no: 1,
    status: 'planned',
    scheduled_on: '2026-02-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO visits
       (id, patient_id, doctor_id, visit_type, cycle_index, attempt_no, status, scheduled_on,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fields.id,
    fields.patient_id,
    fields.doctor_id,
    fields.visit_type,
    fields.cycle_index,
    fields.attempt_no,
    fields.status,
    fields.scheduled_on,
    fields.created_at,
    fields.updated_at,
  );
  return fields.id;
}

function insertPlanRun(
  db: DatabaseSync,
  overrides: Partial<{ id: string; trigger: string; run_date: string; started_at: string; status: string }> = {},
): string {
  const fields = {
    id: randomUUID(),
    trigger: 'cron',
    run_date: '2026-08-03',
    started_at: '2026-08-03T00:00:00Z',
    status: 'ok',
    ...overrides,
  };
  db.prepare(
    'INSERT INTO plan_runs (id, trigger, run_date, started_at, status) VALUES (?, ?, ?, ?, ?)',
  ).run(fields.id, fields.trigger, fields.run_date, fields.started_at, fields.status);
  return fields.id;
}

function insertLineRecipient(
  db: DatabaseSync,
  overrides: Partial<{ line_user_id: string; status: string; first_seen_at: string }> = {},
): string {
  const fields = {
    line_user_id: randomUUID(),
    status: 'pending',
    first_seen_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
  db.prepare(
    'INSERT INTO line_recipients (line_user_id, status, first_seen_at) VALUES (?, ?, ?)',
  ).run(fields.line_user_id, fields.status, fields.first_seen_at);
  return fields.line_user_id;
}

function insertSetting(
  db: DatabaseSync,
  overrides: Partial<{ key: string; value: string; tier: string }> = {},
): void {
  const fields = { key: 'cycle_days', value: '56', tier: 'structural', ...overrides };
  db.prepare('INSERT INTO settings (key, value, tier) VALUES (?, ?, ?)').run(
    fields.key,
    fields.value,
    fields.tier,
  );
}

describe('R1 — exactly sixteen tables exist, compared as a set', () => {
  it('the created table set matches exactly in both directions', () => {
    const db = freshDb();
    const EXPECTED = new Set([
      'doctors',
      'patients',
      'visits',
      'plan_days',
      'plan_runs',
      'csv_imports',
      'geocode_cache',
      'line_recipients',
      'doctor_absences',
      'line_events',
      'road_distances',
      'deploys',
      'line_sessions',
      'holidays',
      'settings',
      'audit_log',
    ]);
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const actual = new Set(rows.map((row) => row.name));

    for (const name of EXPECTED) {
      expect(actual.has(name), `expected table "${name}" to exist`).toBe(true);
    }
    // The other direction: an unexpected seventeenth table must fail this test.
    for (const name of actual) {
      expect(EXPECTED.has(name), `unexpected table "${name}"`).toBe(true);
    }
    expect(actual.size).toBe(EXPECTED.size);
    db.close();
  });
});

describe('R2 — schedulable_patients enumerates all fourteen columns, never SELECT *', () => {
  it('the stored view SQL names every column and contains no SELECT *', () => {
    const db = freshDb();
    const sql = objectSql(db, 'schedulable_patients');
    expect(sql).not.toBeNull();
    const columns = [
      'id',
      'name',
      'birth_mmdd',
      'registered_on',
      'address_raw',
      'clinic_next_visit_on',
      'authorized_until',
      'address_normalized',
      'address_formatted',
      'place_id',
      'lat',
      'lng',
      'geocode_status',
      'geocode_confidence',
    ];
    for (const column of columns) {
      expect(sql, `expected column "${column}" in the view SQL`).toMatch(
        new RegExp(`\\b${column}\\b`),
      );
    }
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    db.close();
  });
});

describe('R3 — uq_visits_cycle_live is a PARTIAL unique index, not a table constraint', () => {
  it('its stored SQL contains the exact WHERE clause', () => {
    const db = freshDb();
    const sql = objectSql(db, 'uq_visits_cycle_live');
    expect(sql).not.toBeNull();
    expect(sql).toContain("WHERE cycle_index IS NOT NULL AND status IN ('planned','completed')");
    db.close();
  });
});

describe('R4 — all six named indexes exist', () => {
  const EXPECTED_INDEXES = [
    'idx_patients_sched',
    'idx_patients_dupe',
    'idx_visits_day',
    'idx_visits_patient',
    'idx_visits_cycle',
    'idx_plan_runs_date',
  ];

  it.each(EXPECTED_INDEXES)('%s exists', (name) => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(name);
    expect(row, `expected index "${name}" to exist`).toBeDefined();
    db.close();
  });
});

// R5 — all eight CHECK constraints — is proven behaviourally by Scenario 6 below, not by
// string-matching the DDL. See the acceptance.md evidence table.

// DO NOT WEAKEN THIS CHECK. Measured in validation-02 (2026-07-26) by running every mutation
// against all 42 assertions in this file: seven defect classes are caught by R6 and by NOTHING
// ELSE — a changed column type, a dropped NOT NULL, a changed DEFAULT, a CHECK value list
// WIDENED by one entry, an index built on the wrong columns under the right name, a narrowed
// PRIMARY KEY, and a column reordered within a table. B2a/B2b/R7b are a strong net for added or
// missing objects and columns, but they never look at a column's type, default or nullability,
// nor at an index's actual key list; and Scenario 6 only proves the OLD invalid values are still
// rejected, never that the allowed set is exactly the intended one.
//
// So: loosening this to ignore whitespace, or scoping it to part of §3, silently reopens all
// seven. If it becomes inconvenient, the answer is to fix docs/PLAN.md §3 or the migration until
// they agree again — not to relax the comparison.
describe("R6 — the migration is a verbatim, contiguous copy of §3's fenced sql block", () => {
  const planText = readFileSync(path.join(repoRoot, 'docs/PLAN.md'), 'utf8');
  const planLines = planText.split('\n');

  // Anchored to the "## 3. Data model" heading first, THEN the fence after it — not the
  // first ```sql fence anywhere in the document. An illustrative SQL example added anywhere
  // above §3 in a later edit must not silently become what this guard validates.
  const headingIdx = planLines.findIndex((line) => line.trim() === '## 3. Data model');

  function extractSection3(): { startIdx: number; lines: string[] } {
    expect(headingIdx, 'expected a "## 3. Data model" heading in docs/PLAN.md').toBeGreaterThanOrEqual(0);
    const startIdx = planLines.findIndex((line, i) => i > headingIdx && line.trim() === '```sql');
    expect(startIdx, 'expected a ```sql fence after the §3 heading').toBeGreaterThanOrEqual(0);
    const endIdx = planLines.findIndex((line, i) => i > startIdx && line.trim() === '```');
    expect(endIdx, 'expected a closing ``` fence after the §3 sql fence').toBeGreaterThan(startIdx);
    return { startIdx, lines: planLines.slice(startIdx + 1, endIdx) };
  }

  it('the extraction finds a real §3 block, not a stub', () => {
    const { lines: section3Lines } = extractSection3();

    // Sanity check #1: a guard that cannot tell it is guarding the wrong thing is not a
    // guard. §3 runs to hundreds of lines; a two-line stub must be an impossible pass, not
    // merely an unlikely one.
    expect(
      section3Lines.length,
      'the extracted §3 block is suspiciously short to be the real data model section',
    ).toBeGreaterThan(200);

    // Sanity check #2: sentinels from both the start and the end of §3, so a block that is
    // merely long (but wrong) still fails.
    const blockText = section3Lines.join('\n');
    expect(blockText, 'missing the start-of-§3 sentinel').toContain('CREATE TABLE doctors (');
    expect(blockText, 'missing the end-of-§3 sentinel').toContain('CREATE TABLE audit_log (');
  });

  it('the §3 block appears in the migration as one contiguous, byte-identical substring', () => {
    const { startIdx, lines: section3Lines } = extractSection3();
    const blockText = section3Lines.join('\n');

    const contained = migrationSql.includes(blockText);
    let message = 'expected the migration to contain §3 as one contiguous block, blank lines included';

    if (!contained) {
      // Diagnose rather than just fail: report the first differing line, on both sides, so
      // whoever reads this is pointed at the real defect instead of an unrelated statement
      // hundreds of lines away. Anchor on §3's first line so a duplicate line elsewhere in
      // the migration cannot mislead the diagnosis the way the old scan did.
      const migrationLines = migrationSql.split('\n');
      const anchorLine = section3Lines[0] ?? '';
      let migStart = migrationLines.indexOf(anchorLine);
      if (migStart === -1) migStart = 0;

      let firstDiff = 0;
      const maxLen = Math.max(section3Lines.length, migrationLines.length - migStart);
      for (; firstDiff < maxLen; firstDiff++) {
        if (section3Lines[firstDiff] !== migrationLines[migStart + firstDiff]) break;
      }
      const planLineNo = startIdx + 2 + firstDiff; // 1-indexed docs/PLAN.md line number
      const migLineNo = migStart + firstDiff + 1; // 1-indexed migration line number
      message =
        `§3 is not contained in the migration as a contiguous block.\n` +
        `  first differing line — docs/PLAN.md:${planLineNo}: ` +
        `${JSON.stringify(section3Lines[firstDiff] ?? '<end of §3>')}\n` +
        `  first differing line — migration:${migLineNo}: ` +
        `${JSON.stringify(migrationLines[migStart + firstDiff] ?? '<end of migration>')}`;
    }

    expect(contained, message).toBe(true);
  });
});

// Amendment — 2026-07-26 (acceptance.md): the original R7 banned these six strings outright,
// which contradicted R6's mandate to carry §3 verbatim — §3 L155 names all six precisely to
// DECLARE that they are not read and not stored:
//   -- 身分證號, 性別, 主診斷, 照護階段, 機構簡稱 and 里 are NOT read and NOT stored (R13).
// Banning that line would forbid the compliance declaration itself. R7a therefore confines the
// ban to non-comment text; R7b makes the actual guarantee (no seventh column, whatever it is
// named) mechanical instead. Anyone tempted to "tighten" R7a back into a blanket substring ban:
// that was tried, and it fails on §3's own declaration — see the amendment for the full story.
describe('R7a — the banned names are confined to comments, never executable DDL', () => {
  const BANNED = ['身分證號', '性別', '主診斷', '照護階段', '機構簡稱', '里'];

  // Strips both whole `--`-led lines and trailing `--` comments after real content. The
  // migration in this repo has 57 lines carrying a trailing `--` comment (every inline note
  // beside a column), so trailing comments cannot be skipped: a future one naming 里 — the
  // standard Taiwanese village/neighbourhood unit, genuinely likely in future address
  // commentary — would otherwise sit in text this function treats as executable and fail R7a
  // for the wrong reason. This is not a real SQL parser: it splits on the first `--` on each
  // line, which is only safe because no `--` appears inside a string literal anywhere in this
  // migration (verified by inspection). If that ever changes, this needs a real parser instead.
  function stripCommentLines(sql: string): string {
    return sql
      .split('\n')
      .map((line) => {
        const idx = line.indexOf('--');
        return idx === -1 ? line : line.slice(0, idx);
      })
      .join('\n');
  }

  const executableSql = stripCommentLines(migrationSql);

  it.each(BANNED)('"%s" does not appear outside a -- comment line', (banned) => {
    expect(executableSql).not.toContain(banned);
  });
});

describe("R7b — patients has exactly §3's twenty-three columns, compared as a set in both directions", () => {
  it('PRAGMA table_info(patients) matches the hardcoded list exactly', () => {
    const db = freshDb();
    // Hardcoded literally, per the amendment: derived from §3 by eye, not computed from the
    // migration file or from docs/PLAN.md — a test that derives its expectation from the thing
    // it is testing would prove nothing.
    const EXPECTED = new Set([
      'id',
      'name',
      'birth_mmdd',
      'registered_on',
      'address_raw',
      'clinic_next_visit_on',
      'authorized_until',
      'address_source',
      'address_normalized',
      'address_formatted',
      'place_id',
      'lat',
      'lng',
      'geocode_status',
      'geocode_confidence',
      'geocode_attempts',
      'last_geocode_at',
      'notes',
      'deleted_at',
      'deleted_by',
      'delete_reason',
      'created_at',
      'updated_at',
    ]);
    expect(EXPECTED.size).toBe(23);

    const rows = db.prepare("PRAGMA table_info('patients')").all() as { name: string }[];
    const actual = new Set(rows.map((row) => row.name));

    for (const name of EXPECTED) {
      expect(actual.has(name), `expected column "${name}" on patients`).toBe(true);
    }
    // The other direction: an unnamed seventh (or seventeenth) column must fail this test,
    // whatever it is called — this is what makes the amendment strictly stronger than the
    // string ban it replaces.
    for (const name of actual) {
      expect(EXPECTED.has(name), `unexpected column "${name}" on patients`).toBe(true);
    }
    expect(actual.size).toBe(EXPECTED.size);
    db.close();
  });
});

describe('B2a — the complete sqlite_master object set matches §3 exactly, in both directions', () => {
  it('catches an extra table, index, view or trigger in one assertion', () => {
    const db = freshDb();
    // Hardcoded from §3: 16 tables, 1 view, and 7 indexes (6 named plus the partial unique
    // index uq_visits_cycle_live). No triggers. sqlite_autoindex_* rows are excluded below —
    // SQLite generates one for plan_runs' redundant UNIQUE(id), which is not a §3 object.
    const EXPECTED = new Set([
      'table:doctors',
      'table:patients',
      'table:visits',
      'table:plan_days',
      'table:plan_runs',
      'table:csv_imports',
      'table:geocode_cache',
      'table:line_recipients',
      'table:doctor_absences',
      'table:line_events',
      'table:road_distances',
      'table:deploys',
      'table:line_sessions',
      'table:holidays',
      'table:settings',
      'table:audit_log',
      'view:schedulable_patients',
      'index:idx_patients_sched',
      'index:idx_patients_dupe',
      'index:uq_visits_cycle_live',
      'index:idx_visits_day',
      'index:idx_visits_patient',
      'index:idx_visits_cycle',
      'index:idx_plan_runs_date',
    ]);

    const rows = db
      .prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_autoindex_%'")
      .all() as { type: string; name: string }[];
    const actual = new Set(rows.map((row) => `${row.type}:${row.name}`));

    for (const key of EXPECTED) {
      expect(actual.has(key), `expected schema object "${key}" to exist`).toBe(true);
    }
    // The other direction: an extra index, view, trigger or table — of any name — fails here.
    for (const key of actual) {
      expect(EXPECTED.has(key), `unexpected schema object "${key}"`).toBe(true);
    }
    expect(actual.size).toBe(EXPECTED.size);
    db.close();
  });
});

describe('B2b — the remaining fifteen tables have exactly their §3 columns, both directions', () => {
  // Hardcoded literally from §3, by eye — same discipline as R7b's amendment: derived from
  // the migration file or from docs/PLAN.md, a test proves nothing about the thing it tests.
  // patients is covered separately by R7b and is not repeated here.
  const EXPECTED_COLUMNS: Record<string, string[]> = {
    doctors: ['id', 'name', 'base_lat', 'base_lng', 'max_visits_per_day', 'working_days', 'active'],
    visits: [
      'id',
      'patient_id',
      'doctor_id',
      'visit_type',
      'note',
      'cycle_index',
      'attempt_no',
      'due_on',
      'scheduled_on',
      'sequence_no',
      'status',
      'auto_completed',
      'locked',
      'lock_reason',
      'skip_reason',
      'override_ack',
      'row_version',
      'completed_on',
      'created_at',
      'updated_at',
    ],
    plan_days: [
      'doctor_id',
      'day',
      'visit_count',
      'route_km',
      'route_minutes',
      'route_source',
      'committed',
      'committed_at',
      'row_version',
    ],
    plan_runs: [
      'id',
      'trigger',
      'run_date',
      'target_days',
      'started_at',
      'lease_until',
      'finished_at',
      'status',
      'error_text',
      'mandatory_count',
      'optional_count',
      'appended_count',
      'blocked_count',
      'overdue_count',
      'unplaced_count',
      'route_km',
      'gap_alert',
      'stats_json',
    ],
    csv_imports: [
      'id',
      'filename',
      'sha256',
      'byte_size',
      'uploaded_by',
      'encoding',
      'row_count',
      'valid_count',
      'saved_count',
      'filled_count',
      'status',
      'created_at',
      'saved_at',
    ],
    geocode_cache: [
      'address_hash',
      'place_id',
      'lat',
      'lng',
      'address_formatted',
      'confidence',
      'fetched_at',
    ],
    line_recipients: [
      'line_user_id',
      'display_name',
      'status',
      'doctor_id',
      'approval_code',
      'code_expires_at',
      'code_attempts',
      'approved_by',
      'approved_at',
      'first_seen_at',
      'last_seen_at',
    ],
    doctor_absences: ['doctor_id', 'day', 'reason'],
    line_events: ['event_id', 'received_at'],
    road_distances: ['from_place_id', 'to_place_id', 'meters', 'seconds', 'fetched_at'],
    deploys: ['id', 'commit_sha', 'd1_bookmark', 'deployed_at', 'deployed_by'],
    line_sessions: ['line_user_id', 'awaiting', 'attempts', 'expires_at', 'created_at'],
    holidays: ['day', 'label'],
    settings: ['key', 'value', 'tier'],
    audit_log: ['id', 'at', 'actor', 'action', 'entity', 'entity_id', 'detail_json'],
  };

  it.each(Object.entries(EXPECTED_COLUMNS))(
    '%s has exactly its §3 columns, both directions',
    (table, columns) => {
      const db = freshDb();
      const EXPECTED = new Set(columns);
      const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      const actual = new Set(rows.map((row) => row.name));

      for (const name of EXPECTED) {
        expect(actual.has(name), `expected column "${name}" on ${table}`).toBe(true);
      }
      for (const name of actual) {
        expect(EXPECTED.has(name), `unexpected column "${name}" on ${table}`).toBe(true);
      }
      expect(actual.size).toBe(EXPECTED.size);
      db.close();
    },
  );
});

describe('Scenario 1 — a second live obligation for the same prescription cycle is rejected', () => {
  it('the second insert throws and visits keeps exactly one row', () => {
    const db = freshDb();
    const doctorId = insertDoctor(db);
    const patientId = insertPatient(db);
    insertVisit(db, {
      patient_id: patientId,
      doctor_id: doctorId,
      visit_type: 'prescription',
      cycle_index: 3,
      status: 'planned',
    });

    expect(() =>
      insertVisit(db, {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_type: 'prescription',
        cycle_index: 3,
        status: 'planned',
      }),
    ).toThrow(/constraint/i);
    expect(countRows(db, 'visits')).toBe(1);
    db.close();
  });
});

describe('Scenario 2 — a missed attempt plus a live one for the same cycle is accepted', () => {
  it('both inserts succeed, leaving two rows for that (patient, prescription, cycle)', () => {
    const db = freshDb();
    const doctorId = insertDoctor(db);
    const patientId = insertPatient(db);
    insertVisit(db, {
      patient_id: patientId,
      doctor_id: doctorId,
      visit_type: 'prescription',
      cycle_index: 3,
      status: 'missed',
    });

    expect(() =>
      insertVisit(db, {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_type: 'prescription',
        cycle_index: 3,
        status: 'planned',
        attempt_no: 2,
      }),
    ).not.toThrow();

    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM visits WHERE patient_id = ? AND visit_type = 'prescription' AND cycle_index = 3",
      )
      .get(patientId) as { n: number };
    expect(row.n).toBe(2);
    db.close();
  });
});

describe('Scenario 3 — a cancelled attempt plus a live one for the same cycle is accepted', () => {
  it('both inserts succeed', () => {
    const db = freshDb();
    const doctorId = insertDoctor(db);
    const patientId = insertPatient(db);
    insertVisit(db, {
      patient_id: patientId,
      doctor_id: doctorId,
      visit_type: 'prescription',
      cycle_index: 3,
      status: 'cancelled',
    });

    expect(() =>
      insertVisit(db, {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_type: 'prescription',
        cycle_index: 3,
        status: 'planned',
        attempt_no: 2,
      }),
    ).not.toThrow();

    expect(countRows(db, 'visits')).toBe(2);
    db.close();
  });
});

describe('Scenario 4 — general visits (cycle_index IS NULL) are unconstrained', () => {
  it('two general visits for the same patient both succeed', () => {
    const db = freshDb();
    const doctorId = insertDoctor(db);
    const patientId = insertPatient(db);
    insertVisit(db, {
      patient_id: patientId,
      doctor_id: doctorId,
      visit_type: 'general',
      cycle_index: null,
      status: 'planned',
    });

    expect(() =>
      insertVisit(db, {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_type: 'general',
        cycle_index: null,
        status: 'planned',
      }),
    ).not.toThrow();

    expect(countRows(db, 'visits')).toBe(2);
    db.close();
  });
});

describe('Scenario 5 — a crashed plan run can be retried on the same date', () => {
  it('a running row and a second ok row on the same run_date both succeed', () => {
    const db = freshDb();
    insertPlanRun(db, { run_date: '2026-08-03', status: 'running' });

    expect(() => insertPlanRun(db, { run_date: '2026-08-03', status: 'ok' })).not.toThrow();

    expect(countRows(db, 'plan_runs')).toBe(2);
    db.close();
  });
});

describe('Scenario 6 — each CHECK constraint rejects a violating row and writes nothing', () => {
  interface Case {
    name: string;
    table: string;
    attempt: (db: DatabaseSync) => void;
  }

  const cases: Case[] = [
    {
      name: "patients.geocode_status = 'unknown'",
      table: 'patients',
      attempt: (db) => {
        insertPatient(db, { geocode_status: 'unknown' });
      },
    },
    {
      name: "patients.birth_mmdd = '123' (length != 4)",
      table: 'patients',
      attempt: (db) => {
        insertPatient(db, { birth_mmdd: '123' });
      },
    },
    {
      name: "patients.address_source = 'api'",
      table: 'patients',
      attempt: (db) => {
        insertPatient(db, { address_source: 'api' });
      },
    },
    {
      name: "visits.visit_type = 'urgent'",
      table: 'visits',
      attempt: (db) => {
        const doctorId = insertDoctor(db);
        const patientId = insertPatient(db);
        insertVisit(db, { patient_id: patientId, doctor_id: doctorId, visit_type: 'urgent' });
      },
    },
    {
      name: "visits.status = 'done'",
      table: 'visits',
      attempt: (db) => {
        const doctorId = insertDoctor(db);
        const patientId = insertPatient(db);
        insertVisit(db, { patient_id: patientId, doctor_id: doctorId, status: 'done' });
      },
    },
    {
      name: "plan_runs.status = 'pending'",
      table: 'plan_runs',
      attempt: (db) => {
        insertPlanRun(db, { status: 'pending' });
      },
    },
    {
      name: "line_recipients.status = 'banned'",
      table: 'line_recipients',
      attempt: (db) => {
        insertLineRecipient(db, { status: 'banned' });
      },
    },
    {
      name: "settings.tier = 'derived'",
      table: 'settings',
      attempt: (db) => {
        insertSetting(db, { tier: 'derived' });
      },
    },
  ];

  it.each(cases)('$name — insert throws and row count is unchanged', ({ table, attempt }) => {
    const db = freshDb();
    const before = countRows(db, table);
    expect(() => attempt(db)).toThrow(/constraint/i);
    expect(countRows(db, table)).toBe(before);
    db.close();
  });
});

describe("Scenario 7 — schedulable_patients hides soft-deleted and un-geocoded patients", () => {
  it('returns exactly the ok and manual patients that are not soft-deleted', () => {
    const db = freshDb();
    const okId = insertPatient(db, { geocode_status: 'ok' });
    const manualId = insertPatient(db, { geocode_status: 'manual' });
    insertPatient(db, { geocode_status: 'pending' });
    insertPatient(db, { geocode_status: 'ok', deleted_at: '2026-01-05T00:00:00Z' });

    const rows = db.prepare('SELECT id FROM schedulable_patients').all() as { id: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id).sort()).toEqual([okId, manualId].sort());
    db.close();
  });
});

describe('Scenario 8 — a visit referencing a patient that does not exist is rejected', () => {
  it('the insert throws a foreign key violation and visits stays empty', () => {
    const db = freshDb();
    const doctorId = insertDoctor(db);

    expect(() =>
      insertVisit(db, { patient_id: randomUUID(), doctor_id: doctorId }),
    ).toThrow(/foreign key/i);
    expect(countRows(db, 'visits')).toBe(0);
    db.close();
  });
});
