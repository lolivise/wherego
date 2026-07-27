// R1–R7 of docs/plans/00-foundations/work/T01-monorepo-scaffold/acceptance.md.
//
// These are config values and directory structure, not behaviour, so each is asserted here
// rather than left as an inspection criterion — a later task cannot quietly undo one.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

// Every code workspace member. `tools` is included for R2 but is not one of the "no build,
// exports -> src/index.ts" packages checked under R6.
const CODE_MEMBERS = [
  { dir: 'apps/api', name: '@wherego/api' },
  { dir: 'apps/web', name: '@wherego/web' },
  { dir: 'packages/scheduler', name: '@wherego/scheduler' },
  { dir: 'packages/domain', name: '@wherego/domain' },
  { dir: 'packages/geo', name: '@wherego/geo' },
  { dir: 'tools', name: '@wherego/tools' },
];

const PURE_PACKAGES = ['packages/scheduler', 'packages/domain', 'packages/geo'];

describe('R1 — the tree exists', () => {
  it('every directory in the §2 repo layout is present', () => {
    const dirs = [
      'apps/api/src/routes',
      'apps/api/src/coordinator',
      'apps/web/src',
      'packages/scheduler/src',
      'packages/domain/src',
      'packages/geo/src',
      'tools',
      'migrations',
      'docs',
    ];
    for (const dir of dirs) {
      expect(statSync(path.join(repoRoot, dir)).isDirectory(), `${dir} should exist`).toBe(true);
    }
  });

  // apps/api/wrangler.toml was out of scope for T01 (see this task's own file, "Explicitly
  // not required") and is asserted absent by an earlier revision of this test. T04
  // (docs/plans/00-foundations/tasks/T04-wrangler-config.md) is the task that creates it,
  // still within Phase 0 — so the boundary this test protects moves here, not away. Only the
  // CI directory, owned by T10, remains asserted absent.
  it('does not create a .github directory (out of scope until T10)', () => {
    expect(existsSync(path.join(repoRoot, '.github'))).toBe(false);
  });
});

describe('R2 — workspace membership under the @wherego/ scope', () => {
  const workspaceYaml = readText('pnpm-workspace.yaml');

  it('pnpm-workspace.yaml covers apps/*, packages/* and tools', () => {
    expect(workspaceYaml).toMatch(/apps\/\*/);
    expect(workspaceYaml).toMatch(/packages\/\*/);
    expect(workspaceYaml).toMatch(/(^|\s)tools(\s|$)/m);
  });

  it.each(CODE_MEMBERS)('$name at $dir is named under the @wherego/ scope', ({ dir, name }) => {
    const manifest = readJson(`${dir}/package.json`) as { name?: string };
    expect(manifest.name).toBe(name);
    expect(manifest.name?.startsWith('@wherego/')).toBe(true);
  });
});

describe('R3 — migrations/ is tracked, not a workspace member', () => {
  it('exists and holds a README rather than being an empty, untrackable directory', () => {
    expect(existsSync(path.join(repoRoot, 'migrations/README.md'))).toBe(true);
  });

  it('is not ignored by git, i.e. it is capable of being tracked', () => {
    let ignored = false;
    try {
      // git check-ignore exits 0 (ignored) or 1 (not ignored). 1 is what we want here.
      execFileSync('git', ['check-ignore', 'migrations/README.md'], { cwd: repoRoot });
      ignored = true;
    } catch (error) {
      const execError = error as { status?: number };
      if (execError.status !== 1) {
        throw error;
      }
    }
    expect(ignored).toBe(false);
  });

  it('is not declared as a pnpm workspace package', () => {
    const workspaceYaml = readText('pnpm-workspace.yaml');
    expect(workspaceYaml).not.toMatch(/migrations/);
    expect(existsSync(path.join(repoRoot, 'migrations/package.json'))).toBe(false);
  });
});

describe('R4 — strict: true, inherited and never weakened', () => {
  const base = readJson('tsconfig.base.json') as { compilerOptions?: Record<string, unknown> };

  it('tsconfig.base.json sets strict: true', () => {
    expect(base.compilerOptions?.strict).toBe(true);
  });

  const STRICTNESS_FLAGS = [
    'strict',
    'noImplicitAny',
    'strictNullChecks',
    'strictFunctionTypes',
    'strictBindCallApply',
    'strictPropertyInitialization',
    'noImplicitThis',
    'alwaysStrict',
    'useUnknownInCatchVariables',
    'noUncheckedIndexedAccess',
    'noImplicitOverride',
    'noFallthroughCasesInSwitch',
    'isolatedModules',
    'verbatimModuleSyntax',
  ];

  it.each(CODE_MEMBERS)('$dir/tsconfig.json extends the base and weakens no strictness flag', ({ dir }) => {
    const tsconfig = readJson(`${dir}/tsconfig.json`) as {
      extends?: string;
      compilerOptions?: Record<string, unknown>;
    };
    expect(tsconfig.extends).toBeDefined();
    const resolved = path.resolve(repoRoot, dir, tsconfig.extends as string);
    expect(resolved).toBe(path.join(repoRoot, 'tsconfig.base.json'));

    const overrides = tsconfig.compilerOptions ?? {};
    for (const flag of STRICTNESS_FLAGS) {
      if (flag in overrides) {
        expect(overrides[flag], `${dir} must not weaken ${flag}`).not.toBe(false);
      }
    }
  });
});

// B4 (validation-01.md): `expect(root.engines?.node).toMatch(/24/)` passes for `>=24`, `^24`
// and `24.x.x` alike — a regex that only checks the digits "24" appear cannot distinguish a
// pin from an open-ended range. `>=24` is satisfied by Node 25, 26 and every major after that
// forever, which is not what R5's "and the two agree" requires. This evaluates the range the
// same way `.nvmrc`'s pin would be checked against it — is major 24 admitted, and is major 25
// excluded — rather than pattern-matching the string.
type Version = [number, number, number];

function parseVersion(raw: string): Version {
  const parts = raw.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareVersions([aMajor, aMinor, aPatch]: Version, [bMajor, bMinor, bPatch]: Version): number {
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

// Enough to evaluate the range shapes actually valid for `engines.node`: a space-separated
// (AND) list of comparator tokens (`>=24 <25`), a caret (`^24`), a tilde (`~24`), or a bare
// pin (`24` / `24.1.2`). Not a general-purpose semver-range parser.
function nodeEngineRangeAdmits(range: string, version: string): boolean {
  const target = parseVersion(version);
  return range
    .trim()
    .split(/\s+/)
    .every((token) => {
      const match = token.match(/^(>=|<=|>|<|\^|~)?(\d+(?:\.\d+){0,2})$/);
      const rawBound = match?.[2];
      if (!rawBound) {
        throw new Error(`Unsupported engines.node token for this guard: "${token}"`);
      }
      const op = match[1] ?? '=';
      const bound = parseVersion(rawBound);
      const cmp = compareVersions(target, bound);
      switch (op) {
        case '>=':
          return cmp >= 0;
        case '<=':
          return cmp <= 0;
        case '>':
          return cmp > 0;
        case '<':
          return cmp < 0;
        case '^':
        case '~':
          // Only major-version pins are used for engines.node in this repo; both
          // operators collapse to "same major, at or above the given version".
          return target[0] === bound[0] && cmp >= 0;
        default:
          return cmp === 0;
      }
    });
}

describe('R5 — Node 24 pinned in .nvmrc and engines.node, agreeing', () => {
  it('.nvmrc pins major version 24', () => {
    expect(readText('.nvmrc').trim()).toBe('24');
  });

  it('root engines.node admits Node 24 (agrees with .nvmrc) and cannot admit Node 25', () => {
    const root = readJson('package.json') as { engines?: { node?: string } };
    const range = root.engines?.node;
    expect(range).toBeDefined();
    // Agreement with .nvmrc: the pinned major, at both ends of its patch range, satisfies it.
    expect(nodeEngineRangeAdmits(range as string, '24.0.0')).toBe(true);
    expect(nodeEngineRangeAdmits(range as string, '24.99.99')).toBe(true);
    // The regression this guards against: `>=24` alone is satisfied by 25, 26, ... forever.
    expect(nodeEngineRangeAdmits(range as string, '25.0.0')).toBe(false);
  });
});

describe('R6 — packages/* have no build script; exports resolve to src/index.ts', () => {
  it.each(PURE_PACKAGES)('%s has no build script', (dir) => {
    const manifest = readJson(`${dir}/package.json`) as { scripts?: Record<string, string> };
    expect(manifest.scripts?.build).toBeUndefined();
  });

  it.each(PURE_PACKAGES)('%s exports resolve to ./src/index.ts', (dir) => {
    const manifest = readJson(`${dir}/package.json`) as { exports?: Record<string, string> | string };
    const exportsField = manifest.exports;
    const entry = typeof exportsField === 'string' ? exportsField : exportsField?.['.'];
    expect(entry).toBe('./src/index.ts');
  });

  it('root build script is the web build only', () => {
    const root = readJson('package.json') as { scripts?: Record<string, string> };
    expect(root.scripts?.build).toBe('pnpm --filter @wherego/web build');
  });
});

// B3 (validation-01.md): only `scripts.build` had a regression guard. Renaming `typecheck`,
// `lint`, `test`, `test:sim` or `test:worker` in the root package.json left `pnpm test`
// green, even though `ci.yml` (T10) and `deploy.yml` (T16) hard-code all six names verbatim.
describe('Scenario 3 — all six CI script names exist at the repo root', () => {
  const EXPECTED_SCRIPTS: Record<string, string> = {
    typecheck: 'pnpm -r --parallel typecheck',
    lint: 'eslint .',
    test: 'vitest run',
    'test:sim': 'node tools/stubs/sim.mjs',
    'test:worker': 'node tools/stubs/worker.mjs',
    build: 'pnpm --filter @wherego/web build',
  };

  it.each(Object.entries(EXPECTED_SCRIPTS))('root package.json declares script "%s"', (name, command) => {
    const root = readJson('package.json') as { scripts?: Record<string, string> };
    expect(root.scripts?.[name], `expected a "${name}" script`).toBe(command);
  });
});

describe('Scenario 8 — vitest is never configured to pass vacuously', () => {
  it('passWithNoTests does not appear anywhere in vitest.config.ts', () => {
    const config = readText('vitest.config.ts');
    expect(config).not.toMatch(/passWithNoTests/);
  });
});

describe('R7 — Phase 2 scheduler filenames are not created as stubs', () => {
  const PHASE_2_FILES = [
    'candidates.ts',
    'reachability.ts',
    'assign.ts',
    'route.ts',
    'rules.ts',
    'mutate.ts',
    'catchup.ts',
    'simulate.ts',
  ];

  it.each(PHASE_2_FILES)('packages/scheduler/src/%s does not exist yet', (file) => {
    expect(existsSync(path.join(repoRoot, 'packages/scheduler/src', file))).toBe(false);
  });
});
