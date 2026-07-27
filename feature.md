# Features

What WhereGo does today. Every entry is implemented and validated; nothing here is planned.

## Nothing yet

**There is no user-facing feature.** No patient can be imported, no visit can be scheduled, no
route can be computed, no message can be sent. `apps/web` renders a placeholder, and `apps/api`
serves that placeholder and nothing else — every request falls through to the static-asset binding.

T01 delivered the monorepo scaffold, T05 the complete database schema, T04 the Worker's
configuration. All three are infrastructure, not capabilities, and none gets an entry here, by the
rule that this file records what a person can **do**. Nothing has been deployed, and the schema is
not applied to a database yet; that is T06.

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
- **The schema cannot drift from `docs/PLAN.md` §3** — the migration is asserted byte-identical to
  the spec, so changing one without the other fails the build. `T05`
- **A seventh patient column cannot be added unnoticed** — `patients` is pinned to exactly its 23
  columns in both directions, and the six excluded CSV fields (身分證號 · 性別 · 主診斷 · 照護階段 ·
  機構簡稱 · 里) cannot appear in executable DDL, only in comments. Every other table is pinned the
  same way, and no table, view, index or trigger can be added without failing. `T05`
- **The Worker cannot be configured out from behind Cloudflare Access** — `workers_dev` must be the
  boolean `false` in every environment, because a `*.workers.dev` hostname cannot be placed behind
  Access; and `run_worker_first` must be the boolean `true`, never the array form, which inverts the
  default for every unlisted path so those requests never reach the Worker at all. Both were
  measured rather than assumed, and the measurement table is a comment in the file. `T04`
- **No wrangler configuration anywhere in the repository can set `ENVIRONMENT` outside
  `[env.local]`** — every `wrangler.toml`/`.json`/`.jsonc` in the tree is parsed and exactly one
  `vars` table may set it, to exactly `"local"`. T08's Access bypass is gated on that value rather
  than on an environment's name, so a second setter of any value fails the build. A config the scan
  cannot read — unparseable, an unreadable directory, a `vars` that is not a table — is itself a
  named violation, never silently treated as one that sets nothing. `T04`
- **The `[env.local]` bindings cannot drift from the top-level ones** — wrangler inherits neither
  `d1_databases` nor `durable_objects` into a named environment, so both are duplicated and asserted
  deep-equal in both directions. Without that, the one environment that can run locally is the one
  with no database. `T04`
- **The Worker's stub cannot stop falling through to the assets binding** — proven by invoking it,
  with a spy standing in for `ASSETS`, called both the way the test likes and the way the Durable
  Object runtime actually calls it. `T04`
- **No §10.3 secret name can be committed into `wrangler.toml`**, as a key or a value; a `[limits]`
  block cannot reappear (Paid-only on a Free account); and `new_sqlite_classes` cannot become
  `new_classes`, whose failure would not surface until the Durable Object was first instantiated in
  production. `T04`
- **The three deliberate absences of constraint are protected** — a missed or cancelled attempt can
  coexist with a live one for the same prescription cycle, general visits are unconstrained, and a
  crashed plan run can be retried on the same date. Replacing the partial index with a plain table
  constraint fails the build. `T05`
