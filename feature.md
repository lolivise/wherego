# Features

What WhereGo does today. Every entry is implemented and validated; nothing here is planned.

## Nothing yet

**There is no user-facing feature.** No patient can be imported, no visit can be scheduled, no
route can be computed, no message can be sent. `apps/web` renders a placeholder and `apps/api`
returns 501.

T01 delivered the monorepo scaffold — workspaces, TypeScript, lint, test and build — which is
infrastructure, not a capability. It gets no entry here, by the rule that this file records what a
person can do.

The first entries will arrive with Phase 1 (CSV import and geocoding). `docs/plans/ROADMAP.md` has
the order.

## Enforced invariants

Not features, but the guarantees the build makes about itself, because they are the only thing
this repository currently *does* and they are checkable:

- **`Date` cannot be used inside `packages/scheduler`** — the bare global, `globalThis`/`self`/
  `window` access, type position, `typeof` queries, `Intl`, `performance` and imported date
  libraries are all lint errors, and the ban is proven not to leak into the packages that need
  dates. `T01`
- **`packages/scheduler` cannot declare a Cloudflare, database, HTTP or date-library dependency** —
  in `dependencies`, `peerDependencies` or `devDependencies`. `T01`
- **A patient CSV cannot be committed** — `*.csv` is ignored, with a narrow exception for synthetic
  fixtures under `tools/fixtures/`. `T01`
- **The six CI script names cannot be renamed unnoticed** — `ci.yml` and `deploy.yml` hard-code
  them. `T01`
