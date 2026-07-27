# T16 · `deploy.yml`

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-13
**Spec** `docs/PLAN.md` §11.2 · **Depends on** T10, T15 · **State** `todo`
**Execution** agent

## Outcome

`.github/workflows/deploy.yml` exists, triggered only by a successful CI run on `main` or a manual
dispatch, with the eight steps in the order §11.2 specifies and for the reasons it gives.

## Scope

- **In:** authoring the workflow file and pinning its actions.
- **Out:** **running it.** The first green production deploy and the four negative proofs are T20 —
  that split is deliberate: this task produces a file that can be reviewed and structurally
  asserted, T20 produces evidence that the chain works, and neither can substitute for the other.

## Detail

Copy the workflow from §11.2, including its comments — every one of them records a defect that was
found the hard way and will be re-introduced by anyone who reads the file without them.

**Trigger.** `workflow_run: workflows: [CI], types: [completed], branches: [main]` plus
`workflow_dispatch`, guarded by
`github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'`.
**Not `push: main`** — verbatim:

> ci.yml and deploy.yml were independent workflows on the same trigger, so a merge with failing
> property tests deployed the broken scheduler straight to production — no staging, and the blast
> radius is a real patient's medication.

`workflows: [CI]` matches on workflow **name**; T10 sets `name: CI` and the two must agree.

**Step order, and each ordering is deliberate:**

1. checkout / pnpm / node 22
2. **`pnpm --filter web build` — before the 1Password step.** Verbatim:
   > `pnpm build` runs arbitrary code from the dependency tree — Vite plugins, esbuild, any
   > transitive postinstall. With the 1Password step above it, one compromised dev-dependency reads
   > the LINE channel access token and the Cloudflare API token straight out of the environment.
   > The web build needs no secrets: the browser Maps key is a build-time var.
3. `1password/load-secrets-action` with **`export-env: false`** — secrets become step **outputs**,
   consumed only where needed, rather than living in `$GITHUB_ENV` for every subsequent step.
4. Record the D1 Time Travel bookmark to `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY`, an artifact
   (90-day retention), and a `deploys` row. Verbatim:
   > With no staging environment, this bookmark IS the rollback plan — so it must not live only in
   > a CI log that expires and is unreadable at 2 a.m.
5. `wrangler d1 migrations apply wherego --remote`
6. `wrangler secret bulk` — built with `jq`, piped via **stdin**, so no secret appears in `argv`.
   **Secrets before code: a release introducing a new secret never runs without it.**
7. `wrangler deploy`
8. Smoke test against `https://${APP_HOST}/healthz`, asserting
   `.ok == true and .commit == $sha`. Verbatim:
   > Asserting the commit SHA, not just ok:true — otherwise this passes against the PREVIOUS
   > version whenever a deploy silently no-ops.

   `APP_HOST` comes from `env:` (the T15 Environment variable), **not** shell interpolation.

Job-level: `environment: production` (which is what gates both the token and the required
reviewer), `permissions: contents: read`, and
`concurrency: { group: deploy-production, cancel-in-progress: false }` — **never cancel a
half-applied migration.**

The `deploys` row in step 4 is a D1 write. §3's `deploys` table exists for exactly this, and it is
written by `wrangler d1 execute` from CI rather than through the `PlanCoordinator` — the standing
"every write through the Durable Object" rule governs the running application, not the deploy
pipeline, which by construction runs when the application is being replaced. Note this in the plan
rather than routing around it.

**Pin every action to a full commit SHA** (§11.1) — this workflow holds a token that can rewrite the
production Worker, which is the reason the rule exists at all.

## Found at T04 — 2026-07-26

**§11.2's deploy step is a bare `wrangler deploy`, and T04 has made that emit a warning.** Because
`wrangler.toml` now defines a named `[env.local]` environment, any wrangler command run without
`--env` prints:

> Multiple environments are defined in the Wrangler configuration file, but no target environment
> was specified for the deploy command.

It is a warning, not an error, and the deploy still targets the top-level (production) config, which
is the correct target. **Copy §11.2 verbatim anyway** — it is specification and this task's rule is
to copy it. Recorded here so the warning is recognised as known rather than investigated at T20
during the one deploy that matters. The clean form, if the spec is ever revised, is
`wrangler deploy --env=""`.

**`ENVIRONMENT` must never appear in the `secret bulk` payload** *(added 2026-07-26, T04 revision 2)*.
§9's local bypass is gated on the **value** `"local"`, not on where the value came from — and a
secret carries a value onto the deployed Worker by a route no configuration guard can see. T04's R11
parses every wrangler config in the tree and proves exactly one `vars` table sets `ENVIRONMENT`, but
that check ends at the config file. This is the other half of the same rule, it has never been
guarded anywhere, and it belongs to the task that writes the payload. A criterion below asserts it.

**Two commands in this workflow gain a hard prerequisite from T04's `[assets]` block:** wrangler
errors out if `apps/web/dist` is missing, so the web build step must precede the deploy step. The
existing criterion asserting the build step's index is lower than the 1Password step's index already
covers the ordering; this is why it matters.

## Acceptance criteria

- [ ] `actionlint` clean.
- [ ] The trigger is `workflow_run` on `[CI]` / `completed` / `main` plus `workflow_dispatch`, with
      the conclusion guard. There is no `push:` trigger.
- [ ] All eight steps are present **in the specified order**. Asserted structurally: the web build
      step's index is lower than the 1Password step's index.
- [ ] `export-env: false` is set on the 1Password step.
- [ ] No secret is referenced in a `run:` command line; secrets reach `wrangler secret bulk` only
      via `jq` on stdin. A regex over the file finds no secret in `argv` position.
- [ ] The bookmark is written to all four destinations, and the artifact has 90-day retention.
- [ ] Migrations run **before** `wrangler secret bulk`, which runs **before** `wrangler deploy`.
- [ ] **The `secret bulk` payload contains no key named `ENVIRONMENT`** — the `jq` expression that
      builds it is asserted to construct exactly the §10.3 names and no others. A secret of that
      name would ship T08's local bypass to production, and no wrangler-config guard can see it
      (T04 revision 2).
- [ ] The smoke test uses `APP_HOST` from `env:` and asserts both `.ok` and `.commit`.
- [ ] `environment: production`, `permissions: contents: read`, and `concurrency` with
      `cancel-in-progress: false` are all present.
- [ ] Every `uses:` is pinned to a full 40-character commit SHA.
- [ ] The `workflow_run` workflow name matches `ci.yml`'s `name:` exactly, asserted by reading both
      files.
- [ ] Every `op://` reference in the file matches a field T15 created.

## Validation

Static: `actionlint`, plus structural assertions over the parsed YAML for step order, the trigger,
the concurrency block and the SHA pins — step **order** is the substance of this task and is not
something a reviewer reliably catches by eye. Cross-file: assert the CI workflow name matches, and
that every `op://` path in this file appears in T15's vault inventory. **No deploy is run and no
credential is used during validation** — the evidence that the chain works is T20's, and claiming
it here would be claiming a manual result as an automated one.

## Open questions

- How the `deploys` row is written from CI — `wrangler d1 execute --remote` inline, or a small
  script. `/design-task` asks; it is the one step §11.2 names without giving the command.
