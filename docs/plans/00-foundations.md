# Phase 0 — Foundations

**Estimate** 1 week · **Depends on** nothing · **Blocks** every other phase
**Spec** [`../PLAN.md`](../PLAN.md) §2, §3, §9, §10, §11

---

## Goal

Stand up the whole delivery chain — repo, Cloudflare, authentication, secrets, CI/CD, external
monitoring — and prove it end to end with a green production deploy of an app that does nothing
but answer `/healthz`. Close the two questions that are schema gates rather than launch
checkboxes: the Google Maps caching terms and the 個資法 conversation.

Nothing here is patient-facing. Everything here is load-bearing for everything that is.

---

## Prerequisites

- Cloudflare account with billing enabled (Workers Paid required — see P0-03)
- **A domain already registered in Cloudflare with an active zone** — confirm in P0-01 that it is
  in the *same* account as the Worker
- Google Cloud account with billing
- LINE Developers account
- 1Password with the ability to create a vault and a service account
- GitHub repository
- A scheduled conversation with the clinic (P0-16)

---

## Tasks

### P0-01 · Bind the custom domain to the Worker

**The domain is already registered in Cloudflare and the zone is active.** The wall-clock risk this
task originally carried is gone, and Phase 0 no longer has a task that must start on day one.

What remains is still load-bearing. Cloudflare Access applications are defined over a hostname in a
zone you control, and **`*.workers.dev` cannot be placed behind Access** — so the whole
authentication design still routes through this binding. It now blocks only P0-06, and it needs a
deployed Worker to bind to, so it runs **after P0-05**, not before P0-02.

- **Confirm the zone sits in the same Cloudflare account that will hold the Worker.** This is the
  one thing left in this task that can bite: a zone under one account and a Worker under another
  cannot see each other, the Workers Route cannot be created, and the Access application has no
  hostname to sit in front of. Check it now, before P0-03 buys Workers Paid on an account — finding
  it at P0-06 means moving either the zone or the billing relationship mid-week.
- Choose the app hostname. A subdomain of the existing zone is fine and leaves the apex alone.
- Bind it as a **custom domain** on the Worker once P0-05 is deployed.
- Set `workers_dev = false` in `wrangler.toml`. Otherwise the Worker stays reachable at
  `<name>.<subdomain>.workers.dev`, which no Access application covers.
- Record the hostname as the `APP_HOST` GitHub Environment **variable** (not a secret).
- The same hostname becomes the Access application's domain in P0-06 and the LINE webhook URL in
  P0-08. Decide it once, here.

Spec: §2, §10.7 step 0, §11.2.

### P0-02 · Monorepo scaffold

```
wherego/
├── .github/workflows/{ci,deploy,backup}.yml
├── apps/api/          # Cloudflare Worker (Hono) — src/routes, src/coordinator, wrangler.toml
├── apps/web/          # React + Vite SPA
├── packages/scheduler # PURE TypeScript. No I/O, no CF bindings, no fetch, no Date
├── packages/domain    # zod schemas, PlainDate + ROC math, CSV mapping, shared types
├── packages/geo       # haversine, bounding-box check
├── migrations/        # D1 SQL
└── docs/
```

pnpm workspaces, Node 24, TypeScript strict, vitest, eslint. Empty but wired: `pnpm typecheck`,
`pnpm lint`, `pnpm test`, `pnpm build` all run and pass across every package.

Spec: §2 *Repo layout*.

### P0-03 · Cloudflare Workers Paid, D1 in APAC, wrangler config

- Confirm the account is on **Workers Paid**. Held–Karp, the catch-up backfill, the nightly audit
  and the §5.5 ranker are all comfortable at the paid plan's 30 s CPU ceiling and all impossible
  at the free plan's 10 ms.
- Pin `limits.cpu_ms` explicitly in `wrangler.toml` — do not inherit a default.
- Create the D1 database with primary region **APAC**; record `database_id` in `wrangler.toml`
  (not a secret, §10.4).
- Declare the three cron triggers and the `PlanCoordinator` Durable Object binding now, even
  though the handlers are stubs:

  ```
  "0 0 * * 1-5"    # Mon–Fri 08:00 Asia/Taipei — commit run
  "0 23 * * 0-4"   # Mon–Fri 07:00 Asia/Taipei — morning push
  "0 18 * * *"     # daily 02:00 Asia/Taipei — nightly maintenance
  ```

  Taipei is fixed UTC+8 with no DST. Do not "fix" these with offset arithmetic later.
- Add an `[env.local]` block setting `ENVIRONMENT = "local"` — and nothing else sets it.

Spec: §2, §5.3, §5.6, §8.6, §10.4.

### P0-04 · Migration 0001 — the full §3 schema

Write the entire §3 schema as one initial migration. Getting the whole shape in now avoids
expand-only gymnastics during Phase 1 and 2.

Tables: `doctors`, `patients`, `visits`, `plan_days`, `plan_runs`, `csv_imports`,
`geocode_cache`, `line_recipients`, `doctor_absences`, `line_events`, `road_distances`,
`deploys`, `line_sessions`, `holidays`, `settings`, `audit_log`.
View: `schedulable_patients` — **columns enumerated, never `SELECT *`** (SQLite expands `*` at
view-creation time).
Indexes: `idx_patients_sched`, `idx_patients_dupe`, `idx_visits_day`, `idx_visits_patient`,
`idx_visits_cycle`, `idx_plan_runs_date`, and the partial unique index:

```sql
CREATE UNIQUE INDEX uq_visits_cycle_live ON visits(patient_id, visit_type, cycle_index)
  WHERE cycle_index IS NOT NULL AND status IN ('planned','completed');
```

**Not** a plain `UNIQUE(patient_id, visit_type, cycle_index)` table constraint — that would make
§5.1's missed-visit retry and §6.4's cancel-does-not-cancel-the-obligation structurally
impossible. **Not** `UNIQUE(target_day)` on `plan_runs` — that prevented retries rather than
enabling them.

Copy the explanatory comments from §3 into the migration. They are the reason the schema looks
the way it does and they will not survive being paraphrased.

Spec: §3.

### P0-05 · `/healthz` and the Hono skeleton

`GET /healthz` returns `{ ok, version, commit }` and nothing else. `commit` is the build-time
`GITHUB_SHA`, injected as a `var`. This is what the deploy smoke test asserts against, and
asserting the SHA — not just `ok: true` — is what stops the test passing against the previous
version when a deploy silently no-ops.

Spec: §11.2.

### P0-06 · Cloudflare Access application

- Create the Access application over the app route with an **email one-time PIN** policy and the
  clinic's address allowlist. Session lifetime 30 days.
- **Exclude exactly two paths**: the LINE webhook and `/healthz`. `/healthz` must be on the
  *bypass* policy — otherwise Access answers an unauthenticated request with a 302 to the login
  page, `curl -f` does not fail on 3xx, and `jq -e` dies with a parse error on every deploy.
- Record `aud` and the team domain into 1Password.

Spec: §7 *Access*, §9, §10.7 step 2.

### P0-07 · Default-deny JWT middleware — **and the CI test that keeps it honest**

Access is a zone-level control over a hostname. If the Worker assumes Access already
authenticated the caller, the entire app API is public at any hostname Access does not cover.

- Middleware validates `Cf-Access-Jwt-Assertion` against the team JWKS **and** the `aud` claim on
  every request. Verifying `aud` matters — otherwise an Access JWT from a different Cloudflare
  team is accepted.
- Default deny. Exactly two paths on the unauthenticated allowlist.
- Local bypass gated on `env.ENVIRONMENT === 'local'`, set only in the `[env.local]` block.
- **CI test**: asserts the allowlist has exactly those two entries, and that an unauthenticated
  request to an app route returns 403 under the production config. The local bypass is a
  production landmine unless it is tested.
- `audit_log.actor` is the email claim from the JWT.

Spec: §9.

### P0-08 · LINE channels — production **and development**

- Create the production Messaging API channel: set the webhook URL, disable auto-reply, set the
  Official Account to **not searchable**, issue the long-lived channel access token.
- **Create a second, free Messaging API channel as the development OA**, with your own account as
  its sole approved recipient. A channel has exactly one webhook URL, so without this, pointing a
  `cloudflared` tunnel at it takes the production bot offline for the duration — which across
  Phase 5 is most of it. Ten minutes, no cost.
- Confirm the Taiwan push-message tier (feeds open question 6).

Spec: §10.7 steps 3–4, §11.4.

### P0-09 · Google Cloud project — **and resolve the Maps ToS caching question**

- Create the project; enable Geocoding, Places and Routes.
- Create the **API-restricted server key** (Geocoding/Places/Routes only). It never reaches the
  browser. Interactive maps in the SPA use a separate referrer-restricted browser key — a
  build-time `var`, not a secret.
- Set a billing budget alert.
- **Resolve the caching terms before the schema is finalized** (Maps Platform Terms §3.2.3
  caching, §3.2.4 Place IDs). "Geocode once, cache forever" is load-bearing in §2 and §4. If the
  answer is time-limited, `geocode_cache.fetched_at` gains a reader and the nightly job gains a
  re-resolve-from-`place_id` sweep with a budgeted call volume. Today `fetched_at` is written and
  never read, which is the shape of an unanswered question.
- Record the answer in this file and in §4 before Phase 1 starts.

Spec: §4 *Geocoding rules*, §9, §10.3, §10.7 step 5.

### P0-10 · External monitoring and the backup keypair

- Create a healthchecks.io check per cron; record the ping URLs.
- Generate the `age` keypair (`age-keygen`); public key into 1Password as
  `BACKUP_AGE_PUBLIC_KEY`, private key into 1Password too.

An in-Worker heartbeat cannot detect its own non-execution. This is the only observer outside the
failure domain (R15).

Spec: §2, §5.6 item 9, §10.3, §11.3.

### P0-11 · 1Password vault, service account, GitHub Environment

- Populate the `wherego` vault per the §10.5 layout: `cloudflare`, `cloudflare-access`,
  `google-maps`, `line`, plus `healthchecks/ping_url` and `backup/age_public_key`.
- Create the read-only service account scoped to that vault; set an expiry and calendar the
  rotation.
- Add its token as `OP_SERVICE_ACCOUNT_TOKEN` — an **Environment** secret on `production`, never
  a repository secret (a repository secret is readable by any workflow on any branch).
- **Add a required reviewer to the `production` Environment.** One checkbox, and the only human
  gate between `git push` and a live clinical scheduler with no staging.
- Cloudflare API token: custom, with exactly the five permissions in §10.2.
- Enable GitHub secret scanning + push protection.

Spec: §10.

### P0-12 · `ci.yml`

Runs on every PR and on push to main. **Needs no credentials** — that property is the point and
must never be traded away.

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint          # incl. no-restricted-globals: Date banned in packages/scheduler
pnpm test          # unit + fast-check property tests + golden CSV fixture
pnpm test:sim      # §5.8 simulation at 38 / 100 / 330 patients
pnpm test:worker   # @cloudflare/vitest-pool-workers — real Miniflare D1
pnpm build
```

The later scripts are stubs in Phase 0; wire them now so nothing has to be added under pressure.
**Pin every action to a full commit SHA**, not a tag — `deploy.yml` holds a token that can
rewrite the production Worker.

Spec: §11.1.

### P0-13 · `deploy.yml`

Trigger is `workflow_run: [CI]` with `conclusion == 'success'`, plus `workflow_dispatch`.
**Not `push: main`** — independent workflows on the same trigger let a merge with failing property
tests deploy the broken scheduler straight to production.

Step order, and each of these orderings is deliberate:

1. checkout / pnpm / node
2. **`pnpm --filter web build` — before the 1Password step.** `pnpm build` runs arbitrary code
   from the dependency tree; with the secret load above it, one compromised dev-dependency reads
   the LINE and Cloudflare tokens out of the environment. The web build needs no secrets.
3. `1password/load-secrets-action@v2` with **`export-env: false`** — secrets become step outputs,
   not `$GITHUB_ENV` entries visible to every subsequent step.
4. Record the D1 Time Travel bookmark → `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY`, an artifact
   (90-day retention), and a `deploys` row. With no staging, this bookmark **is** the rollback
   plan; it must not live only in a CI log that expires and is unreadable at 2 a.m.
5. `wrangler d1 migrations apply --remote`
6. `wrangler secret bulk` — built with `jq` and piped via **stdin**, so no secret appears in
   `argv`. Secrets before code, so a release introducing a new secret never runs without it.
7. `wrangler deploy`
8. Smoke test against `https://${APP_HOST}/healthz`, asserting `.ok == true and .commit == $sha`.
   `APP_HOST` comes from `env:`, not shell interpolation.

`environment: production`, `permissions: contents: read`,
`concurrency: { group: deploy-production, cancel-in-progress: false }` — never cancel a
half-applied migration.

Spec: §11.2.

### P0-14 · `backup.yml`

Sunday 03:00 Asia/Taipei (`0 19 * * 0`) plus `workflow_dispatch`.
`wrangler d1 export wherego --remote`, encrypted with `age` against `BACKUP_AGE_PUBLIC_KEY`,
uploaded as a 1-year-retention artifact.

D1 Time Travel is a 30-day window and nothing else exists. The §7 Export screen covers *visits*,
not `patients` — and `patients` is the irreplaceable table.

Spec: §11.3.

### P0-15 · Preview-version flow and the local loop

- Adopt `wrangler versions upload` → `versions secret put` → smoke-test the preview URL →
  `wrangler versions deploy` **from now**, not from Phase 7. The risky deploys are the early ones.
- Verify `wrangler dev --local` gives real D1 with migrations applied.
- Verify a `cloudflared` tunnel pointed at the **dev** LINE channel.

Spec: §11.4 items 3–4, §11.5.

### P0-16 · The clinic conversation — 個資法 and all seven open questions

Half a page, settled as a conversation rather than legal work (§9.1):

- **Named controller** — the clinic is the 蒐集者; WhereGo is a tool they operate.
- **Processor list** — Cloudflare (hosting, D1), Google (geocoding, routing), LINE (messaging),
  1Password (credentials), GitHub (CI, encrypted backups).
- **Cross-border transfer** — addresses go to Google; D1 has no Taiwan region and runs APAC. The
  clinic acknowledges this in writing.
- **Purpose and notice** — in the terms the clinic already uses with patients.
- **Retention** — "records live until binned" is not a policy. State one.
- **Deletion** — document the hard-delete procedure. Soft delete cannot honour a 刪除權 request;
  `deleted_at` hides a row, it does not remove the name and address. Purge the patient row and
  anonymize their visits to a tombstone id, retaining only the counts the clinic needs.
- **Incident response** — a lost or stolen phone is an incident: 封鎖 the `line_recipients` row
  and have the conversation deleted. Offboarding staff get the same treatment.

**Ask all seven open questions in this same conversation** (ROADMAP.md § *Open questions*), not
staggered by the phase they block. Record the answers in §12 of PLAN.md.

### P0-17 · Seed data

`doctors` with the clinic's base coordinates (大寮衛生所) and `max_visits_per_day = 8`;
`holidays` for the current year from the 行政院人事行政總處 calendar — including 補班 make-up
Saturdays modelled as an explicit working-day override, not as an absent holiday;
`settings` with all §3 defaults and correct `tier` values; `settings.expected_roster_size` from
the clinic.

One manual `wrangler deploy` so `wrangler secret bulk` has a target on the first CI run.

Spec: §3, §5.3 *Non-working target days*, §10.7 steps 8–9.

---

## Acceptance criteria

- [ ] The custom domain resolves to the Worker and `workers_dev = false`.
- [ ] A push to `main` runs CI, and only on CI success does `deploy.yml` run — verified by
      deliberately merging a commit with a failing test and observing no deploy.
- [ ] The deploy is held at the required-reviewer gate and proceeds only on approval.
- [ ] The smoke test fails when the deployed commit SHA does not match, verified by forcing it.
- [ ] An unauthenticated request to an app route returns **403** in production. A CI test asserts
      this and asserts the allowlist has exactly two entries.
- [ ] `/healthz` answers unauthenticated with `{ok, version, commit}` — a 200, not a 302.
- [ ] `wrangler d1 migrations apply` produces the complete §3 schema, verified by inspecting the
      remote schema, including `uq_visits_cycle_live` as a **partial** index.
- [ ] `backup.yml` runs on demand and produces a decryptable `age` artifact — decrypt it once, now.
- [ ] Each cron's healthchecks.io check exists and can be pinged manually.
- [ ] `wrangler dev --local` serves the Worker with real D1 and the tunnel reaches the **dev**
      LINE channel.
- [ ] `wrangler versions upload` → smoke → `versions deploy` performed once, successfully.
- [ ] The Google Maps ToS caching answer is written down, and §4 reflects it.
- [ ] The 個資法 half-page exists and the clinic has acknowledged the cross-border transfer.
- [ ] All seven open questions have been asked; answers recorded in §12.

---

## Exit gate

**A green production deploy through the full chain, and an unauthenticated app route returning
403.** Do not begin Phase 1 until both are true — every later phase deploys through this chain,
and a authentication hole found in Phase 4 has by then been assumed correct by four phases of work.
