# T08 · Default-deny Access JWT middleware — and the CI test that keeps it honest

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-07
**Spec** `docs/PLAN.md` §9 · **Depends on** T07 · **State** `todo`
**Execution** agent

## Outcome

Every request to the Worker is denied unless it carries a valid `Cf-Access-Jwt-Assertion` for the
right `aud`, except exactly two allowlisted paths — and a CI test fails if that ever stops being
true.

## Scope

- **In:** the middleware, the two-entry allowlist, `aud` verification, the JWKS fetch, the
  `env.ENVIRONMENT === 'local'` bypass, the CI tests, and `audit_log.actor` sourced from the email
  claim.
- **Out:** creating the Access application itself (T19 — a console action, and it supplies the real
  `aud` and team domain). LINE signature verification (Phase 5) — this task only allowlists the
  webhook path.

## Detail

This is the security task of the phase and the second half of its exit gate. The threat, verbatim
from P0-07:

> Access is a zone-level control over a hostname. If the Worker assumes Access already
> authenticated the caller, the entire app API is public at any hostname Access does not cover.

§9 states the four legs of the design together — (a) is T04's `workers_dev = false`, (b), (c) and
(d) are this task:

> (a) `workers_dev = false` in `wrangler.toml`; (b) a **default-deny middleware** validates the
> `Cf-Access-Jwt-Assertion` JWT against the team JWKS **and** the `aud` claim on every request —
> verifying `aud` matters, or an Access JWT from a different Cloudflare team is accepted; (c)
> exactly two paths are on the unauthenticated allowlist; (d) a CI test asserts the allowlist has
> exactly those two entries, and that an unauthenticated request to an app route returns 403 under
> the production config.

The two allowlisted paths are the **LINE webhook** and **`/healthz`** — and only those. The webhook
is signature-verified instead (§8.6, Phase 5); `/healthz` must answer 200 rather than 302 or the
deploy smoke test breaks (T07, §11.2).

The local bypass, verbatim from §9:

> **The local-dev bypass is a production landmine unless it is tested.** `wrangler dev --local`
> presents no Access JWT, so a bypass is unavoidable. Gate it on `env.ENVIRONMENT === 'local'`, set
> only in the `[env.local]` wrangler block, and add the CI test above so the bypass cannot ship.

`ENVIRONMENT` is set in exactly one place — T04's `[env.local]` block — and T04's acceptance
criteria include a repo-wide grep proving it.

`audit_log.actor` is the email claim from the JWT (P0-07). Nothing writes `audit_log` yet; the
middleware's job is to make the identity available in a named place so Phase 1 does not invent a
second source for it.

`CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` are runtime secrets from §10.3, pushed by
`wrangler secret bulk` at deploy (T16). They do not exist yet — T19 creates them. The middleware is
written and tested against a **local mock JWKS** with a locally generated key pair; that is what
makes this task executable before the Access application exists.

## Settled at T04 — 2026-07-26

**Routing is worker-first: `run_worker_first = true`.** T04's open question is closed, and it
changes two things here.

**"An app route" means every path**, `/` and every static asset included, with `/healthz` and the
LINE webhook as the only two exceptions. §9(d) therefore holds literally and needs no caveat — that
is exactly why worker-first was chosen over the cheaper assets-first default.

**Static assets reach this middleware and must be default-denied, not allowlisted.** A logged-in
browser carries the Access cookie, so the SPA's own JS and CSS authorize normally on every request
after login. **The allowlist stays at exactly two entries** — adding `/assets/*` to make a 403 go
away would put the app's entire front end back outside the control and would fail the criterion
below.

**T04 could not prove `run_worker_first = true` behaviourally; this task can, and should.** T04's
stub Worker forwards every path to `env.ASSETS.fetch()`, so worker-first and assets-first produce
byte-identical responses on every path — measured side by side, not assumed. In T04 it is a static
assertion on `wrangler.toml`. Once this middleware exists, an unauthenticated `GET /` returning 403
is the first real evidence that the setting is in force, and a regression to assets-first would show
up here as a 200 with the SPA shell.

## Acceptance criteria

- [ ] Under the production config, an unauthenticated `GET` to an app route returns **403** — not
      302, not 401, not 404.
- [ ] **`GET /` unauthenticated returns 403**, and so does a request for a built static asset. This
      is the behavioural proof of T04's `run_worker_first = true`; a 200 with the SPA shell means the
      Worker is no longer first.
- [ ] A CI test asserts the unauthenticated allowlist has **exactly two** entries, and names them.
      Adding a third entry fails the test.
- [ ] `GET /healthz` with no JWT returns 200.
- [ ] The LINE webhook path with no JWT reaches its handler rather than being denied.
- [ ] A JWT signed by the correct key but carrying a **different `aud`** is rejected with 403. This
      is the leg that is easiest to omit and impossible to notice.
- [ ] A JWT with a valid `aud` but an invalid signature is rejected.
- [ ] An expired JWT is rejected.
- [ ] A malformed / absent `Cf-Access-Jwt-Assertion` header is rejected with 403, not a 500.
- [ ] With `ENVIRONMENT = "local"` the bypass allows an unauthenticated app route; with it unset or
      any other value, the same request returns 403. Both directions.
- [ ] A CI test asserts the bypass cannot be active under the production config.
- [ ] The email claim is exposed to handlers under one named accessor, ready for
      `audit_log.actor`.
- [ ] No JWT, no email address and no header value is written to a log line.

## Validation

Local, via `pnpm test:worker` under real Miniflare (T06). Stand up a **mock JWKS endpoint** at
`tools/mocks/cf-access/` serving a locally generated key pair, and mint test JWTs against it —
valid, wrong-`aud`, bad-signature, expired, malformed. **No real Cloudflare Access call.** Drive
every criterion above as a request through the running Worker, and assert the negative ones by
observing 403, not by reading the middleware. Run the production-config cases with `ENVIRONMENT`
genuinely unset.

## Open questions

None that block. The real `aud` and team domain arrive in T19 and are injected as secrets; the
middleware must not hard-code either.
