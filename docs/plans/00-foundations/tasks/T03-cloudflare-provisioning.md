# T03 · Cloudflare provisioning — Workers Paid and D1 in APAC

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-03 (provisioning half)
**Spec** `docs/PLAN.md` §2, §10.4, §10.7 step 1 · **Depends on** T02 · **State** `todo`
**Execution** **manual** — a purchase and a dashboard/CLI action. No code.

## Outcome

The Cloudflare account confirmed in T02 is on Workers Paid, and a D1 database with primary region
APAC exists with its `database_id` recorded for T04.

## Scope

- **In:** confirming/enabling Workers Paid, creating the D1 database in APAC, capturing
  `database_id`.
- **Out:** everything in `wrangler.toml` (T04). Applying migrations (T05, T06). The Cloudflare API
  token (T15, §10.2).

## Detail

**Workers Paid is a hard prerequisite**, carried verbatim from §2 because "we'll upgrade if we need
to" is exactly the decision this reasoning exists to pre-empt:

> Held–Karp, the catch-up backfill, the nightly rule audit and the §5.5 ranker are all comfortable
> at the paid plan's 30 s CPU ceiling and all impossible at the free plan's 10 ms.

Buy it on the account identified in T02 — that ordering is the whole reason T02 exists.

D1 primary region **APAC**. This is set at creation and is the kind of thing that cannot be changed
later without a migration of the data itself. It is also the fact the clinic acknowledges in the
cross-border-transfer paragraph of T11 (§9.1): *D1 has no Taiwan region and runs APAC.*

`database_id` is **not a secret** (§10.4) — it goes in `wrangler.toml`, in git, in plain text,
alongside the three cron expressions and the `settings` defaults.

## Manual checklist

1. Confirm the account is on **Workers Paid**. Record the plan shown on the billing page.
2. Create the D1 database, primary region **APAC**. Name it `wherego` — §11.2 and §11.3 invoke
   `wrangler d1 migrations apply wherego` and `wrangler d1 export wherego` by that name.
3. Record `database_id`. Hand it to T04.
4. Do **not** create the API token here; that is T15, and it needs exactly the five permissions
   in §10.2.

## Acceptance criteria

- [ ] The account holding the zone from T02 is on Workers Paid, verified on the billing page.
- [ ] A D1 database named `wherego` exists with primary region APAC, verified by
      `wrangler d1 info wherego` or the dashboard.
- [ ] Its `database_id` is recorded and available to T04.
- [ ] No credential created in this task is written into the repo.

## Validation

`wrangler d1 list` / `wrangler d1 info wherego` shows the database and its region. Workers Paid is
confirmed by reading the billing page — there is no API assertion for it, and claiming it without
looking is the failure mode. Nothing here is agent-executable.

## Open questions

None.
