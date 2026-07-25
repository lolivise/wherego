// B2 (validation-01.md): neither apps/api/package.json nor apps/web/package.json declared a
// workspace dependency on any @wherego/* package. Under pnpm's strict, non-hoisting linking, a
// workspace package that is not a declared dependency of its consumer has no symlink under the
// consumer's node_modules — `import ... from '@wherego/domain'` fails with TS2307 in tsc and
// Rollup cannot resolve it at build time, even though the package exists in the monorepo.
//
// A guard that only reads package.json strings would pass the moment the string is present,
// whether or not `pnpm install` actually created the link. This guard instead asks Node's own
// module resolver — scoped to a file inside each app's src/, exactly where a real import would
// live — to resolve the specifier, so it fails unless the workspace symlink genuinely exists.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Deliberately a plain `node` subprocess rather than `createRequire` called in-process.
// Vitest/Vite install their own module-resolution hooks for the whole test process (for
// mocking and HMR), which resolve workspace packages by source location regardless of
// whether pnpm actually linked them under the consumer's node_modules — so an in-process
// check would pass even before B2 is fixed and prove nothing. A subprocess started with
// plain `node` has none of that machinery: it resolves exactly the way `tsc` and Rollup do.
function resolvableFrom(consumerSourceFile: string, specifier: string): boolean {
  const script = `
    const { createRequire } = require('node:module');
    const path = require('node:path');
    const req = createRequire(path.join(${JSON.stringify(repoRoot)}, ${JSON.stringify(consumerSourceFile)}));
    try {
      req.resolve(${JSON.stringify(specifier)});
      process.exit(0);
    } catch {
      process.exit(1);
    }
  `;
  // NODE_PATH is stripped: vitest's own process sets it to pnpm's shared virtual store
  // (`.pnpm/node_modules`), which would let the child find *any* package pnpm has ever
  // linked anywhere in the workspace — not just what this consumer actually depends on.
  // tsc and Rollup do not honour NODE_PATH either, so leaving it in would make this test
  // pass regardless of whether apps/api or apps/web declares the dependency.
  const envWithoutNodePath = { ...process.env };
  delete envWithoutNodePath.NODE_PATH;
  try {
    execFileSync(process.execPath, ['-e', script], { cwd: repoRoot, env: envWithoutNodePath });
    return true;
  } catch {
    return false;
  }
}

describe('apps can resolve their declared @wherego/* workspace imports', () => {
  it('apps/api can resolve @wherego/domain, @wherego/scheduler and @wherego/geo', () => {
    expect(resolvableFrom('apps/api/src/index.ts', '@wherego/domain')).toBe(true);
    expect(resolvableFrom('apps/api/src/index.ts', '@wherego/scheduler')).toBe(true);
    expect(resolvableFrom('apps/api/src/index.ts', '@wherego/geo')).toBe(true);
  });

  it('apps/web can resolve @wherego/domain', () => {
    expect(resolvableFrom('apps/web/src/main.tsx', '@wherego/domain')).toBe(true);
  });
});
