import { defineConfig } from 'vitest/config';

// A single root project, rather than one per package, avoids "no tests found"
// failures while packages/geo and packages/domain are still empty in this task.
// The vitest option that would allow an empty run to succeed is deliberately not
// set anywhere in this file — Scenario 8 of
// docs/plans/00-foundations/work/T01-monorepo-scaffold/acceptance.md requires
// vitest to fail rather than pass vacuously when it finds no test files.
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'tools/guards/**/*.test.ts',
    ],
  },
});
