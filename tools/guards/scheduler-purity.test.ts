// Scenario 6 of docs/plans/00-foundations/work/T01-monorepo-scaffold/acceptance.md.
//
// packages/scheduler must stay pure — no Cloudflare runtime, no database, no network,
// no web framework. This is a property of a file, so it is a real test, not an inspection.
// It fails the moment someone adds `hono` (or similar) to the pure package.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'packages/scheduler/package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

// Matches Cloudflare, database, HTTP-client, web-framework and date-library package
// names. Date libraries are here too (validation-02.md N1) — declaring one in
// packages/scheduler's manifest is itself the violation the manifest check exists to
// catch; the mirror-image ban on *importing* one lives in the no-restricted-imports
// rule in eslint.config.js. Belt and braces: this catches declaring it, that catches
// using it.
const FORBIDDEN_NAME = [
  /cloudflare/i,
  /wrangler/i,
  /^hono$/i,
  /^express$/i,
  /^koa$/i,
  /^fastify$/i,
  /^itty-router$/i,
  /^axios$/i,
  /^node-fetch$/i,
  /^got$/i,
  /^undici$/i,
  /^ky$/i,
  /^d1$/i,
  /sqlite/i,
  /^pg$/i,
  /^mysql/i,
  /^knex$/i,
  /^prisma/i,
  /^drizzle/i,
  /^dayjs$/i,
  /^date-fns$/i,
  /^moment$/i,
  /^luxon$/i,
  /^js-joda$/i,
  /^@js-joda\/core$/i,
  /^dateformat$/i,
  /^temporal-polyfill$/i,
  /^@js-temporal\/polyfill$/i,
];

// N1 (validation-02.md): `dependencies` and `peerDependencies` were checked, but not
// `devDependencies` — so a date library declared only in devDependencies walked past
// this guard entirely, even though pnpm installs devDependencies by default and
// Wrangler bundles whatever ends up imported. Extracted so the regression test below
// can exercise it against a synthetic manifest without installing a real package.
function findForbiddenNames(candidate: {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): string[] {
  const names = [
    ...Object.keys(candidate.dependencies ?? {}),
    ...Object.keys(candidate.peerDependencies ?? {}),
    ...Object.keys(candidate.devDependencies ?? {}),
  ];
  return names.filter((name) => FORBIDDEN_NAME.some((re) => re.test(name)));
}

describe('packages/scheduler declares no impure dependency', () => {
  it('has empty or absent dependencies', () => {
    const deps = manifest.dependencies;
    expect(deps === undefined || Object.keys(deps).length === 0).toBe(true);
  });

  it('declares no dependency, peerDependency or devDependency matching a forbidden name', () => {
    expect(findForbiddenNames(manifest)).toEqual([]);
  });

  // N1 (validation-02.md): reproduces "add dayjs to packages/scheduler's
  // devDependencies and the suite stays green" without installing dayjs for real — a
  // synthetic manifest shaped like the real one, per the task's instruction not to
  // install a package to prove this.
  it('N1: a date library declared only in devDependencies is caught', () => {
    const offenders = findForbiddenNames({ devDependencies: { dayjs: '^1.11.0' } });
    expect(offenders).toEqual(['dayjs']);
  });
});
