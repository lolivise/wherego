# Migrations

D1 SQL migrations for WhereGo. This directory is a plain directory, **not** a pnpm workspace
member — see `docs/PLAN.md` §2 and
`docs/plans/00-foundations/work/T01-monorepo-scaffold/acceptance.md` R3.

## Rules

- **Migrations are expand-only.** Two-release drops and renames — never drop a column or table in
  the same migration that stops writing to it.
- **A migration touching `patients` drops and recreates `schedulable_patients`.** Read that rule
  before writing anything here, not after.
- No migration is written by this task. Migration `0001` arrives with T05.
