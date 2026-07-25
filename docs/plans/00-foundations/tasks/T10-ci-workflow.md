# T10 · `ci.yml`

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-12
**Spec** `docs/PLAN.md` §11.1 · **Depends on** T01, T08, T09 · **State** `todo`
**Execution** agent

## Outcome

`.github/workflows/ci.yml` runs the full seven-step verification on every PR and on push to main,
needs no credentials, and pins every action to a full commit SHA.

## Scope

- **In:** the workflow file and its action pins.
- **Out:** `deploy.yml` (T16). `backup.yml` (T17). Observing CI actually go green on GitHub — that
  is T20, which needs a push.

## Detail

Copy the workflow from §11.1. Steps, in order:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint          # incl. no-restricted-globals: Date banned in packages/scheduler
pnpm test          # unit + fast-check property tests + golden CSV fixture
pnpm test:sim      # §5.8 simulation at 38 / 100 / 330 patients
pnpm test:worker   # @cloudflare/vitest-pool-workers — real Miniflare D1
pnpm build
```

`test:sim` is still a stub (T01); `test:worker` is real from T06. **Needs no credentials — that
property is the point and must never be traded away** (P0-12). §11.1:

> `ci.yml` runs on every PR and **needs no credentials**: because `packages/scheduler` is pure, the
> whole constraint engine is verified without touching Cloudflare, Google, LINE, or 1Password.

**Pin every action to a full commit SHA, not a tag.** Verbatim from §11.1:

> `actions/checkout@v4` is a mutable ref, and `deploy.yml` holds a token that can rewrite the
> production Worker.

The spec's YAML in §11.1 shows `@v4` tags for readability. **The tags are the illustration; the
pinning rule is the requirement.** Resolve each action to its current full 40-hex commit SHA and
keep the version as a trailing comment.

This workflow is also the trigger for `deploy.yml` (§11.2, T16): `workflow_run: workflows: [CI]`
matches on the workflow's **name**, so `name: CI` here and the string in `deploy.yml` must agree
exactly. A rename breaks deployment silently — CI stays green and nothing ever deploys.

## Carried forward from T01

**pnpm 11 gates postinstall scripts behind interactive approval.** `esbuild` needs one, and in a
non-interactive shell pnpm exits 1 *while swallowing stdout* — so the failure arrives as an install
that died with no visible reason. T01 resolved it by committing an `allowBuilds: { esbuild: true }`
block to `pnpm-workspace.yaml`.

A fresh CI checkout hits exactly this gate and passes **only because that block is in the tree**.
Do not remove it, and if a later task adds a dependency with a postinstall script, it needs the same
treatment. Verified versions at T01: pnpm 11.0.8, Node 24, `esbuild` via `vite@7.3.6`.

## Acceptance criteria

- [ ] `ci.yml` is valid workflow YAML — `actionlint` clean.
- [ ] `pnpm install --frozen-lockfile` completes in CI **non-interactively** — no build-script
      approval prompt, no silent exit 1. This is the T01 carry-forward above.
- [ ] It triggers on `pull_request` and on `push` to `main`, and on nothing else.
- [ ] All seven steps are present, in the order above.
- [ ] Node is 22 and pnpm caching is enabled.
- [ ] **Every** `uses:` is pinned to a full 40-character commit SHA. A regex over the file finds
      no `@v` tag reference outside a comment.
- [ ] The job declares no `secrets`, no `environment`, and reads no `${{ secrets.* }}`.
- [ ] `name:` is exactly `CI`, matching the `workflow_run` trigger `deploy.yml` will use in T16.

## Validation

`actionlint`, plus a structural assertion over the parsed YAML for the step list, the triggers, the
`name`, and the SHA-pinning regex — checked as a test rather than by eye, because a re-added `@v4`
during a later edit is invisible in review. Run the seven commands locally with every §10.3
variable unset to prove the no-credentials property holds in practice, not just in the file.
Observing a real GitHub run belongs to T20.

## Open questions

None.
