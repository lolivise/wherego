// R1–R12 and Scenarios 3, 4, 7, 8 of
// docs/plans/00-foundations/work/T04-wrangler-config/acceptance.md. R13 lives in
// apps/api/src/index.test.ts (revision 2, see plan.md) — it is a claim about what the code DOES
// (a class returns 501; a handler delegates to a binding), which this file's parse-and-assert
// style cannot decide. See the coverage-boundary note below for why that moved rather than
// growing a fourth regex here.
//
// Everything statically readable is asserted here by parsing apps/api/wrangler.toml with
// smol-toml — never by regex-scraping the file for the structural criteria, so a reformatted
// but equivalent file still passes. Two exceptions read the raw text on purpose: R6's
// Asia/Taipei comments and R10's secret scan, both of which are about what characters are in
// the file rather than what the parsed structure says. R11 (below) also parses rather than
// scans, but reads OTHER wrangler configuration files in the tree, not just this one.
//
// Scenarios 1, 2, 5 and 6 (the wrangler dry run / `wrangler dev --local` behaviour) are not
// here — they need apps/web/dist to exist and a wrangler invocation, which /validate-task runs
// separately (see plan.md "Where each criterion is proven"). This file needs no build and no
// network.
//
// Mutations for Scenarios 3, 4, 7 and 8 are applied to the real `rawToml` TEXT — a mutated copy
// of the same characters the shipped file is made of — then re-parsed with smol-toml and run
// back through `findViolations` (or, for R11, `environmentUniquenessViolations` fed an in-memory
// Map holding the mutated parse tree), the same pure functions the R-rule tests use to judge the
// real file. That is what makes these mutation tests real proof rather than a tautology: they
// exercise the exact code path the guard uses, on an input that differs from the real file, and
// check that the specific violation the contract names is the one that comes back. Nothing here
// mutates apps/api/wrangler.toml on disk — mutated text lives only in memory or under a temp
// directory, and the checksum guard at the bottom proves it.
//
// --- Coverage boundary: what this guard does NOT catch, and where that is covered instead. ---
// Measured across three validation rounds (2026-07-26), not asserted from first principles. This
// file is unit/inspection-strength; it never runs wrangler and never runs the built Worker.
//
// - `run_worker_first = true` (R8) has NO behavioural proof here — it is a static equality check
//   against the parsed config. Whether the Worker actually receives every request (rather than the
//   asset router silently swallowing some of them) is unprovable with today's stub Worker, which
//   forwards everything to env.ASSETS.fetch() regardless of the caller — worker-first and
//   assets-first are byte-identical on every path until real routes exist in Phase 3. T08 owns the
//   behavioural proof: an unauthenticated `GET /` returning 403 only demonstrates anything once the
//   Worker is genuinely in the path for every request, which is exactly what T08 builds and tests.
// - R6 checks that each cron line CARRIES an Asia/Taipei comment, never that the clock time the
//   comment STATES is the correct Taipei-local translation of that cron expression. Deliberate:
//   verifying that would mean reimplementing UTC→Taipei conversion inside a test — a second
//   implementation of logic this repo has a standing rule against, in service of checking a
//   comment. Swapping the "08:00" and "07:00" comments between the two otherwise-correct cron
//   lines stays green — recorded as a rejected finding in validation-02.md, not silently accepted.
// - An empty-but-present `apps/web/dist` (directory exists, zero files) is not tested anywhere in
//   this file — it is a rejected finding recorded in validation-01.md and validation-02.md, not a
//   gap in this file's assertions: it passes Scenario 1's dry run cleanly, and no criterion in the
//   frozen acceptance.md requires detecting it. T10's CI is where the asset count is checked, and
//   it must be checked as `> 0`, never `=== N` — the reported count over-reports a correct build by
//   a small constant (measured: 2 real files reported as 3, 1 as 2, 0 as 0). Even `> 0` does not
//   catch every broken build: a `dist` with files but no root `index.html` still passes that check,
//   then serves 404 on `/` and on every unmatched path under `wrangler dev`. Neither this file nor
//   T10's `> 0` check catches that; nothing does yet.
// - Neither this file nor apps/api/src/index.test.ts proves that the class name wrangler.toml
//   declares under `durable_objects.bindings` (`PlanCoordinator`) and the class actually exported
//   by apps/api/src/index.ts AGREE — each side asserts only its own half, independently. Only
//   `wrangler deploy --dry-run` closes that, in BOTH directions, and does so loudly: a renamed
//   export fails with "Your Worker depends on the following Durable Objects, which are not
//   exported in your entrypoint file"; a config naming a class that was never written fails the
//   same way. That is Scenario 1's e2e evidence and it has passed every validation round — a
//   fourth structural check here would prove the same thing worse.
// - A `wrangler secret bulk` payload could carry `ENVIRONMENT` onto the deployed Worker by a route
//   no config guard — this one or any other — can see: R11 parses committed configuration files,
//   and a secret is, by definition, never one of those. This was never covered by revision 1's
//   repo-wide TEXT scan either (a secret push is not a file in this tree to walk); it is written
//   down here rather than assumed, and it is now T16's criterion — "the `wrangler secret bulk`
//   payload must not contain `ENVIRONMENT`" (see plan.md's T16 hand-off, revision 2).
// - `.json` and `.jsonc` are read with plain `JSON.parse` on the raw text — no comment-stripping
//   of any kind (validation-04's B17, B20: a hand-rolled `/*...*/` / `//` stripper cannot tell a
//   comment from the same characters inside a quoted string, and a cleverer version is the same
//   defect with a longer fuse). A parse failure, for any of the three extensions, is caught and
//   turned into a NAMED violation naming the file — never a silent pass and never an uncaught
//   exception — so a config this scan cannot read can never be mistaken for one that "sets
//   nothing". A comment-free `wrangler.jsonc` parses fine and is read structurally; one with real
//   `//` or `/* */` comments now fails loudly, by name, which is the correct behaviour: this scan
//   supports the JSON that `JSON.parse` supports, not JSONC.
// - A symlinked wrangler configuration FILE is followed (`findWranglerConfigPaths` resolves the
//   target with `statSync`) and read like any other. A symlinked DIRECTORY is never recursed
//   into, deliberately: validation-04 recorded that a symlink loop is impossible today only
//   because symlinks were skipped outright, and following directory symlinks would reintroduce
//   that risk. **A wrangler config that sits inside a symlinked directory is therefore still out
//   of reach of this scan** — not a gap that was closed, one that is named rather than implied
//   away.
// - B23 — a `vars` table that is present but is not a plain object — `[[vars]]` / `[[env.<x>.vars]]`
//   (parses to an array), `vars = "nope"` (a string), or JSON `"vars": null` — used to make
//   `environmentSetters` read `.ENVIRONMENT` off something that is not a table, which resolves to
//   `undefined` and is indistinguishable from "no such key". `environmentSetters` now type-guards
//   `vars` before reading it: anything present that is not a plain object is surfaced as its own
//   named, illegitimate setter rather than silently treated as one that sets nothing. Fixed with a
//   type guard, not a parser — the same principle B17/B20 applied to unparseable files.
// - B24 — `findWranglerConfigPaths`'s `walk` now catches a `readdirSync` failure (an unreadable
//   directory, e.g. `EACCES`) per directory rather than letting it escape uncaught. The failing
//   directory is reported as its own named violation and that one subtree is skipped; every
//   sibling and every violation found elsewhere in the same walk is still reported. Before this
//   fix the exception propagated out of both `findWranglerConfigPaths` and the try/catch around
//   `readWranglerConfig` in `findEnvironmentUniquenessViolations`, discarding whatever had already
//   been found and failing with a permissions stack trace instead of Scenario 8's promised
//   "fails, naming that file".
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  chmodSync,
  rmSync,
  readdirSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterAll } from 'vitest';
import { parse } from 'smol-toml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.join(repoRoot, 'apps/api/wrangler.toml');

const rawToml = readFileSync(configPath, 'utf8');
const configChecksumBefore = createHash('sha256').update(rawToml).digest('hex');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TomlTable = Record<string, any>;

const config = parse(rawToml) as TomlTable;

// §10.3's runtime secrets — pushed by `wrangler secret bulk` at T20, never present here as a
// key or a value.
const SECRET_NAMES = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'GOOGLE_MAPS_API_KEY',
  'CF_ACCESS_AUD',
  'CF_ACCESS_TEAM_DOMAIN',
  'LINE_ALERT_RECIPIENT',
  'HEALTHCHECK_PING_URL',
  'BACKUP_AGE_PUBLIC_KEY',
];

const T03_DATABASE_ID = 'f5adacb4-abce-41c9-aa82-86dc3b6f8334';

const CRONS = ['0 0 * * 1-5', '0 23 * * 0-4', '0 18 * * *'];

// §2 architecture: "No R2, no KV, no Queues, no Workflows... The Durable Object is the one
// exception". Every binding-declaring key that wrangler.toml recognises, and nothing else — the
// union of what appears at the top level and under every named environment (top level has
// d1_databases/durable_objects/assets/triggers; [env.local] additionally has vars). See B6 below:
// the guard fails shut if a new binding TYPE is either added or removed anywhere in the file, so
// a `[[kv_namespaces]]`, `[[r2_buckets]]`, `[[queues.producers]]` or workflow binding cannot land
// unnoticed, and a rule silently dropped is caught too.
const EXPECTED_BINDING_TYPES = ['d1_databases', 'durable_objects', 'assets', 'triggers', 'vars'];

// Worker metadata and non-binding keys, excluded from the binding-type census above. `migrations`
// is DO migration metadata, not itself a binding; `limits` is R3's concern; `env` is the
// environments container, recursed into rather than treated as a binding type itself.
const NON_BINDING_KEYS = new Set([
  'name',
  'main',
  'compatibility_date',
  'workers_dev',
  'migrations',
  'limits',
  'env',
]);

function declaredBindingTypes(cfg: TomlTable): string[] {
  const types = new Set<string>();
  for (const key of Object.keys(cfg)) {
    if (!NON_BINDING_KEYS.has(key)) types.add(key);
  }
  const envs = (cfg.env ?? {}) as TomlTable;
  for (const envName of Object.keys(envs)) {
    for (const key of Object.keys((envs[envName] as TomlTable) ?? {})) {
      if (!NON_BINDING_KEYS.has(key)) types.add(key);
    }
  }
  return Array.from(types).sort();
}

// Populated by Scenario 8's second test and B7/B8's tests with the temp directories they create,
// so afterAll can clean them up.
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The one pure function every R-rule test and every Scenario mutation test goes through. It
// returns a human-readable violation string per problem found — empty when the config is
// correct — so a mutation test can re-run the SAME check against a mutated (config, rawToml)
// pair instead of re-asserting something true about its own inputs. Each string names the field
// and what was expected; run_worker_first's names the array-form failure mode by name (Scenario
// 4 / B1) and [limits]'s names §2 and the Free plan (Scenario 7 / B2).
function findViolations(cfg: TomlTable, text: string): string[] {
  const violations: string[] = [];

  // R2 — workers_dev must be the boolean false.
  if (cfg.workers_dev !== false) {
    violations.push(
      `workers_dev must be the boolean false, not the string "false" and not absent; ` +
        `found ${JSON.stringify(cfg.workers_dev)}`,
    );
  }

  // R3 — no [limits] block anywhere, top level or in any environment.
  const envsForLimits = (cfg.env ?? {}) as TomlTable;
  const limitsLocations: string[] = [];
  if (cfg.limits !== undefined) limitsLocations.push('top level');
  for (const envName of Object.keys(envsForLimits)) {
    if ((envsForLimits[envName] as TomlTable)?.limits !== undefined) {
      limitsLocations.push(`env.${envName}`);
    }
  }
  if (limitsLocations.length > 0) {
    violations.push(
      `[limits] must not appear anywhere in the file (found at: ${limitsLocations.join(', ')}) — ` +
        `§2: limits.cpu_ms is a Paid-only setting and the account is on the Workers Free plan, ` +
        `where the 10ms CPU ceiling cannot be raised`,
    );
  }

  // R4 — the D1 binding names the T03 database.
  const d1 = (cfg.d1_databases ?? []) as TomlTable[];
  const d1Ok =
    d1.length === 1 &&
    d1[0]?.binding === 'DB' &&
    d1[0]?.database_name === 'wherego' &&
    d1[0]?.database_id === T03_DATABASE_ID;
  if (!d1Ok) {
    violations.push(
      `d1_databases must have exactly one entry with binding "DB", database_name "wherego" ` +
        `and database_id "${T03_DATABASE_ID}"; found ${JSON.stringify(d1)}`,
    );
  }

  // R5 — PlanCoordinator declared SQLite-backed; "new_classes" appears nowhere.
  const migrations = (cfg.migrations ?? []) as TomlTable[];
  const hasSqliteClass = migrations.some((m) =>
    ((m?.new_sqlite_classes ?? []) as string[]).includes('PlanCoordinator'),
  );
  if (!hasSqliteClass) {
    violations.push(
      'migrations must declare "PlanCoordinator" under new_sqlite_classes (not new_classes) — ' +
        '§2: key-value Durable Objects are Paid-only and this would not fail until first instantiation',
    );
  }
  if (/new_classes/.test(text)) {
    violations.push(
      'the string "new_classes" must appear nowhere in the file — key-value Durable Objects are Paid-only',
    );
  }
  const doBindings = ((cfg.durable_objects as TomlTable | undefined)?.bindings ?? []) as TomlTable[];
  if (!doBindings.some((b) => b?.class_name === 'PlanCoordinator')) {
    violations.push(
      'durable_objects.bindings must include a binding with class_name "PlanCoordinator"; ' +
        `found ${JSON.stringify(doBindings)}`,
    );
  }

  // R6 — all three cron expressions, in order, byte-identical to the task file.
  const crons = ((cfg.triggers as TomlTable | undefined)?.crons ?? []) as string[];
  if (!isDeepStrictEqual(crons, CRONS)) {
    violations.push(
      `triggers.crons must equal ${JSON.stringify(CRONS)} in order; found ${JSON.stringify(crons)}`,
    );
  }

  // R7 — [assets] serves the built SPA.
  const assets = (cfg.assets ?? {}) as TomlTable;
  if (assets.directory !== '../web/dist') {
    violations.push(
      `assets.directory must be "../web/dist" (resolves to apps/web/dist from the config file's ` +
        `own location); found ${JSON.stringify(assets.directory)}`,
    );
  }
  if (assets.binding !== 'ASSETS') {
    violations.push(`assets.binding must be "ASSETS"; found ${JSON.stringify(assets.binding)}`);
  }
  if (assets.not_found_handling !== 'single-page-application') {
    violations.push(
      `assets.not_found_handling must be "single-page-application"; ` +
        `found ${JSON.stringify(assets.not_found_handling)}`,
    );
  }

  // R8 — run_worker_first is the boolean true, never an array.
  if (Array.isArray(assets.run_worker_first)) {
    violations.push(
      'assets.run_worker_first must be the boolean true, not an array — the array form causes ' +
        'paths outside the list to bypass the Worker entirely, since it inverts the default for ' +
        'every unlisted path (served assets-first and never reaching the Worker at all)',
    );
  } else if (assets.run_worker_first !== true) {
    violations.push(
      `assets.run_worker_first must be the boolean true; found ${JSON.stringify(assets.run_worker_first)}`,
    );
  }

  // R9 — env.local.vars.ENVIRONMENT is exactly "local". Whether anything ELSE in the repository
  // — another environment in this file, or a second wrangler config elsewhere — also sets
  // ENVIRONMENT is R11's job (below): findViolations only ever sees one parsed config, so a
  // repo-wide property cannot live here without becoming a second implementation of R11. See
  // plan.md revision 2, "Narrowing R11 honestly".
  const env = (cfg.env ?? {}) as TomlTable;
  const local = (env.local ?? {}) as TomlTable;
  if (local.vars?.ENVIRONMENT !== 'local') {
    violations.push(
      `env.local.vars.ENVIRONMENT must be exactly "local"; found ${JSON.stringify(local.vars?.ENVIRONMENT)}`,
    );
  }

  // R2 / B10 — no environment may override workers_dev, whether as a direct sibling key
  // (env.<name>.workers_dev, the real override wrangler recognises) or nested under
  // [env.<name>.vars] (a plausible mistake: env.local's OTHER config is duplicated there, so a
  // contributor could reasonably reach for the same vars block). Same one-line family as R9/B7
  // above: §9(b) makes workers_dev load-bearing, so reopening the *.workers.dev hostname under ANY
  // environment name is a violation, whatever that environment is called.
  for (const envName of Object.keys(env)) {
    const envTable = (env[envName] ?? {}) as TomlTable;
    const overrideValue =
      envTable.workers_dev !== undefined ? envTable.workers_dev : envTable.vars?.workers_dev;
    if (overrideValue !== undefined) {
      violations.push(
        `env.${envName} must not override workers_dev — §9(b): a workers_dev = true under any ` +
          `environment reopens the *.workers.dev hostname that no Cloudflare Access application ` +
          `can cover; found ${JSON.stringify(overrideValue)}`,
      );
    }
  }

  if (local.assets !== undefined) {
    violations.push(
      '[env.local.assets] must not exist — [assets] is inherited by every environment and must not be duplicated',
    );
  }
  if (!isDeepStrictEqual(local.d1_databases, cfg.d1_databases)) {
    violations.push(
      'env.local.d1_databases must be deep-equal to the top-level d1_databases, in both directions; ' +
        `found env.local=${JSON.stringify(local.d1_databases)} top-level=${JSON.stringify(cfg.d1_databases)}`,
    );
  }
  const topDoBindings = (cfg.durable_objects as TomlTable | undefined)?.bindings;
  const localDoBindings = (local.durable_objects as TomlTable | undefined)?.bindings;
  if (!isDeepStrictEqual(localDoBindings, topDoBindings)) {
    violations.push(
      'env.local.durable_objects.bindings must be deep-equal to the top-level ' +
        `durable_objects.bindings, in both directions; found env.local=${JSON.stringify(localDoBindings)} ` +
        `top-level=${JSON.stringify(topDoBindings)}`,
    );
  }

  // R10 — no §10.3 secret name appears in the file, as a key or a value.
  for (const secretName of SECRET_NAMES) {
    if (text.includes(secretName)) {
      violations.push(
        `the §10.3 secret "${secretName}" must not appear in the file, as a key or a value — ` +
          'it is pushed by `wrangler secret bulk` at T20',
      );
    }
  }

  // B6 — the set of binding types declared must be exactly the expected set. Anything else is
  // architecture drift: §2 states "No R2, no KV, no Queues, no Workflows... The Durable Object is
  // the one exception, and it is bought for correctness rather than throughput."
  const declared = declaredBindingTypes(cfg);
  const expectedSorted = [...EXPECTED_BINDING_TYPES].sort();
  if (!isDeepStrictEqual(declared, expectedSorted)) {
    const unexpected = declared.filter((t) => !EXPECTED_BINDING_TYPES.includes(t));
    const missing = EXPECTED_BINDING_TYPES.filter((t) => !declared.includes(t));
    violations.push(
      `the set of declared binding types must be exactly ${JSON.stringify(EXPECTED_BINDING_TYPES)} — ` +
        `§2: "No R2, no KV, no Queues, no Workflows" ("The Durable Object is the one exception, ` +
        `and it is bought for correctness rather than throughput"); ` +
        `found ${JSON.stringify(declared)}` +
        (unexpected.length > 0 ? `; unexpected: ${JSON.stringify(unexpected)}` : '') +
        (missing.length > 0 ? `; missing: ${JSON.stringify(missing)}` : ''),
    );
  }

  return violations;
}

function violationsMentioning(cfg: TomlTable, text: string, keyword: string): string[] {
  return findViolations(cfg, text).filter((v) => v.includes(keyword));
}

// Asserts no violation matching `keyword` was found, AND makes sure a human actually sees the
// violation text if this fails. `expect(arrayOfStrings).toEqual([])` renders as
// `expected [ Array(1) ] to deeply equal []` — vitest collapses the nested array in its diff, so
// the descriptive message findViolations worked to produce (the whole point of B1's and B2's
// fix) never reaches the terminal. Passing the joined violation text as vitest's second `expect`
// argument prints it verbatim ahead of the diff instead.
function expectNoViolation(cfg: TomlTable, text: string, keyword: string): void {
  const matches = violationsMentioning(cfg, text, keyword);
  expect(matches, matches.join('\n')).toEqual([]);
}

// B11 — asserts a mutation's `.replace()` actually changed the text, with a message naming which
// mutation and pointing at the real cause, rather than letting a silently no-op replace fail
// later with a confusing `expected X not to be X` that gives no hint the literal string being
// replaced no longer exists in the real file. Applied to every mutation test below that mutates
// by literal string or regex replacement — never to ones that mutate by concatenation
// (`` `${rawToml}\n...` ``), which cannot silently no-op.
function assertMutated(mutated: string, original: string, label: string): void {
  expect(
    mutated,
    `the "${label}" mutation string has drifted from the real file — .replace() found nothing to ` +
      `replace and returned the original text unchanged`,
  ).not.toBe(original);
}

// B21 — B7's tests append `[env.<probeName>.vars]` to a COPY of rawToml by string concatenation.
// If the config they are handed already defines that environment (a real `[env.staging]` table
// added by a future task), the concatenation collides on the table path and smol-toml's `parse()`
// throws "Invalid TOML document: trying to redefine an already defined table or value" — an
// opaque message pointing at neither B7 nor the actual cause. This runs BEFORE any mutation, so
// that collision fails on its own named message instead.
function assertProbeEnvironmentIsFree(cfg: TomlTable, probeName: string): void {
  const env = (cfg.env ?? {}) as TomlTable;
  if (env[probeName] !== undefined) {
    throw new Error(
      `B7's tests probe with the environment name "env.${probeName}", which must not collide ` +
        `with real configuration. The config handed to it already defines env.${probeName}, so ` +
        'appending another one would throw a TOML "redefine an already defined table" error ' +
        'instead of this message — pick a different probe environment name for these tests.',
    );
  }
}

describe('R1 — the file exists and identifies the Worker', () => {
  it('name, main and compatibility_date are set', () => {
    expect(config.name).toBe('wherego');
    expect(config.main).toBe('src/index.ts');
    expect(typeof config.compatibility_date).toBe('string');
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('R2 — workers_dev is exactly false', () => {
  it('is the boolean false, not the string "false" and not absent', () => {
    // findViolations first: on a mutated config this is what produces a self-explanatory
    // failure message rather than a bare `expected true to be false`-style diff (vitest stops
    // at the first failing expect(), so ordering here is what makes B1/B2's contract clause
    // actually surface).
    expectNoViolation(config, rawToml, 'workers_dev');
    expect(config.workers_dev).toBe(false);
    expect(typeof config.workers_dev).toBe('boolean');
  });
});

describe('R3 — no [limits] block anywhere', () => {
  it('is absent at the top level and in every environment', () => {
    expectNoViolation(config, rawToml, '[limits]');
    expect(config.limits).toBeUndefined();
    const envs = (config.env ?? {}) as TomlTable;
    for (const envName of Object.keys(envs)) {
      expect((envs[envName] as TomlTable).limits, `env.${envName}.limits`).toBeUndefined();
    }
  });

  it('names §2 and T03 in a comment explaining the omission', () => {
    expect(rawToml).toMatch(/§2/);
    expect(rawToml).toMatch(/T03/);
    expect(rawToml.toLowerCase()).toMatch(/limits\.cpu_ms/);
  });
});

describe('R4 — the D1 binding names the T03 database', () => {
  it('binding, database_name and database_id are exact', () => {
    expectNoViolation(config, rawToml, 'd1_databases must have exactly one entry');
    const d1 = config.d1_databases as TomlTable[];
    expect(d1).toHaveLength(1);
    expect(d1[0]?.binding).toBe('DB');
    expect(d1[0]?.database_name).toBe('wherego');
    expect(d1[0]?.database_id).toBe(T03_DATABASE_ID);
  });
});

describe('R5 — PlanCoordinator is SQLite-backed', () => {
  it('the migration declares new_sqlite_classes containing PlanCoordinator', () => {
    expectNoViolation(config, rawToml, 'new_sqlite_classes');
    const migrations = config.migrations as TomlTable[];
    expect(migrations).toHaveLength(1);
    expect(migrations[0]?.new_sqlite_classes).toEqual(['PlanCoordinator']);
  });

  it('the string new_classes appears nowhere in the file', () => {
    expectNoViolation(config, rawToml, '"new_classes" must appear nowhere');
    expect(rawToml).not.toMatch(/new_classes/);
  });

  it('a Durable Object binding names PlanCoordinator', () => {
    expectNoViolation(config, rawToml, 'durable_objects.bindings must include');
    const bindings = (config.durable_objects as TomlTable).bindings as TomlTable[];
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.class_name).toBe('PlanCoordinator');
  });
});

describe('R6 — all three cron expressions, in order, each commented', () => {
  it('triggers.crons is byte-identical to the task file, in order', () => {
    expectNoViolation(config, rawToml, 'triggers.crons');
    const crons = (config.triggers as TomlTable).crons as string[];
    expect(crons).toEqual(CRONS);
  });

  it('each cron line carries its Asia/Taipei comment', () => {
    for (const cron of CRONS) {
      const lineMatch = rawToml
        .split('\n')
        .find((line) => line.includes(JSON.stringify(cron)) || line.includes(cron));
      expect(lineMatch, `no line found for ${cron}`).toBeDefined();
      expect(lineMatch).toMatch(/Asia\/Taipei/);
    }
  });

  it('a comment explains Taipei has no DST and that 0-4 is not a typo', () => {
    expect(rawToml).toMatch(/no DST/i);
    expect(rawToml).toMatch(/0-4/);
  });
});

describe('R7 — [assets] serves the built SPA', () => {
  it('directory resolves to apps/web/dist from the config file location', () => {
    expectNoViolation(config, rawToml, 'assets.directory');
    const assets = config.assets as TomlTable;
    expect(assets.directory).toBe('../web/dist');
    // apps/api/wrangler.toml + "../web/dist" resolves to apps/web/dist.
    const resolved = path.resolve(path.dirname(configPath), assets.directory as string);
    expect(resolved).toBe(path.join(repoRoot, 'apps/web/dist'));
  });

  it('binding is ASSETS and not_found_handling is single-page-application', () => {
    expectNoViolation(config, rawToml, 'assets.binding');
    expectNoViolation(config, rawToml, 'assets.not_found_handling');
    const assets = config.assets as TomlTable;
    expect(assets.binding).toBe('ASSETS');
    expect(assets.not_found_handling).toBe('single-page-application');
  });
});

describe('R8 — run_worker_first is the boolean true, not an array', () => {
  it('is strictly true', () => {
    // See B1: this is the check that must fail first (and self-explain) when run_worker_first
    // is weakened to the array form — vitest stops at the first failing expect(), so the
    // descriptive findViolations check has to run before the bare structural ones.
    expectNoViolation(config, rawToml, 'run_worker_first');
    const assets = config.assets as TomlTable;
    expect(assets.run_worker_first).toBe(true);
    expect(Array.isArray(assets.run_worker_first)).toBe(false);
  });

  it('carries the measured run_worker_first behaviour table as a comment', () => {
    expect(rawToml).toMatch(/run_worker_first/);
    expect(rawToml).toMatch(/healthz/);
    expect(rawToml.toLowerCase()).toMatch(/invert/);
  });
});

describe('R9 — [env.local] duplicates d1_databases and durable_objects, both directions', () => {
  it('env.local.vars.ENVIRONMENT is exactly "local" — whether anything else in the repository also sets it is R11 (below)', () => {
    expectNoViolation(config, rawToml, 'env.local.vars.ENVIRONMENT');
    const env = config.env as TomlTable;
    expect(env.local.vars.ENVIRONMENT).toBe('local');
  });

  it('[assets] is inherited and not duplicated under [env.local]', () => {
    expectNoViolation(config, rawToml, '[env.local.assets] must not exist');
    const env = config.env as TomlTable;
    expect(env.local.assets).toBeUndefined();
  });

  it('d1_databases under [env.local] is deep-equal to the top level, both directions', () => {
    expectNoViolation(config, rawToml, 'env.local.d1_databases must be deep-equal');
    const env = config.env as TomlTable;
    expect(env.local.d1_databases).toEqual(config.d1_databases);
    expect(config.d1_databases).toEqual(env.local.d1_databases);
  });

  it('durable_objects.bindings under [env.local] is deep-equal to the top level, both directions', () => {
    expectNoViolation(config, rawToml, 'env.local.durable_objects.bindings must be deep-equal');
    const env = config.env as TomlTable;
    expect(env.local.durable_objects.bindings).toEqual(
      (config.durable_objects as TomlTable).bindings,
    );
    expect((config.durable_objects as TomlTable).bindings).toEqual(
      env.local.durable_objects.bindings,
    );
  });
});

describe('R10 — no §10.3 secret name appears in the file', () => {
  it.each(SECRET_NAMES)('%s does not appear as a key or a value', (secretName) => {
    expectNoViolation(config, rawToml, secretName);
    expect(rawToml).not.toContain(secretName);
  });
});

describe('R11 — no wrangler configuration in the repository sets ENVIRONMENT anywhere but env.local, and there only to "local" (revision 2)', () => {
  it('parsing every wrangler config in the repository tree yields no violation', () => {
    const violations = findEnvironmentUniquenessViolations([repoRoot]);
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('the one setter found across the whole tree is exactly env.local in the real apps/api/wrangler.toml', () => {
    const configs = new Map<string, TomlTable>();
    for (const filePath of findWranglerConfigPaths(repoRoot)) {
      configs.set(filePath, readWranglerConfig(filePath));
    }
    expect(environmentSetters(configs)).toEqual([
      { file: configPath, environment: 'env.local', value: 'local' },
    ]);
  });
});

describe('R12 — the toolchain is declared', () => {
  it('wrangler is in devDependencies of @wherego/api', () => {
    const pkg = readJson('apps/api/package.json');
    expect(pkg.devDependencies?.wrangler).toBeDefined();
  });

  it('workerd is added to allowBuilds in pnpm-workspace.yaml', () => {
    const workspaceYaml = readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspaceYaml).toMatch(/workerd:\s*true/);
  });

  it('the guard TOML parser (smol-toml) is in devDependencies of @wherego/tools', () => {
    const pkg = readJson('tools/package.json');
    expect(pkg.devDependencies?.['smol-toml']).toBeDefined();
  });
});

// --- Mutation proofs. Each of these mutates the REAL rawToml TEXT, re-parses it with smol-toml,
// and runs the result back through findViolations — the same function the R-rule tests above
// use to judge the shipped file. This is what makes the proof real: it is the guard's own logic,
// exercised against an input that is not the real file, rather than an assertion re-stated about
// a value the test built for itself. ---

describe('Scenario 3 — the two [env.local] blocks cannot drift from the top-level ones', () => {
  it('a database_id changed only under [env.local] is caught, and named', () => {
    const mutated = rawToml.replace(
      /(\[\[env\.local\.d1_databases\]\][^[]*?database_id\s*=\s*)"[^"]*"/,
      '$1"deadbeef-0000-0000-0000-000000000000"',
    );
    assertMutated(mutated, rawToml, 'database_id changed only under [env.local]');
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.includes('env.local.d1_databases must be deep-equal'))).toBe(true);
  });

  it('a d1_databases block added only at the top level (not under [env.local]) is caught', () => {
    const mutated = `${rawToml}\n[[d1_databases]]\nbinding = "DB2"\ndatabase_name = "other"\ndatabase_id = "x"\n`;
    assertMutated(mutated, rawToml, 'd1_databases block added only at the top level');
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.includes('env.local.d1_databases must be deep-equal'))).toBe(true);
  });
});

describe('Scenario 4 — run_worker_first cannot be weakened to the array form', () => {
  it('the array form fails, naming the bypass it causes', () => {
    const mutated = rawToml.replace(
      'run_worker_first = true',
      'run_worker_first = ["/api/*", "/healthz"]',
    );
    assertMutated(mutated, rawToml, 'run_worker_first = true → array form');
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    const match = violations.find((v) => v.startsWith('assets.run_worker_first'));
    expect(match).toBeDefined();
    expect(match).toMatch(/array form causes paths outside the list to bypass the Worker entirely/);
  });

  it('a deleted run_worker_first key fails', () => {
    const mutated = rawToml.replace(/^run_worker_first = true\n/m, '');
    assertMutated(mutated, rawToml, 'run_worker_first = true line deleted');
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.startsWith('assets.run_worker_first'))).toBe(true);
  });
});

describe('Scenario 7 — the schema-level guards fail when the config is wrong', () => {
  it('new_sqlite_classes changed to new_classes is caught', () => {
    const mutated = rawToml.replace('new_sqlite_classes', 'new_classes');
    assertMutated(mutated, rawToml, 'new_sqlite_classes → new_classes');
    expect(mutated).toMatch(/new_classes/);
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.includes('"new_classes" must appear nowhere'))).toBe(true);
    expect(violations.some((v) => v.includes('new_sqlite_classes'))).toBe(true);
  });

  it('workers_dev changed to true is caught', () => {
    const mutated = rawToml.replace('workers_dev = false', 'workers_dev = true');
    assertMutated(mutated, rawToml, 'workers_dev = false → workers_dev = true');
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.startsWith('workers_dev must be the boolean false'))).toBe(true);
  });

  it('workers_dev removed is caught', () => {
    const mutated = rawToml.replace(/^workers_dev = false\n/m, '');
    assertMutated(mutated, rawToml, 'workers_dev = false line deleted');
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.startsWith('workers_dev must be the boolean false'))).toBe(true);
  });

  it('a [limits] block with cpu_ms is caught, naming §2 and the Free plan', () => {
    const mutated = `${rawToml}\n[limits]\ncpu_ms = 50\n`;
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    const match = violations.find((v) => v.startsWith('[limits] must not appear'));
    expect(match).toBeDefined();
    expect(match).toMatch(/§2/);
    expect(match?.toLowerCase()).toMatch(/free plan/);
  });

  it('an altered, reordered or removed cron is caught', () => {
    const reordered = rawToml.replace(
      `crons = [
  "0 0 * * 1-5",  # Mon-Fri 08:00 Asia/Taipei — commit run
  "0 23 * * 0-4", # Mon-Fri 07:00 Asia/Taipei — morning push
  "0 18 * * *",   # daily 02:00 Asia/Taipei — nightly maintenance
]`,
      `crons = [
  "0 23 * * 0-4", # Mon-Fri 07:00 Asia/Taipei — morning push
  "0 0 * * 1-5",  # Mon-Fri 08:00 Asia/Taipei — commit run
  "0 18 * * *",   # daily 02:00 Asia/Taipei — nightly maintenance
]`,
    );
    assertMutated(reordered, rawToml, 'crons array reordered');
    const reorderedViolations = findViolations(parse(reordered) as TomlTable, reordered);
    expect(reorderedViolations.some((v) => v.startsWith('triggers.crons must equal'))).toBe(true);

    const oneChanged = rawToml.replace('"0 23 * * 0-4"', '"0 0 * * *"');
    assertMutated(oneChanged, rawToml, 'one cron expression changed');
    const oneChangedViolations = findViolations(parse(oneChanged) as TomlTable, oneChanged);
    expect(oneChangedViolations.some((v) => v.startsWith('triggers.crons must equal'))).toBe(true);

    const removed = rawToml.replace('  "0 18 * * *",   # daily 02:00 Asia/Taipei — nightly maintenance\n', '');
    assertMutated(removed, rawToml, 'the nightly-maintenance cron line removed');
    const removedViolations = findViolations(parse(removed) as TomlTable, removed);
    expect(removedViolations.some((v) => v.startsWith('triggers.crons must equal'))).toBe(true);
  });
});

describe('Scenario 8 — a secret cannot be committed into the config', () => {
  it.each(SECRET_NAMES)('adding %s to the file is caught and named', (secretName) => {
    const mutated = `${rawToml}\n${secretName} = "x"\n`;
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.includes(secretName))).toBe(true);
  });

  // B4 — the scan must be exercised on a root that CANNOT be satisfied by the real
  // wrangler.toml. Scanning only a fresh temp directory means the test can pass only if the
  // planted second file is actually found: deleting the walk (or the loop over `roots`) removes
  // the only match, and the assertion below goes red. Proven in the fix's scratchpad copy by
  // deleting that logic and re-running this exact test.
  //
  // Revision 2: the fixture is now a real `wrangler.toml`, parsed like any other, rather than an
  // arbitrary text file matched by a regex — see plan.md revision 2, "Narrowing R11 honestly".
  it('a second wrangler.toml elsewhere in the repository setting vars.ENVIRONMENT is caught and named, scanning only a fresh root', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-r11-'));
    tempDirs.push(scanDir);
    const secondFile = path.join(scanDir, 'wrangler.toml');
    writeFileSync(secondFile, '[vars]\nENVIRONMENT = "prod"\n', 'utf8');
    // A config with no ENVIRONMENT at all, to prove the walk does not just flag everything it
    // finds — only the ones that actually set the value.
    writeFileSync(path.join(scanDir, 'wrangler.json'), JSON.stringify({ name: 'unrelated' }), 'utf8');

    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).toMatch(/prod/);
    expect(violations.join('\n')).toContain(secondFile);
  });

  // Revision 3 (B17/B20): a wrangler.jsonc with REAL `//` comments is no longer stripped and
  // silently parsed — it is invalid JSON, so it now fails loudly as a NAMED violation. This is
  // the corrected expectation: the previous version of this test asserted the old (buggy)
  // stripper's behaviour, which is exactly what validation-04's B17/B20 found broken.
  it('a wrangler.jsonc with real // comments is caught as a named unparseable-file violation, not silently parsed and not a raw throw', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-r11-jsonc-'));
    tempDirs.push(scanDir);
    const jsoncFile = path.join(scanDir, 'wrangler.jsonc');
    writeFileSync(
      jsoncFile,
      '{\n  // a comment mentioning ENVIRONMENT = "local" that must not itself be read as data\n  "vars": { "ENVIRONMENT": "staging" }\n}\n',
      'utf8',
    );
    expect(() => findEnvironmentUniquenessViolations([scanDir])).not.toThrow();
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).toMatch(/R11 could not read/);
    expect(violations.join('\n')).toContain(jsoncFile);
  });

  it('a comment-free wrangler.jsonc is read structurally, and its ENVIRONMENT assignment is caught', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-r11-jsonc-clean-'));
    tempDirs.push(scanDir);
    const jsoncFile = path.join(scanDir, 'wrangler.jsonc');
    writeFileSync(jsoncFile, JSON.stringify({ vars: { ENVIRONMENT: 'staging' } }), 'utf8');
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).not.toMatch(/R11 could not read/);
    expect(violations.join('\n')).toMatch(/staging/);
    expect(violations.join('\n')).toContain(jsoncFile);
  });

  // B17 — the exact adversarial fixture from validation-04: two unrelated string values contain
  // "/*" and "*/" between them. The old stripper read that as one block comment spanning the
  // whole `vars` table and deleted it while leaving the remainder valid JSON, so JSON.parse
  // succeeded and ENVIRONMENT vanished — silently, with all tests green. There is no comment
  // stripping left to fool: the file is parsed as-is, and "/*"/"*/" are just characters inside
  // quoted strings, never comment syntax.
  it('B17 — a string value containing "/*" paired with another containing "*/" does not blank the ENVIRONMENT assignment between them', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b17-'));
    tempDirs.push(scanDir);
    const probeFile = path.join(scanDir, 'wrangler.jsonc');
    writeFileSync(
      probeFile,
      JSON.stringify({ note1: 'begin /*', vars: { ENVIRONMENT: 'prod' }, note2: '*/ end' }),
      'utf8',
    );
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    // Caught as an ENVIRONMENT violation, not as an unparseable-file violation: the file is
    // valid JSON start to finish, so it parses fine and returns the real vars table intact.
    expect(violations.join('\n')).not.toMatch(/R11 could not read/);
    expect(violations.join('\n')).toMatch(/prod/);
    expect(violations.join('\n')).toContain(probeFile);
  });

  // B20 — a `//` inside an ordinary field value (a healthcheck or webhook URL) used to have
  // everything after it on that line blanked by the stripper, breaking JSON syntax and throwing
  // an opaque SyntaxError instead of naming the file. With no stripping at all, "//" inside a
  // quoted string is just two characters; JSON.parse never sees anything resembling a comment.
  it('B20 — a "//" inside an ordinary field value (a URL) does not crash the guard, and the file is still caught', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b20-'));
    tempDirs.push(scanDir);
    const probeFile = path.join(scanDir, 'wrangler.jsonc');
    writeFileSync(
      probeFile,
      JSON.stringify({ url: 'http://example.com/ping', vars: { ENVIRONMENT: 'prod' } }),
      'utf8',
    );
    expect(() => findEnvironmentUniquenessViolations([scanDir])).not.toThrow();
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).not.toMatch(/R11 could not read/);
    expect(violations.join('\n')).toMatch(/prod/);
    expect(violations.join('\n')).toContain(probeFile);
  });
});

describe('B19 — symlinked wrangler configuration files', () => {
  it('a symlinked wrangler.toml resolving to a file outside the scanned root, setting vars.ENVIRONMENT, is followed and caught', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b19-scan-'));
    tempDirs.push(scanDir);
    const outsideDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b19-outside-'));
    tempDirs.push(outsideDir);
    const targetFile = path.join(outsideDir, 'real-config.toml');
    writeFileSync(targetFile, '[vars]\nENVIRONMENT = "evil-symlinked"\n', 'utf8');
    const linkPath = path.join(scanDir, 'wrangler.toml');
    symlinkSync(targetFile, linkPath);

    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).toMatch(/evil-symlinked/);
    expect(violations.join('\n')).toContain(linkPath);
  });

  it('a self-referential directory symlink does not hang or throw the walk', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b19-loop-'));
    tempDirs.push(scanDir);
    const loopPath = path.join(scanDir, 'self');
    symlinkSync(scanDir, loopPath);

    // findWranglerConfigPaths is the walk itself — checked directly, rather than through
    // findEnvironmentUniquenessViolations, which would report "no env.local setter found" for
    // any isolated directory that (correctly) contains no wrangler config at all. The property
    // under test here is termination, not the higher-level violation count.
    expect(() => findWranglerConfigPaths(scanDir)).not.toThrow();
    expect(findWranglerConfigPaths(scanDir)).toEqual([]);
  });

  it('a broken (dangling) symlink named wrangler.toml is skipped rather than throwing', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b19-broken-'));
    tempDirs.push(scanDir);
    const linkPath = path.join(scanDir, 'wrangler.toml');
    symlinkSync(path.join(scanDir, 'does-not-exist.toml'), linkPath);

    expect(() => findWranglerConfigPaths(scanDir)).not.toThrow();
    expect(findWranglerConfigPaths(scanDir)).toEqual([]);
  });

  it('a symlinked DIRECTORY containing a wrangler config is not recursed into (documented limit, not a regression)', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b19-dirlink-'));
    tempDirs.push(scanDir);
    const outsideDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b19-dirlink-target-'));
    tempDirs.push(outsideDir);
    writeFileSync(
      path.join(outsideDir, 'wrangler.toml'),
      '[vars]\nENVIRONMENT = "unreached-via-dirlink"\n',
      'utf8',
    );
    symlinkSync(outsideDir, path.join(scanDir, 'linked-dir'));

    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).not.toMatch(/unreached-via-dirlink/);
  });
});

describe('B23 — a vars table that is not a plain object is a named violation, not an invisible one', () => {
  // Pure, Map-testable — no filesystem access — proving the type guard directly against the
  // shapes smol-toml and JSON.parse actually produce, before any of the fixture-based tests
  // below exercise it through the filesystem entry point.
  it('environmentSetters reports a named violation for an array-form vars (measured smol-toml output for [[vars]])', () => {
    const configs = new Map<string, TomlTable>([
      ['fixture.toml', { vars: [{ ENVIRONMENT: 'prod' }] }],
    ]);
    const setters = environmentSetters(configs);
    expect(setters).toHaveLength(1);
    expect(setters[0]?.environment).toBe('top-level');
    expect(String(setters[0]?.value)).toMatch(/vars is not a table/);
    expect(String(setters[0]?.value)).toMatch(/array/);
    const violations = environmentUniquenessViolations(setters);
    expect(violations.join('\n')).toMatch(/vars is not a table/);
    expect(violations.join('\n')).toContain('fixture.toml');
  });

  it('environmentSetters reports a named violation for an array-form vars under env.<name> (measured smol-toml output for [[env.staging.vars]])', () => {
    const configs = new Map<string, TomlTable>([
      ['fixture.toml', { env: { staging: { vars: [{ ENVIRONMENT: 'prod' }] } } }],
    ]);
    const setters = environmentSetters(configs);
    expect(setters).toHaveLength(1);
    expect(setters[0]?.environment).toBe('env.staging');
    expect(String(setters[0]?.value)).toMatch(/vars is not a table/);
  });

  it('environmentSetters reports a named violation for vars as a string, and for vars as null, without crashing', () => {
    const stringConfigs = new Map<string, TomlTable>([['fixture.toml', { vars: 'nope' }]]);
    expect(() => environmentSetters(stringConfigs)).not.toThrow();
    const stringSetters = environmentSetters(stringConfigs);
    expect(stringSetters).toHaveLength(1);
    expect(String(stringSetters[0]?.value)).toMatch(/vars is not a table/);
    expect(String(stringSetters[0]?.value)).toMatch(/string/);

    const nullConfigs = new Map<string, TomlTable>([['fixture.json', { vars: null }]]);
    expect(() => environmentSetters(nullConfigs)).not.toThrow();
    const nullSetters = environmentSetters(nullConfigs);
    expect(nullSetters).toHaveLength(1);
    expect(String(nullSetters[0]?.value)).toMatch(/vars is not a table/);
    expect(String(nullSetters[0]?.value)).toMatch(/null/);
  });

  it('absent vars stays fine and reports nothing', () => {
    const configs = new Map<string, TomlTable>([['fixture.toml', { name: 'wherego' }]]);
    expect(environmentSetters(configs)).toEqual([]);
  });

  // Filesystem-level fixtures, through the real entry point findEnvironmentUniquenessViolations
  // — matching the acceptance evidence's four planted-file cases exactly.
  it('a real [[vars]] array-of-tables wrangler.toml is caught and named', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b23-toml-top-'));
    tempDirs.push(scanDir);
    const configFile = path.join(scanDir, 'wrangler.toml');
    writeFileSync(configFile, '[[vars]]\nENVIRONMENT = "prod"\n', 'utf8');

    expect(() => findEnvironmentUniquenessViolations([scanDir])).not.toThrow();
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).toMatch(/vars is not a table/);
    expect(violations.join('\n')).toContain(configFile);
  });

  it('a real [[env.staging.vars]] array-of-tables wrangler.toml is caught and named', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b23-toml-env-'));
    tempDirs.push(scanDir);
    const configFile = path.join(scanDir, 'wrangler.toml');
    writeFileSync(
      configFile,
      '[env.staging]\n[[env.staging.vars]]\nENVIRONMENT = "prod"\n',
      'utf8',
    );

    expect(() => findEnvironmentUniquenessViolations([scanDir])).not.toThrow();
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).toMatch(/vars is not a table/);
    expect(violations.join('\n')).toContain(configFile);
  });

  it('a real wrangler.json with vars as a JSON array is caught and named', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b23-json-array-'));
    tempDirs.push(scanDir);
    const configFile = path.join(scanDir, 'wrangler.json');
    writeFileSync(configFile, JSON.stringify({ vars: [{ ENVIRONMENT: 'prod' }] }), 'utf8');

    expect(() => findEnvironmentUniquenessViolations([scanDir])).not.toThrow();
    const violations = findEnvironmentUniquenessViolations([scanDir]);
    expect(violations.join('\n')).toMatch(/vars is not a table/);
    expect(violations.join('\n')).toContain(configFile);
  });

  it('vars as a string (toml) and vars as null (json) are both caught and named, not crashed', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b23-scalar-'));
    tempDirs.push(scanDir);
    const tomlFile = path.join(scanDir, 'wrangler.toml');
    writeFileSync(tomlFile, 'vars = "nope"\n', 'utf8');
    const jsonScanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b23-null-'));
    tempDirs.push(jsonScanDir);
    const jsonFile = path.join(jsonScanDir, 'wrangler.json');
    writeFileSync(jsonFile, JSON.stringify({ vars: null }), 'utf8');

    expect(() => findEnvironmentUniquenessViolations([scanDir, jsonScanDir])).not.toThrow();
    const violations = findEnvironmentUniquenessViolations([scanDir, jsonScanDir]);
    expect(violations.join('\n')).toMatch(/vars is not a table/);
    expect(violations.join('\n')).toContain(tomlFile);
    expect(violations.join('\n')).toContain(jsonFile);
  });
});

describe('B24 — an unreadable directory is a named violation, and the walk continues past it', () => {
  it('a mode-000 directory containing a wrangler.toml is caught and named, does not throw, and a separate real violation elsewhere in the same walk is still reported', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b24-'));
    tempDirs.push(scanDir);

    // The unreadable subtree — its wrangler.toml is unreachable, and that has to be NAMED
    // rather than silently treated as "contains nothing".
    const lockedDir = path.join(scanDir, 'locked');
    mkdirSync(lockedDir);
    writeFileSync(path.join(lockedDir, 'wrangler.toml'), '[vars]\nENVIRONMENT = "hidden"\n', 'utf8');

    // A real, findable violation elsewhere in the SAME walk, to prove the unreadable directory
    // does not discard violations found in a sibling subtree.
    const siblingDir = path.join(scanDir, 'sibling');
    mkdirSync(siblingDir);
    writeFileSync(
      path.join(siblingDir, 'wrangler.toml'),
      '[vars]\nENVIRONMENT = "prod-from-sibling"\n',
      'utf8',
    );

    chmodSync(lockedDir, 0o000);
    try {
      expect(() => findEnvironmentUniquenessViolations([scanDir])).not.toThrow();
      const violations = findEnvironmentUniquenessViolations([scanDir]);
      expect(violations.join('\n')).toMatch(/R11 could not list/);
      expect(violations.join('\n')).toContain(lockedDir);
      expect(violations.join('\n')).toMatch(/prod-from-sibling/);
    } finally {
      // Restore before cleanup — rmSync cannot recurse into (or remove) a directory it has no
      // permission to read or write.
      chmodSync(lockedDir, 0o700);
    }
  });

  it('findWranglerConfigPaths itself does not throw on an unreadable directory, and the out-parameter names it', () => {
    const scanDir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-guard-b24-direct-'));
    tempDirs.push(scanDir);
    const lockedDir = path.join(scanDir, 'locked');
    mkdirSync(lockedDir);

    chmodSync(lockedDir, 0o000);
    try {
      const violations: string[] = [];
      expect(() => findWranglerConfigPaths(scanDir, violations)).not.toThrow();
      expect(findWranglerConfigPaths(scanDir, violations).length).toBeGreaterThanOrEqual(0);
      expect(violations.join('\n')).toMatch(/R11 could not list/);
      expect(violations.join('\n')).toContain(lockedDir);
    } finally {
      chmodSync(lockedDir, 0o700);
    }
  });
});

describe('B6 — the set of declared binding types is exactly the expected set', () => {
  it('the real file declares exactly d1_databases, durable_objects, assets, triggers, vars', () => {
    expectNoViolation(config, rawToml, 'binding types must be exactly');
  });

  it('an unexpected binding type (kv_namespaces) fails, naming §2', () => {
    const mutated = `${rawToml}\n[[kv_namespaces]]\nbinding = "KV"\nid = "x"\n`;
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    const match = violations.find((v) => v.startsWith('the set of declared binding types'));
    expect(match).toBeDefined();
    expect(match).toMatch(/§2/);
    expect(match).toMatch(/No R2, no KV, no Queues, no Workflows/);
  });

  it('an unexpected binding type (r2_buckets) fails', () => {
    const mutated = `${rawToml}\n[[r2_buckets]]\nbinding = "BUCKET"\nbucket_name = "x"\n`;
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.startsWith('the set of declared binding types'))).toBe(true);
  });

  it('an unexpected binding type (queues) fails', () => {
    const mutated = `${rawToml}\n[[queues.producers]]\nbinding = "Q"\nqueue = "x"\n`;
    const mutatedConfig = parse(mutated) as TomlTable;
    const violations = findViolations(mutatedConfig, mutated);
    expect(violations.some((v) => v.startsWith('the set of declared binding types'))).toBe(true);
  });

  it('a removed expected binding type (triggers, unique to the top level) fails', () => {
    const mutatedConfig: TomlTable = { ...config };
    delete mutatedConfig.triggers;
    const violations = findViolations(mutatedConfig, rawToml);
    const match = violations.find((v) => v.startsWith('the set of declared binding types'));
    expect(match).toBeDefined();
    expect(match).toMatch(/missing/);
    expect(match).toMatch(/triggers/);
  });
});

describe('B7 — ENVIRONMENT can only be set by exactly one environment, and only as "local" (revision 2: via the parse tree, in-memory, never on disk)', () => {
  // B21 — these three tests append `[env.<probe>.vars]` to a COPY of the real rawToml text. If
  // the real file ever legitimately gains an `[env.staging]` or `[env.canary]` table of its own
  // (T18/T20 are the likely source), that concatenation collides on the table path and smol-toml's
  // `parse()` throws "Invalid TOML document: trying to redefine an already defined table or
  // value" — an opaque message that names neither B7 nor the real defect. `assertProbeEnvironmentIsFree`
  // checks, before any mutation happens, that the probe name is still unclaimed in whatever config
  // it is handed, so that day's failure is this function's own named message instead.
  it('a second environment in wrangler.toml setting ENVIRONMENT = "local" is caught, and named', () => {
    assertProbeEnvironmentIsFree(config, 'staging');
    const mutated = `${rawToml}\n[env.staging.vars]\nENVIRONMENT = "local"\n`;
    assertMutated(mutated, rawToml, '[env.staging.vars] ENVIRONMENT = "local" appended');
    const configs = new Map<string, TomlTable>([[configPath, parse(mutated) as TomlTable]]);
    const violations = environmentUniquenessViolations(environmentSetters(configs));
    expect(violations.join('\n'), violations.join('\n')).toMatch(/staging/);
  });

  it('a second environment setting ENVIRONMENT to a DIFFERENT value is also caught — the check is on the value, not the environment name', () => {
    assertProbeEnvironmentIsFree(config, 'staging');
    const mutated = `${rawToml}\n[env.staging.vars]\nENVIRONMENT = "staging"\n`;
    assertMutated(mutated, rawToml, '[env.staging.vars] ENVIRONMENT = "staging" appended');
    const configs = new Map<string, TomlTable>([[configPath, parse(mutated) as TomlTable]]);
    const violations = environmentUniquenessViolations(environmentSetters(configs));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join('\n')).toMatch(/staging/);
  });

  it('the scan reports OCCURRENCES, not files: two illegitimate environments in one file are BOTH named', () => {
    assertProbeEnvironmentIsFree(config, 'staging');
    assertProbeEnvironmentIsFree(config, 'canary');
    const mutated =
      `${rawToml}\n[env.staging.vars]\nENVIRONMENT = "staging"\n[env.canary.vars]\nENVIRONMENT = "canary"\n`;
    assertMutated(mutated, rawToml, '[env.staging.vars] and [env.canary.vars] both appended');
    const configs = new Map<string, TomlTable>([[configPath, parse(mutated) as TomlTable]]);
    const violations = environmentUniquenessViolations(environmentSetters(configs));
    expect(violations.join('\n')).toMatch(/staging/);
    expect(violations.join('\n')).toMatch(/canary/);
  });
});

describe('B21 — the probe-name guard used by B7 fails on its own message, not a TOML parse error', () => {
  it('throws its own named error when the probe environment already exists in the config it is given', () => {
    const collidingConfig = { env: { staging: { vars: { some_future_key: 'x' } } } } as TomlTable;
    expect(() => assertProbeEnvironmentIsFree(collidingConfig, 'staging')).toThrow(
      /already defines env\.staging/,
    );
  });

  it('is silent today, against the real file, for both probe names B7 uses', () => {
    expect(() => assertProbeEnvironmentIsFree(config, 'staging')).not.toThrow();
    expect(() => assertProbeEnvironmentIsFree(config, 'canary')).not.toThrow();
  });
});

describe('B10 — workers_dev cannot be overridden per environment', () => {
  it('the real file has no per-environment workers_dev override', () => {
    expectNoViolation(config, rawToml, 'must not override workers_dev');
  });

  it('[env.local.vars] workers_dev = true is caught even though the top level is unchanged', () => {
    const mutated = rawToml.replace(
      'ENVIRONMENT = "local"\n',
      'ENVIRONMENT = "local"\nworkers_dev = true\n',
    );
    assertMutated(mutated, rawToml, '[env.local.vars] workers_dev = true inserted');
    const violations = findViolations(parse(mutated) as TomlTable, mutated);
    const match = violations.find((v) => v.includes('must not override workers_dev'));
    expect(match, violations.join('\n')).toBeDefined();
    expect(match).toMatch(/env\.local/);
  });
});

// --- Checksum guard: mutations above must never touch the real file on disk. This guard no
// longer reads apps/api/src/index.ts at all (see change 11, plan.md revision 2), so a checksum
// of it would be a claim about a file this test has no relationship to. ---
describe('mutation hygiene', () => {
  it('apps/api/wrangler.toml is unchanged by this test file', () => {
    const configChecksumAfter = createHash('sha256')
      .update(readFileSync(configPath, 'utf8'))
      .digest('hex');
    expect(configChecksumAfter).toBe(configChecksumBefore);
  });
});

// --- helpers ---

function readJson(relativePath: string): { devDependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

// --- R11 (revision 2). Parses every wrangler configuration file in the repository and reads
// vars.ENVIRONMENT off the parse tree, rather than regexing arbitrary text for it. See plan.md's
// "Narrowing R11 honestly" and validation-03.md for why revision 1's repo-wide TEXT scan
// (findEnvironmentLocalAssignments, walk(), a UTF-8 sniff and a three-comment-syntax stripper)
// was replaced rather than patched a fourth time: B12 (a same-line `//` or `#` inside a URL
// blanked the real assignment after it) and B13 (block-comment stripping applied to a file with
// no block comments) were both that approach reaching its limit, not one more fixable bug. Only
// three exact filenames are ever read — wrangler.toml, wrangler.json, wrangler.jsonc — because
// those are the only files that can put a value in `env.vars` on the deployed Worker; a `.sh`
// script, a `.env` file (which wrangler never uploads — see .gitignore) and prose in docs/ cannot
// reach the Worker at all (measured, validation-02.md), so there is nothing for this scan to
// exclude them for. ---

const WRANGLER_CONFIG_FILENAMES = new Set(['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']);
const WRANGLER_SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.wrangler']);

// Walks `root` for files named exactly wrangler.toml / wrangler.json / wrangler.jsonc. `root` is
// a parameter rather than a hardcoded `repoRoot`, exactly as revision 1's `roots` parameter was,
// so this is testable in isolation: the fresh-root fixture tests below scan only a temp directory,
// which the real wrangler.toml cannot be inside — so those tests can only pass if the walk
// actually happened (B4).
//
// B19 — a `Dirent` for a symlink returns `false` from BOTH `isFile()` and `isDirectory()`; the
// walk has to `statSync` the target itself to learn what it actually is. Only a symlink that
// resolves to a FILE is followed — a symlinked DIRECTORY is never recursed into, on purpose.
// validation-04 recorded that an infinite symlink loop is currently impossible precisely because
// symlinks were skipped outright; following directories would reintroduce that risk, so this walk
// still never recurses through one. That leaves a symlinked directory containing a wrangler
// config out of reach — named in the coverage-boundary comment at the top of this file rather
// than implied away. A dangling symlink's target does not exist, so `statSync` raises `ENOENT`;
// that is caught and the entry is skipped rather than aborting the whole scan.
//
// B24 — `readdirSync` itself can throw (e.g. `EACCES` on a directory with no read permission).
// That call sat OUTSIDE any try/catch, so the exception used to escape both this function and the
// try/catch `findEnvironmentUniquenessViolations` wraps around `readWranglerConfig` — discarding
// whatever had already been found in this walk and failing with a permissions stack trace instead
// of a named violation. `violations` is an optional out-parameter (existing callers that pass only
// `root` are unaffected — nothing was listening for this failure before, so there is nothing for
// them to lose) that the directory-list failure is pushed onto; the `walk` for that one directory
// stops, but the caller's loop over `readdirSync`'s ALREADIY-read parent entries continues, so a
// sibling directory — and any violation in it — is still reached and still reported.
function findWranglerConfigPaths(root: string, violations: string[] = []): string[] {
  const found: string[] = [];
  function walk(dir: string): void {
    // The whole loop body sits inside this try, not just the `readdirSync` call: a for-of over
    // an array already in hand cannot itself throw, so the only way this try's body raises is
    // `readdirSync` failing before the loop starts (an inline `let entries: Dirent[]` variable
    // would need its own explicit type annotation, and every annotation @types/node accepts for
    // it collides with the overload TypeScript actually infers here — this shape sidesteps that
    // without changing behaviour).
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!WRANGLER_SCAN_SKIP_DIRS.has(entry.name)) walk(fullPath);
          continue;
        }
        if (entry.isFile() && WRANGLER_CONFIG_FILENAMES.has(entry.name)) {
          found.push(fullPath);
          continue;
        }
        if (entry.isSymbolicLink() && WRANGLER_CONFIG_FILENAMES.has(entry.name)) {
          try {
            if (statSync(fullPath).isFile()) found.push(fullPath);
          } catch {
            // Broken symlink (ENOENT on the target) — skip it, do not throw.
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      violations.push(
        `R11 could not list ${dir} — ${message}. An unreadable directory can never be silently ` +
          'treated as one containing no wrangler configuration; fix its permissions or remove it.',
      );
    }
  }
  walk(root);
  return found;
}

// B17 / B20 — revision 1 stripped `//` and `/* */` out of `.jsonc` text with regexes before
// handing it to `JSON.parse`, on the theory that "here the file is KNOWN to be JSONC ... so `//`
// unambiguously means comment". Measurement in validation-04 refuted that theory twice over:
// `{"note1": "begin /*", "vars": {...}, "note2": "*/ end"}` has its `/*` and `*/` sitting inside
// two unrelated STRING VALUES, and the regex read them as one block comment spanning the whole
// `vars` table between them — silently deleting it while leaving the remainder valid JSON (B17,
// the worse of the two: no error, just a wrong answer). And an ordinary field value containing a
// literal `//` — a healthcheck URL — had everything after it on that line blanked, breaking JSON
// syntax and crashing with an opaque `SyntaxError` instead of a named violation (B20). Both are
// the same defect: a comment stripper cannot tell a comment from the same characters inside a
// string without an actual JSON tokenizer, and a smarter regex is a longer fuse on the identical
// problem. **The fix is deletion, not improvement.** `.json` and `.jsonc` are both read with
// plain `JSON.parse` on the raw text, with NO preprocessing whatsoever. A comment-free
// `wrangler.jsonc` parses fine and is read structurally, exactly like a `.json` file; one with
// real comments — or any other `JSON.parse` failure, on any extension — throws, and the caller
// (`findEnvironmentUniquenessViolations`, below) catches that and turns it into a violation naming
// the file, rather than letting it escape as an uncaught exception or (worse) succeeding with the
// wrong answer.
function readWranglerConfig(filePath: string): TomlTable {
  const text = readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.toml')) return parse(text) as TomlTable;
  return JSON.parse(text) as TomlTable;
}

interface EnvironmentSetter {
  file: string;
  environment: string; // 'top-level' or `env.<name>`
  value: unknown;
}

// B23 — a type guard, not a parser. `[[vars]]` / `[[env.<x>.vars]]` parse `vars` to an ARRAY;
// `vars = "nope"` parses it to a string; JSON `"vars": null` parses it to `null`. Every one of
// those makes `(cfg.vars ?? {}).ENVIRONMENT` resolve to `undefined` — indistinguishable from "no
// such key" — so a `vars` this scan cannot read as a table would be silently mistaken for one
// that sets nothing. `vars` absent entirely is fine and reports nothing; `vars` present and not a
// plain object is a NAMED violation (see `environmentSetters` below), never a crash and never a
// silent pass.
function isPlainTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Describes a `vars` this scan cannot read as a table, for the same reason `findViolations`'
// messages name what was expected and what was found rather than just failing an equality check.
function nonTableVarsDescription(value: unknown): string {
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  return (
    `vars is not a table (found ${kind}) — R11 cannot read ENVIRONMENT off it; ` +
    `fix or remove this vars declaration`
  );
}

// Pure — no filesystem access. Given already-parsed configs keyed by a file label, lists every
// vars.ENVIRONMENT assignment across all of them: the top-level `[vars]` table (production, in
// this repo's convention — see plan.md "top level is PRODUCTION") and every `env.<name>.vars`
// table. This is what makes the property testable against an in-memory mutation without ever
// touching disk: the B7 mutation tests below feed this a Map holding a mutated COPY of the real
// parse tree, never apps/api/wrangler.toml itself.
//
// A `vars` that is present but fails the `isPlainTable` guard (B23) is pushed as its own setter,
// with a value string naming the problem — that setter can never be `environment === 'env.local'
// && value === 'local'`, so `environmentUniquenessViolations` reports it as illegitimate and names
// both the file and why, exactly like any other setter it would otherwise reject.
function environmentSetters(configs: Map<string, TomlTable>): EnvironmentSetter[] {
  const setters: EnvironmentSetter[] = [];
  for (const [file, cfg] of configs) {
    if (cfg.vars !== undefined) {
      if (!isPlainTable(cfg.vars)) {
        setters.push({ file, environment: 'top-level', value: nonTableVarsDescription(cfg.vars) });
      } else if (cfg.vars.ENVIRONMENT !== undefined) {
        setters.push({ file, environment: 'top-level', value: cfg.vars.ENVIRONMENT });
      }
    }
    const envs = (cfg.env ?? {}) as TomlTable;
    for (const envName of Object.keys(envs)) {
      const envVars = (envs[envName] as TomlTable | undefined)?.vars;
      if (envVars === undefined) continue;
      if (!isPlainTable(envVars)) {
        setters.push({
          file,
          environment: `env.${envName}`,
          value: nonTableVarsDescription(envVars),
        });
      } else if (envVars.ENVIRONMENT !== undefined) {
        setters.push({ file, environment: `env.${envName}`, value: envVars.ENVIRONMENT });
      }
    }
  }
  return setters;
}

// Pure. Exactly one setter is allowed across every wrangler configuration in the tree, and it
// must be env.local's, set to exactly "local" — T08's bypass is gated on the VALUE, not on the
// environment's NAME, so a second environment setting ENVIRONMENT to anything at all (even
// "local" again, even in a different file) is a violation. Names the offending environment AND
// file: a failure message that does not say which one is the defect B1/B2 were about, and it
// recurred.
function environmentUniquenessViolations(setters: EnvironmentSetter[]): string[] {
  const isLegitimate = (s: EnvironmentSetter) => s.environment === 'env.local' && s.value === 'local';
  const illegitimate = setters.filter((s) => !isLegitimate(s));
  const legitimate = setters.filter(isLegitimate);
  const violations: string[] = [];
  if (illegitimate.length > 0) {
    violations.push(
      'exactly one wrangler configuration in the tree may set vars.ENVIRONMENT, and it must be ' +
        "env.local set to exactly \"local\" — T08's local-Access-bypass is gated on the value, " +
        `not the environment's name; found ${illegitimate.length} illegitimate setter(s): ` +
        illegitimate
          .map((s) => `${s.environment}=${JSON.stringify(s.value)} in ${s.file}`)
          .join('; '),
    );
  } else if (legitimate.length !== 1) {
    violations.push(
      'exactly one wrangler configuration in the tree must set env.local.vars.ENVIRONMENT to ' +
        `"local"; found ${legitimate.length}: ${legitimate.map((s) => s.file).join('; ') || '(none)'}`,
    );
  }
  return violations;
}

// Filesystem entry point: walks every root, parses every wrangler config found under it, and
// runs the pure check above. This is what the real R11 test runs against the whole repository,
// and what the fresh-root fixture tests run against a temp directory holding nothing but a
// planted second config.
//
// B17 / B20 — a parse failure is caught HERE, at the filesystem boundary, rather than left to
// propagate out of `readWranglerConfig`: the pure functions below (`environmentSetters`,
// `environmentUniquenessViolations`) only ever see already-parsed configs, so they stay testable
// against an in-memory Map exactly as before. A file that fails to parse — real `.jsonc`
// comments, a trailing comma, anything else `JSON.parse` or `parse` rejects — is named in its own
// violation string rather than silently excluded from the scan (which would let it be mistaken
// for a config that "sets nothing") and rather than thrown as an uncaught exception (which would
// fail the whole guard on one bad file instead of reporting it as a finding).
function findEnvironmentUniquenessViolations(roots: string[]): string[] {
  const configs = new Map<string, TomlTable>();
  const unparseable: string[] = [];
  // B24 — populated by findWranglerConfigPaths when a directory it tries to list throws
  // (EACCES); see that function's comment. Collected alongside `unparseable` rather than left to
  // propagate, for the identical reason: something this scan cannot read must never be mistaken
  // for something that sets nothing, and it must never abort the rest of the walk either.
  const unlistable: string[] = [];
  for (const root of roots) {
    for (const filePath of findWranglerConfigPaths(root, unlistable)) {
      try {
        configs.set(filePath, readWranglerConfig(filePath));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        unparseable.push(
          `R11 could not read ${filePath} — ${message}. An unparseable wrangler configuration ` +
            'can never be silently treated as one that sets nothing; fix or remove it.',
        );
      }
    }
  }
  return [
    ...unlistable,
    ...unparseable,
    ...environmentUniquenessViolations(environmentSetters(configs)),
  ];
}
