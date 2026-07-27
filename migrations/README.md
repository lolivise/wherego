# Migrations

D1 SQL migrations for WhereGo. This directory is a plain directory, **not** a pnpm workspace
member — see `docs/PLAN.md` §2 and
`docs/plans/00-foundations/work/T01-monorepo-scaffold/acceptance.md` R3.

## Rules

- **Migrations are expand-only.** Two-release drops and renames — never drop a column or table in
  the same migration that stops writing to it.
- **A migration touching `patients` drops and recreates `schedulable_patients`.** Read that rule
  before writing anything here, not after.

## `0001_initial_schema.sql`

The entire `docs/PLAN.md` §3 schema, copied verbatim in §3's own statement order: sixteen tables,
the `schedulable_patients` view, all six named indexes and the partial unique index
`uq_visits_cycle_live`. No `IF NOT EXISTS` anywhere — wrangler tracks applied migrations in
`d1_migrations`, so a second application is a bug and must fail loudly rather than silently no-op.

Proven today by `tools/guards/schema-0001.test.ts`, which applies the file to an in-memory
`node:sqlite` database (Node 24's built-in module — no dependency, no wrangler) and asserts
against `sqlite_master`/`PRAGMA` and real inserts. `wrangler.toml` does not exist yet (T04), so
this is not yet applied through `wrangler d1 migrations apply` or checked against real D1 — that is
T06's first act, against Miniflare, and it closes two coverage gaps this test cannot: a different
SQLite build, and wrangler's own comment-aware statement splitter having actually seen this file.
