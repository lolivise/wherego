# Validation 01 — T02 Cloudflare account & zone check; app hostname

**Verdict** PASS · **Date** 2026-07-26 · **Attempt** 1 · **Execution** manual

T02 is a manual task — the dashboard steps were done by the user. This records the part that
**is** observable, which is what `progress.md` committed to when the board was approved:
*"`/validate-task` still verifies the result where it can be observed (dig the zone, curl for 403,
confirm `op://` refs resolve) — never the clicking."*

No agent was dispatched. No third party was called beyond DNS, which the task's own `Validation`
section prescribes.

## Observed

```
$ dig +short NS storium.work
eloise.ns.cloudflare.com.
kareem.ns.cloudflare.com.

$ dig +short SOA storium.work
eloise.ns.cloudflare.com. dns.cloudflare.com. 2410001795 10000 2400 604800 1800

$ dig +short storium.work
172.67.150.70
104.21.96.22

$ dig +short wherego.storium.work
(no answer)
```

## Contract walk

| Criterion | Verdict | Evidence |
|---|---|---|
| The zone's and the Worker account's account IDs are recorded and match | **met, by construction** | One Cloudflare account. The user states `storium.work` is registered on their account, and T03 buys Workers Paid on that same account. See the risk note below |
| The zone status is Active | **met** | Authoritative NS **and** SOA are Cloudflare. A zone Pending Nameserver Update does not answer from `*.ns.cloudflare.com` |
| The app hostname is written down, and is inside that zone | **met** | `wherego.storium.work`, recorded in the task file's `## Decided` section and in §10.7 step 0. It is a label under `storium.work` |
| Stated once and referenced — not re-decided — by T04, T13, T16, T18, T19 | **met** | Grepped all five. Each says "the T02 hostname" or `APP_HOST`; none names a hostname of its own |

## Two findings worth carrying forward

**The apex is already in use.** `storium.work` resolves to `172.67.150.70` / `104.21.96.22` —
Cloudflare proxy addresses, so something is live there. This is not a problem; it is the evidence
that the subdomain choice was the correct one, and it means the zone is shared. Consequence for
T19: the Access application must be scoped to `wherego.storium.work` specifically. An application
created over the zone apex, or over a wildcard, would put whatever else is on `storium.work` behind
the clinic's email-OTP policy.

**`wherego.storium.work` does not resolve, and that is correct.** T18 binds it as a custom domain
on the Worker; nothing should answer before then. T18's own open question — *"if T02's hostname is
unavailable or already routed, stop"* — is answered: it is free and unrouted.

## Coverage gaps

- **The account-ID match was not read back from the dashboard.** The user's statement that the zone
  is on their account is the evidence; two ID strings were not compared field by field. This is
  sound while there is exactly one Cloudflare account, and DNS cannot distinguish one account from
  another. **If a second Cloudflare account exists — a personal one and an organisation one, say —
  this criterion is unproven and must be re-checked before T03 spends money on the wrong account.**
- Nothing here proves the Worker *can* be routed to the hostname. That is T18, and it needs a
  deployed Worker.

## Verdict

**PASS.** Task → `done`. T03 (Workers Paid, D1 APAC) is unblocked.
