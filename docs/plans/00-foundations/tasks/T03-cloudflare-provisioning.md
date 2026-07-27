# T03 · Cloudflare provisioning — confirm the Workers plan and create D1 in APAC

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-03 (provisioning half)
**Spec** `docs/PLAN.md` §2, §10.4, §10.7 step 1 · **Depends on** T02 · **State** `todo`
**Execution** **manual** — a dashboard/CLI action. No code. **No purchase.**

## Outcome

The Workers plan in force on the T02 account is confirmed and recorded, and a D1 database named
`wherego` with primary region APAC exists with its `database_id` recorded for T04.

## Scope

- **In:** reading and recording the Workers plan, creating the D1 database in APAC, capturing
  `database_id`.
- **Out:** everything in `wrangler.toml` (T04). Applying migrations (T05, T06). The Cloudflare API
  token (T15, §10.2). **Upgrading to Workers Paid** — that is a Phase 2 decision, taken against a
  measurement (§2).

## Detail

**This task no longer buys anything.** It previously did. §2 has been revised: WhereGo starts on the
**Workers Free plan**, and Paid is a one-click escape hatch rather than a prerequisite.

The reasoning that changed, and why it is worth knowing rather than just complying with: the earlier
position called Paid *"a hard prerequisite"* and said four scheduler workloads were *"impossible at
the free plan's 10 ms."* **Nothing measured that** — none of the four exist yet — and the premise
that forced Paid regardless has since gone away, because **Durable Objects now run on the Free
plan.** The restriction is that only the **SQLite storage backend** is available, which T04 must
honour.

What the Free plan actually constrains is **per-invocation**, so the clinic's small volume does not
help:

| | Free | Paid |
|---|---|---|
| CPU per invocation | **10 ms**, not raisable | 30 s default, up to 5 min |
| Subrequests per invocation | **50** | 10,000 |
| D1 queries per invocation | **50** | 1,000 |
| Requests/day · storage · crons | 100,000 · 5 GB · 5 | unlimited · 1 TB · 250 |

Requests, storage and crons are never in question here — the spec uses 3 crons and a few hundred
patients. **The three real pressure points are the nightly planning cron (CPU), first-import
geocoding (one subrequest per new address, so 50 ≈ 50 patients), and the weekly `age`-encrypted D1
export (§11.3, CPU).**

D1 primary region **APAC**. Set at creation, and not changeable later without migrating the data
itself. It is also the fact the clinic acknowledges in the cross-border-transfer paragraph of T11
(§9.1): *D1 has no Taiwan region and runs APAC.* **The APAC region and the 5 GB / 500 MB free
storage ceilings are unrelated** — the region decision is unaffected by the plan.

`database_id` is **not a secret** (§10.4) — it goes in `wrangler.toml`, in git, in plain text,
alongside the three cron expressions and the `settings` defaults.

## Manual checklist

1. Read the account's Workers plan on the billing page. **Record what it says** — do not assume
   Free just because nothing was bought. If the account is already on Paid for something else,
   record that instead and say so; it changes T04's `limits.cpu_ms` decision.
2. Create the D1 database, primary region **APAC**. Name it `wherego` — §11.2 and §11.3 invoke
   `wrangler d1 migrations apply wherego` and `wrangler d1 export wherego` by that name.
3. Record `database_id`. Hand it to T04.
4. Do **not** create the API token here; that is T15, and it needs exactly the five permissions
   in §10.2.
5. Do **not** upgrade to Paid. If Phase 2's measurement calls for it, it is one setting, applies
   account-wide, and needs no redeploy.

## Recorded — 2026-07-26

**This section is the single source for T04.**

| | |
|---|---|
| **Workers plan** | **Free.** Read from Manage Account → Billing → Subscriptions. No Workers Paid subscription is listed; the only `PLANS` entry is the zone's own Free Plan for `storium.work`. **Nothing was purchased** |
| **D1 `database_id`** | `f5adacb4-abce-41c9-aa82-86dc3b6f8334` — not a secret (§10.4); it belongs in `wrangler.toml`, in git, in plain text |
| **D1 name** | `wherego` |
| **D1 primary region** | APAC |
| **Zero Trust** | **Teams Free Base, Active** — see below. Not something this task went looking for |

**Consequences for T04, both already recorded there:** `[limits]` is **omitted** — `cpu_ms` is a
Paid-only setting — and `PlanCoordinator` is declared under `new_sqlite_classes`, because key-value
Durable Objects are Paid-only and the SQLite backend is what Free provides.

**Consequence for T19, found here rather than at T19:** the account already has **Zero Trust on
Teams Free Base**, which is what the Access application needs, and it covers up to 50 users against
a clinic of a handful. So §9's email-OTP design costs nothing and T19 has no purchase either — the
question T19 would otherwise have had to ask at the point of building it.

## Acceptance criteria

- [ ] The Workers plan on the T02 account is recorded, read from the billing page rather than
      assumed.
- [ ] A D1 database named `wherego` exists with primary region APAC, verified by
      `wrangler d1 info wherego` or the dashboard.
- [ ] Its `database_id` is recorded and available to T04.
- [ ] No credential created in this task is written into the repo.
- [ ] **Nothing was purchased.**

## Validation

`wrangler d1 list` / `wrangler d1 info wherego` shows the database and its region. The plan is
confirmed by reading the billing page — there is no API assertion for it, and claiming it without
looking is the failure mode. Nothing here is agent-executable.

## Open questions

None. **The Free-vs-Paid question is settled for now and deliberately left open for Phase 2**, which
measures the real planner against 10 ms CPU. The escape hatch, if it is needed, is that the planner
is capped per doctor and therefore splits into one invocation per doctor without touching the data
model.
