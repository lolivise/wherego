# T04 · `wrangler.toml` — CPU limit, D1 binding, three crons, the DO binding, static assets, `[env.local]`

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-03 (config half), P0-01 (`workers_dev`)
**Spec** `docs/PLAN.md` §2, §5.3, §5.6, §8.6, §8 (line 989), §9, §10.4, §11.2 · **Depends on** T01, T03 · **State** `todo`
**Execution** agent

## Outcome

`apps/api/wrangler.toml` declares the D1 binding, the pinned CPU limit, the three cron triggers,
the `PlanCoordinator` Durable Object binding, the Workers Static Assets block serving
`apps/web/dist`, `workers_dev = false`, and an `[env.local]` block — and `wrangler` accepts it.

## Scope

- **In:** the whole of `apps/api/wrangler.toml`, including bindings for handlers that do not exist
  yet, and the `[assets]` block.
- **Out:** the handlers themselves (T07 for `/healthz`; the crons and the DO stay stubs until
  Phase 3). Secrets — none of them appear here (§10.3, they are pushed by `wrangler secret bulk`
  in T16). The web app's actual UI (Phase 3) — T01 leaves a placeholder SPA that builds to
  `dist/`, which is all this task needs to point at.

## Detail

**Pin `limits.cpu_ms` explicitly — do not inherit a default** (§2, P0-03). An inherited default is
a number nobody chose that changes when Cloudflare changes it, under a workload (§5.3 Held–Karp)
that was sized against 30 s.

**Declare the three cron triggers and the `PlanCoordinator` binding now, even though the handlers
are stubs** (P0-03). Copy the expressions exactly:

```
"0 0 * * 1-5"    # Mon–Fri 08:00 Asia/Taipei — commit run
"0 23 * * 0-4"   # Mon–Fri 07:00 Asia/Taipei — morning push
"0 18 * * *"     # daily 02:00 Asia/Taipei — nightly maintenance
```

**Taipei is fixed UTC+8 with no DST. Do not "fix" these with offset arithmetic later.** Carry that
sentence into the file as a comment — the second cron reading `0-4` rather than `1-5` looks like a
typo to anyone who has not worked out that 07:00 +08 is the previous UTC day.

`workers_dev = false` (§9, P0-01). Without it the Worker stays reachable at
`<name>.<subdomain>.workers.dev`, **which no Access application covers** — and §9 is explicit that
this is one of the three legs of the authentication design, alongside the default-deny middleware
(T08) and the CI test that keeps it honest.

`[env.local]` sets `ENVIRONMENT = "local"` **and nothing else sets it** (P0-03). T08's local bypass
is gated on exactly this value; if any other environment can set it, the bypass ships.

`database_id` comes from T03. It is **not a secret** (§10.4): it lives here, in git, in plain text.

**Workers Static Assets — one deployable, one origin.** §2 and §8 both say the SPA is *served via
Workers Static Assets*, and §11.2's deploy step is named `Deploy Worker + static assets`. There is
no Cloudflare Pages project and there is no second hostname: the same Worker serves the API, the
LINE webhook, the cron handlers and the SPA. That is what makes one Access application over one
hostname (T19) sufficient, and it is why the browser never makes a cross-origin request.

The `[assets]` block points at `apps/web/dist` — the output T01's Vite build produces — and must
configure **SPA fallback**, so a deep link like `/plan/2026-08-03` returns `index.html` instead of
404ing. Without that the app works only from the root URL, and it is the field-opened, mobile
surface (§8).

Pin the exact field names against the installed `wrangler`'s own documentation rather than from
memory; this block's field names have changed across wrangler majors, and a silently-ignored key
here produces a Worker that deploys clean and serves nothing.

## Acceptance criteria

- [ ] `wrangler` parses the file without warnings (`wrangler deploy --dry-run` or equivalent).
- [ ] `limits.cpu_ms` is present with an explicit value, not inherited.
- [ ] All three cron expressions are present, byte-identical to the block above, each with its
      Asia/Taipei comment.
- [ ] The D1 binding names database `wherego` and carries the `database_id` from T03.
- [ ] A `PlanCoordinator` Durable Object binding and its migration entry are declared.
- [ ] `workers_dev = false` is set at the top level.
- [ ] `[env.local]` sets `ENVIRONMENT = "local"`, and a grep of the whole repo finds no other
      assignment of `ENVIRONMENT` to `"local"`.
- [ ] No secret from the §10.3 table appears anywhere in the file.
- [ ] An `[assets]` block points at `apps/web/dist` and SPA fallback is configured — a request to a
      path with no matching asset serves `index.html`, not a 404.
- [ ] `pnpm build` then `wrangler deploy --dry-run` succeeds with the assets directory present, and
      the dry-run output lists the built assets.
- [ ] The asset field names used are the ones the installed `wrangler` documents — verified against
      it, not assumed. An unrecognized key must not be left in the file.

## Validation

`pnpm build` first — the `[assets]` directory must exist or the dry run has nothing to point at.
Then `wrangler deploy --dry-run` against the local config; `wrangler dev --local` boots (proved
properly in T06). Assert the cron list, `workers_dev` and the assets directory by parsing the file
in a test rather than by eye — these are the lines whose absence is invisible until production.
Grep the repo for `ENVIRONMENT` and for each secret name in §10.3. No third party; no Cloudflare API
call needed for a dry run.

## Open questions

- Worker name, DO class name and script placement follow T01's conventions; if T01 left them open,
  they are settled here, not guessed.
- **Does the Worker run before static assets, or do assets win?** This is a real fork and it
  changes what T08 and T20 are asserting. §9(d) requires *"an unauthenticated request to an app
  route returns 403 under the production config"*. If assets are served first, `GET /` returns
  `index.html` with 200 and only the API paths can 403 — which is defensible, since the SPA shell
  holds no patient data and every API call is still default-denied. If the Worker runs first for
  everything, the literal reading of §9(d) holds for every path, at the cost of invoking the Worker
  on every asset request. **Settle this here with the user before T08 writes the middleware**, and
  make T20's "app route" name a concrete path either way. Do not let T08 and T20 each assume a
  different answer.
