# T20 · First green production deploy — and the four negative proofs

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-13 (verification), P0-14 (drill), phase acceptance criteria
**Spec** `docs/PLAN.md` §11.1, §11.2, §11.3 · **Depends on** T16, T19 · **State** `todo`
**Execution** **manual** — real pushes to GitHub, real deploys, real approvals.

## Outcome

The full chain has run green end to end — CI → required-reviewer gate → migrate → secrets → deploy
→ smoke — and each of its four safety properties has been proven by **making it fail on purpose**.
This is the phase exit gate.

## Scope

- **In:** the first CI-driven production deploy, the four deliberate-failure proofs, the backup
  decrypt drill against a real export, and confirming the 403.
- **Out:** everything else. This task writes no code; if a proof fails, the defect goes back to
  the task that owns it (T10, T16, T17, T08) rather than being patched here.

## Detail

The phase acceptance criteria in `00-foundations.md` include four assertions that can only be
proven by deliberately breaking something. They are grouped here because each one costs a real
push and a real deploy cycle, and because a chain proven only in the happy direction has not been
proven at all — every one of these guards exists because its absence is silent.

**Proof 1 — CI gates deploy.** Verbatim from the phase plan:

> A push to `main` runs CI, and only on CI success does `deploy.yml` run — verified by deliberately
> merging a commit with a failing test and observing no deploy.

**Proof 2 — the required reviewer holds it.**

> The deploy is held at the required-reviewer gate and proceeds only on approval.

**Proof 3 — the smoke test can fail.**

> The smoke test fails when the deployed commit SHA does not match, verified by forcing it.

A smoke test that has never failed is an assertion nobody has checked. §11.2's reason for asserting
the SHA at all: *otherwise this passes against the PREVIOUS version whenever a deploy silently
no-ops.*

**Proof 4 — the backup is readable.**

> `backup.yml` runs on demand and produces a decryptable `age` artifact — **decrypt it once, now.**

An untested backup is not a backup, and this one is the only thing standing between a day-31
mistake and permanently losing `patients` (§11.3).

Plus the exit gate's other half, which T08 proved locally and this task proves in production:

> An unauthenticated request to an app route returns **403** in production.

Note it must be **403 from the Worker**, not a 302 from Access. Both would look like "not letting
me in"; only one of them means the middleware is doing its job at a hostname Access does not
cover.

Also confirm here, from the phase acceptance list: each cron's healthchecks.io check can be pinged
(T14 proved this standalone; confirm the ping URLs the Worker will use are the ones in the vault).

## Manual checklist

1. Push a commit to `main` with a **deliberately failing test**. Observe CI red and **no** deploy
   run. Revert.
2. Push a good commit. Observe CI green, then `deploy.yml` **waiting** at the required-reviewer
   gate. Leave it waiting long enough to be sure it is not proceeding.
3. Approve. Observe: bookmark recorded (job summary, artifact, `deploys` row), migrations applied,
   `wrangler secret bulk` succeeded, deploy succeeded, smoke test green.
4. `curl https://<hostname>/healthz` — confirm `commit` equals the newly deployed SHA.
5. **Force the smoke test to fail.** Re-run the smoke step against a wrong SHA, or dispatch a deploy
   of a stale ref, and observe a red job. Do not merge a change to the assertion to achieve this.
6. `curl` an app route with no Access JWT. Expect **403** from the Worker.
7. `workflow_dispatch` `backup.yml`. Download the artifact. **Decrypt it with the `age` private key
   from 1Password.** Confirm it is a readable SQL export containing the seeded `settings` rows.
   Delete the plaintext afterwards.
8. Confirm the three healthchecks ping URLs in the vault are the ones recorded in T14.

## Acceptance criteria

- [ ] A commit with a failing test reaches `main`, CI goes red, and **no** deploy run is created.
- [ ] A green CI run creates a deploy run that **waits** for the required reviewer, and proceeds
      only after approval.
- [ ] The full deploy succeeds: bookmark recorded in all four places, migrations applied, secrets
      synced, Worker deployed, smoke test green.
- [ ] The `deploys` table has a row with the commit SHA and the D1 bookmark.
- [ ] The bookmark artifact is downloadable and has 90-day retention.
- [ ] `/healthz` on the custom domain reports the newly deployed SHA.
- [ ] The smoke test has been observed **failing** on a SHA mismatch, without weakening the
      assertion to do it.
- [ ] An unauthenticated app route returns **403 from the Worker** — not 302, not the Access login
      page. **Settled at T04: routing is worker-first (`run_worker_first = true`), so "an app route"
      may be any path other than `/healthz` and the LINE webhook — `/` and any static asset
      included.** Use `/` and one hashed bundle; a 200 with the SPA shell means the setting has
      regressed to assets-first.
- [ ] `backup.yml` ran on demand, and its artifact was **decrypted** and read.
- [ ] The three healthchecks ping URLs in the vault match the checks created in T14.

## Validation

The evidence is the GitHub run history, the live endpoints, and the decrypted file — all of it
observed, none of it inferred. Every criterion here is `manual`; no agent can run a production
deploy or approve a reviewer gate, and none should report one as met.

If any proof fails, the fix belongs to the task that owns the artifact — T10 for the CI trigger,
T16 for step order or the smoke assertion, T17 for the backup, T08 for the 403, T15 for the
reviewer gate. Re-run this task afterwards. **Do not repair a workflow inside this task**; that is
how a proof gets adjusted until it passes.

## Open questions

None. This task is where the phase either closes or does not.
