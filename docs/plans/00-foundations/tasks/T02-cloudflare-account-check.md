# T02 · Confirm the zone and the Worker share a Cloudflare account; choose the app hostname

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-01 (first half)
**Spec** `docs/PLAN.md` §2, §10.7 step 0, §11.2 · **Depends on** — · **State** `todo`
**Execution** **manual** — Cloudflare dashboard. No code.

## Outcome

It is confirmed in writing that the existing active zone sits in the Cloudflare account that will
hold the Worker, and the app hostname is decided and recorded.

## Scope

- **In:** the account check, the hostname decision, recording both.
- **Out:** binding the custom domain (T18 — it needs a deployed Worker). Creating the Access
  application (T19). Setting `workers_dev = false` (T04, in `wrangler.toml`).

## Detail

**The domain is already registered in Cloudflare and the zone is active.** The wall-clock risk this
task originally carried is gone. What remains is one check and one decision, and the check is the
only thing left in P0-01 that can bite. Carried verbatim from the plan:

> **Confirm the zone sits in the same Cloudflare account that will hold the Worker.** This is the
> one thing left in this task that can bite: a zone under one account and a Worker under another
> cannot see each other, the Workers Route cannot be created, and the Access application has no
> hostname to sit in front of. Check it now, before P0-03 provisions D1 on an account — finding
> it at P0-06 means moving either the zone or the billing relationship mid-week.

This is why the task runs **before** T03 (the Workers plan check and D1) rather than alongside the
binding. T03 no longer buys anything — §2 was revised to start on the Free plan — but the account
question is unchanged: D1 is created on an account, and it must be the zone's.

Why the hostname is decided here and not later: the same hostname becomes the Worker's custom
domain (T18), the Access application's domain (T19), the LINE webhook URL (T13) and the `APP_HOST`
GitHub Environment variable used by the deploy smoke test (T16). **Decide it once, here.** A
subdomain of the existing zone is fine and leaves the apex alone.

Why any of this is load-bearing rather than cosmetic (§2, §9): Cloudflare Access applications are
defined over a hostname in a zone you control, and **`*.workers.dev` cannot be placed behind
Access** — so the whole authentication design routes through this binding.

## Manual checklist

1. Cloudflare dashboard → the zone → **Overview**. Record the **Account ID** shown for the zone.
2. Cloudflare dashboard → the account that will hold the Worker → record its **Account ID**.
3. **They must be the same string.** If they are not, stop and resolve it before T03 — moving a
   zone between accounts, or moving the billing relationship, is the decision, and it is far
   cheaper now than at T19.
4. Confirm the zone status is **Active** (not Pending Nameserver Update).
5. Choose the app hostname. Record it.
6. Record the hostname and both account IDs where T04, T13, T16 and T19 will read them —
   the hostname is not a secret; the account id belongs in 1Password (T15) per §10.2.

## Decided — 2026-07-26

**This section is the single source. T04, T13, T16, T18 and T19 reference it; none of them
re-decides it.**

| | |
|---|---|
| **Zone** | `storium.work` — owned by the user, registered in Cloudflare |
| **App hostname** | **`wherego.storium.work`** |
| **Shape** | Subdomain, not apex. The apex is already serving through Cloudflare and is left alone |
| **Account** | The zone is on the user's Cloudflare account, which is the account that will hold the Worker (T03). One account, so the §10.7 step 0 match holds by construction |
| **Account IDs** | Not recorded here. `op://Wherego/credentials/CLOUDFLARE/ACCOUNT_ID` only, per §10.2 |

Where this hostname is read again: the Access application's domain (T19), the LINE production
webhook host (T13), `APP_HOST` as a `production` Environment variable (T15, consumed by T16's
smoke test), and the Worker's custom domain (T18).

## Acceptance criteria

- [ ] The zone's account ID and the Worker account's account ID are recorded, and they match.
- [ ] The zone status is Active.
- [ ] The app hostname is written down, and it is a hostname inside that zone.
- [ ] The hostname is stated once and referenced — not re-decided — by T04, T13, T16, T18 and T19.

## Validation

`dig +short <hostname>` and `dig +short NS <zone>` confirm the zone resolves through Cloudflare
nameservers. The account-ID match is verified by reading both values back, not by assertion.
Nothing here is agent-executable and nothing here touches a third party that needs a mock.

## Open questions

- Which hostname? A decision for the user, not the clinic. `/design-task` must ask rather than
  invent one — it is baked into four later tasks and an Access policy.
