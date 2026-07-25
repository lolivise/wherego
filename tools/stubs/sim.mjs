#!/usr/bin/env node
// Stub for `pnpm test:sim`. The §5.8 simulation harness (38 / 100 / 330 patients,
// deterministic 18-month replay) arrives in Phase 2. A silently-passing stub is worse
// than a missing script — Phase 2 would believe test:sim is already running — so this
// writes to stderr, names itself a stub, names its successor, and exits 0.
process.stderr.write('STUB: test:sim is not implemented yet. Replaced by Phase 2 (§5.8 simulation harness).\n');
process.exit(0);
