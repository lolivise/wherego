# Validation 01 — T03 Cloudflare provisioning

**Verdict** PASS WITH NOTES (0 bugs; 1 criterion user-attested, not independently verified) · **Date** 2026-07-26 · **Attempt** 1

Manual task. Nothing here is agent-executable and nothing touches a third party that needs a mock.
No credential was created, read or written.

## What was observed

The billing page, **Manage Account → Billing → Subscriptions**:

| Category | Product | Status | Pricing |
|---|---|---|---|
| ZERO TRUST | Teams Free Base | Active, renews 2026-08-13 | $0.00/mo |
| PLANS | Free Plan · `storium.work` | Active | — |

**There is no Workers subscription line.** Cloudflare lists Workers Paid as its own `PLANS` entry
when it is held; the only `PLANS` row here is the zone's Free Plan for `storium.work`. The Workers
plan is therefore **Free**, and it was **read rather than assumed** — which is what the checklist
asked for, because an account already on Paid for something else would have reversed T04's
`[limits]` decision.

The evidence is absence-based, and that is stated rather than dressed up: the page proves no Workers
Paid subscription exists, which is the same thing as Free.

## Acceptance criteria

| | Criterion | | |
|---|---|---|---|
| 1 | Workers plan recorded, read from the billing page | ✅ | Free. Screenshot of Subscriptions; no Workers Paid row |
| 2 | D1 named `wherego`, primary region APAC | ⚠️ | **User-attested, not independently verified** — see the gap below |
| 3 | `database_id` recorded and available to T04 | ✅ | `f5adacb4-abce-41c9-aa82-86dc3b6f8334`, now in the task file's `## Recorded` section |
| 4 | No credential written into the repo | ✅ | None created. `database_id` is not a secret (§10.4) and is deliberately in plain text |
| 5 | **Nothing was purchased** | ✅ | Every line on the page is $0.00 or `—` |

## Findings carried forward

**Zero Trust is already on Teams Free Base, Active.** Not something this task went looking for, and
it answers a question **T19** would otherwise have had to raise at the moment of building the Access
application: the account has Zero Trust, the free tier covers 50 users against a clinic of a handful,
and §9's email-OTP policy therefore costs nothing. **T19 has no purchase either.** Recorded in
T03's task file and in T19's.

**T02's open account risk is now closed by construction.** The billing page shows `storium.work`
under this account's subscriptions, so the zone and the account that holds D1 are demonstrably the
same — which is stronger than T02's evidence, where the match rested on the user's statement because
DNS cannot distinguish accounts. The re-check T02 asked for before T03 spent anything has effectively
happened, and nothing was spent.

## Coverage gaps

1. **The D1 name and region were not read back.** `wrangler d1 info wherego` is the check, and
   wrangler is not installed — it is not yet a dependency of this repo, and the API token that would
   allow a scripted check is deliberately T15. The `database_id` is a value the user supplied; the
   name and APAC region rest on the instruction having been followed.

   **This matters more than the usual attestation gap, because the region is the one irreversible
   choice in the task** — it is fixed at creation and can only be changed later by migrating the
   data. A wrong region is cheap to fix today and expensive after Phase 4.

   **Closes at T06**, which is the first time wrangler exists and actually talks to D1; a name
   mismatch fails `wrangler d1 migrations apply wherego` immediately and unmistakably. The region is
   not surfaced by that command, so it should be eyeballed on the dashboard before then.
2. **The plan reading is absence-based**, as described above. It is the correct reading of the page,
   but it is not a positive "Workers: Free" statement from Cloudflare.
