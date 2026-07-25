# T18 · Bootstrap deploy and bind the custom domain

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-17 (bootstrap deploy), P0-01 (binding)
**Spec** `docs/PLAN.md` §2, §10.7 steps 0, 8–9, §11.2 · **Depends on** T07, T15 · **State** `todo`
**Execution** **manual** — one `wrangler deploy` from a workstation, plus a Cloudflare dashboard action.

## Outcome

The Worker exists in production, the custom domain from T02 resolves to it, `workers.dev` does not,
and the seed from T09 is applied to remote D1 — so `wrangler secret bulk` has a target on the first
CI run.

## Scope

- **In:** one manual `wrangler deploy`, applying migration 0001 and the seed to remote D1, binding
  the custom domain, and confirming `workers_dev = false` took effect.
- **Out:** the Access application (T19 — it needs this hostname to exist first). The first
  CI-driven deploy and its negative proofs (T20).

## Detail

Two plan tasks meet here because neither can happen without the other. P0-01:

> Bind it as a **custom domain** on the Worker once P0-05 is deployed.

P0-17:

> One manual `wrangler deploy` so `wrangler secret bulk` has a target on the first CI run.

`wrangler secret bulk` fails against a Worker that does not exist, and `deploy.yml` (T16) runs
secrets before code deliberately — so the very first CI deploy would fail without this bootstrap.
That is why this is a task rather than a footnote.

Order within the task:

1. Apply migration 0001 to **remote** D1 (T05).
2. `wrangler deploy` from the workstation using the T15 Cloudflare API token.
3. Apply the seed (T09) to remote D1.
4. Bind the hostname from T02 as a **custom domain** on the Worker.
5. Confirm `workers_dev = false` is in effect — the Worker must **not** answer at
   `<name>.<subdomain>.workers.dev`.

Step 5 is the security-relevant one. §9:

> Cloudflare Access is a zone-level control over a hostname and path, and a Worker is *also*
> reachable at `<name>.<subdomain>.workers.dev`, which no Access application covers. If the Worker
> assumes Access already authenticated the caller, the entire app API is public at that hostname.

T04 set the flag and T08 built the middleware that does not depend on it. This task is where the
flag is proven to have actually taken effect against the live edge, which is the only place the
question can be answered.

This is also the first time real patient-facing infrastructure exists. It holds no patient data yet
and it must not: **no test patients in production D1** (§11.4, standing gate). The only rows are
T09's doctor, holidays and settings.

## Manual checklist

1. `wrangler d1 migrations apply wherego --remote`. Read the output; confirm 0001 applied.
2. `wrangler deploy` from `apps/api`.
3. Apply the T09 seed to remote D1. Confirm `settings` has every key and `doctors` has one row.
4. Cloudflare dashboard → the Worker → **Custom Domains** → add the T02 hostname. Wait for the
   certificate to be issued.
5. `curl https://<hostname>/healthz` → expect 200 and a JSON body with the deployed commit.
6. `curl https://<worker>.<subdomain>.workers.dev/healthz` → expect it **not** to answer.
7. Record the deployed commit SHA. T20 compares against it.

## Acceptance criteria

- [ ] Remote D1 carries the complete §3 schema, including `uq_visits_cycle_live` as a **partial**
      index — verified by inspecting the *remote* schema, not the local one.
- [ ] The Worker is deployed and `GET https://<hostname>/healthz` returns 200 with
      `{ok, version, commit}`, and `commit` equals the SHA that was deployed.
- [ ] The custom domain resolves to the Worker and its certificate is valid.
- [ ] `<name>.<subdomain>.workers.dev` does **not** serve the Worker. Proven by requesting it.
- [ ] Remote `settings` contains every §3 key with the correct `tier`; `doctors` has exactly one
      row; `holidays` is populated.
- [ ] Remote `patients` and `visits` are **empty**. No test patient exists in production D1.
- [ ] The deployed commit SHA is recorded for T20.

## Validation

Against the live hostname, by `curl` and by `wrangler d1 execute --remote` reads. The two
`curl`s in steps 5 and 6 are both criteria — the negative one is the security check and is the one
that gets skipped. Remote schema inspection is done against the remote database; a local pass
proves nothing about what `--remote` actually applied. No third-party API is called. Nothing here
is agent-executable: it is a purchase-adjacent, credential-holding, dashboard action.

## Open questions

- Whether to bind the apex or a subdomain — settled in T02. If T02's hostname turns out to be
  unavailable or already routed, **stop**: it is referenced by T13's webhook URL, T15's `APP_HOST`
  and T19's Access application, and changing it here silently breaks all three.
