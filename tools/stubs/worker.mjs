#!/usr/bin/env node
// Stub for `pnpm test:worker`. Real Miniflare D1 coverage (@cloudflare/vitest-pool-workers)
// arrives with T06. A silently-passing stub is worse than a missing script, so this writes
// to stderr, names itself a stub, names T06 as its successor, and exits 0.
process.stderr.write('STUB: test:worker is not implemented yet. Replaced by T06 (@cloudflare/vitest-pool-workers).\n');
process.exit(0);
