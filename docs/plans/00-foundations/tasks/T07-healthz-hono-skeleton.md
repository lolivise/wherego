# T07 · `/healthz` and the Hono skeleton

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-05
**Spec** `docs/PLAN.md` §11.2 · **Depends on** T04, T06 · **State** `todo`
**Execution** agent

## Outcome

The Worker is a Hono app that answers `GET /healthz` with `{ ok, version, commit }` and nothing
else, where `commit` is the build-time `GITHUB_SHA`.

## Scope

- **In:** the Hono app, its entry point, `GET /healthz`, and the `GITHUB_SHA` injection as a `var`.
- **Out:** the Access middleware (T08 — `/healthz` is one of the two paths it must let through).
  The LINE webhook, the app API, the cron handlers, the Durable Object body. Binding the custom
  domain (T18).

## Detail

From P0-05, and the reasoning is the whole point of the task:

> `GET /healthz` returns `{ ok, version, commit }` and nothing else. `commit` is the build-time
> `GITHUB_SHA`, injected as a `var`. This is what the deploy smoke test asserts against, and
> asserting the SHA — not just `ok: true` — is what stops the test passing against the previous
> version when a deploy silently no-ops.

The corresponding assertion in T16's `deploy.yml` (§11.2) is:

```
| jq -e --arg sha "$GITHUB_SHA" '.ok == true and .commit == $sha'
```

So the field is named `commit`, it holds the full SHA, and it is a string. A `commit` that is
`"unknown"` or empty in production makes every deploy fail the smoke test; a `commit` that is
hard-coded makes every deploy pass it. Both are worse than the endpoint not existing.

`/healthz` is also one of exactly two paths excluded from Cloudflare Access (§9, T19), and it must
answer **200 unauthenticated, not 302**. §11.2 spells out why that matters at the far end:

> `/healthz` is on the Access BYPASS policy. Without that, Access answers an unauthenticated
> request with a 302 to the login page — `curl -f` does not fail on 3xx, so curl exits 0 with an
> HTML body and `jq -e` dies with a parse error on every single deploy.

"and nothing else" is a constraint, not a description. No uptime, no binding names, no environment,
no D1 status. This endpoint is unauthenticated by design and reachable by anyone.

## Acceptance criteria

- [ ] `GET /healthz` returns HTTP 200 with `content-type: application/json`.
- [ ] The body has exactly the keys `ok`, `version`, `commit` — no more.
- [ ] `ok` is boolean `true`; `commit` is the full `GITHUB_SHA` string supplied at build time.
- [ ] With `GITHUB_SHA` supplied as `X`, the response's `commit` equals `X` — proven by building
      with two different values and observing the response change.
- [ ] `jq -e '.ok == true and .commit == $sha'` succeeds against the response with the matching sha
      and **fails** with a different one. Both directions.
- [ ] An unknown path returns 404, not a stack trace or an HTML error page.
- [ ] The endpoint performs no D1 query and no outbound fetch.

## Validation

Local, through T06's `wrangler dev --local` and `pnpm test:worker`. Drive the real `jq` expression
from §11.2 against the real response body, both matching and mismatching — the smoke test's job is
to fail, and a smoke test that has never been observed failing is not evidence. No third party, no
mock.

## Open questions

- Where `version` comes from — `package.json`, a build var, or the tag. `/design-task` asks; it is
  asserted by nothing downstream, which is exactly why it will otherwise be invented.
