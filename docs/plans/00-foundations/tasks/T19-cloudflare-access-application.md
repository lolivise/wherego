# T19 · Cloudflare Access application

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-06
**Spec** `docs/PLAN.md` §7 *Access*, §9, §10.7 step 2 · **Depends on** T18 · **State** `todo`
**Execution** **manual** — Cloudflare Zero Trust dashboard.

## Outcome

An Access application protects the app hostname with email one-time PIN and the clinic's allowlist,
exactly two paths bypass it, and `aud` and the team domain are recorded in 1Password.

## Scope

- **In:** the application, its policies, the two bypasses, the 30-day session, and recording `aud`
  and the team domain into the vault item T15 created.
- **Out:** the Worker-side middleware (T08 — already built and tested against a mock JWKS). Pushing
  `CF_ACCESS_AUD` / `CF_ACCESS_TEAM_DOMAIN` into the Worker (T16's `wrangler secret bulk`, run at
  T20).

## Detail

From P0-06:

- Create the Access application over the app route with an **email one-time PIN** policy and the
  clinic's address allowlist. Session lifetime **30 days**.
- **Exclude exactly two paths**: the LINE webhook and `/healthz`.
- Record `aud` and the team domain into 1Password.

`/healthz` must be on the **bypass** policy specifically. The reason, verbatim from §11.2 — this is
the single most consequential dropdown in the task:

> `/healthz` is on the Access BYPASS policy (§10.7 step 2). Without that, Access answers an
> unauthenticated request with a 302 to the login page — `curl -f` does not fail on 3xx, so curl
> exits 0 with an HTML body and `jq -e` dies with a parse error on every single deploy.

An Allow-everyone policy is *not* the same thing: it still issues a redirect to establish a session.

The LINE webhook is excluded because it is authenticated differently — HMAC signature verification
(§8.6, Phase 5), not a browser session. LINE's servers cannot complete an email OTP.

**Two paths. Not three.** T08's CI test asserts the Worker-side allowlist has exactly two entries;
this task is the zone-side half of the same invariant, and the two lists must name the same two
paths.

Access is defence in depth here, not the control itself — §9 is explicit that the Worker enforces
default-deny on its own, precisely so that a hostname Access does not cover is not a hole. T08
already ships that. This task closes the outer layer.

`aud` and `team_domain` go into the `cloudflare-access` vault item T15 created empty. They become
§10.3 runtime secrets, pushed into the Worker at T20's deploy.

## Manual checklist

1. Zero Trust → Access → Applications → **Add a self-hosted application** over the T02 hostname.
2. Session duration: **30 days**.
3. Policy 1 — **Allow**, identity: **email one-time PIN**, with the clinic's email allowlist.
4. Policy 2 — **Bypass**, path `/healthz`.
5. Policy 3 — **Bypass**, the LINE webhook path (the same path T08 allowlists and T13 configured).
6. Confirm there are exactly these three policies and no fourth.
7. Copy the application **Audience (AUD) tag** and the **team domain** into
   `op://wherego/cloudflare-access/aud` and `.../team_domain`.
8. Test from a logged-out browser or a clean profile.

## Acceptance criteria

- [ ] An unauthenticated browser request to an app route is challenged by Access with the email OTP
      login.
- [ ] An email on the allowlist can complete the OTP and reach the app; one not on it cannot.
- [ ] `curl https://<hostname>/healthz` unauthenticated returns **200 with JSON** — not a 302, and
      not HTML. Verified with `curl -fsS ... | jq -e '.ok == true'`, the exact shape T16's smoke
      test uses.
- [ ] The LINE webhook path is reachable unauthenticated (it will 4xx from the Worker for an
      unsigned body in Phase 5; the point here is that **Access** does not intercept it).
- [ ] Exactly two bypass paths exist. A third would fail T08's CI assertion and must not exist here
      either.
- [ ] Session duration is 30 days.
- [ ] `aud` and `team_domain` are populated in the vault and resolve via the service account.
- [ ] The two bypassed paths are byte-identical to the two in T08's Worker-side allowlist,
      confirmed by comparing them.

## Validation

Against the live hostname from a logged-out client. The `/healthz` check must be the **exact**
`curl | jq -e` pipeline from §11.2, because the failure mode being tested is specifically that
`curl -f` does not fail on a 3xx — a browser check would show the login page and look correct. The
allowlist comparison is done by reading both lists side by side. Nothing here is agent-executable
and no mock is involved: this is the real Access control plane.

## Open questions

None. The webhook path is settled by T08/T13; if they disagree, that is a defect in one of them,
not a decision to make here.
