# T17 · `backup.yml`

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-14
**Spec** `docs/PLAN.md` §11.3 · **Depends on** T15 · **State** `todo`
**Execution** agent

## Outcome

`.github/workflows/backup.yml` exports D1 weekly, encrypts it with `age` against
`BACKUP_AGE_PUBLIC_KEY`, and uploads it as a 1-year-retention artifact.

## Scope

- **In:** the workflow file.
- **Out:** the decrypt drill against a real artifact — that runs in T20 alongside the other
  end-to-end proofs, because it needs a real remote D1 with rows in it.

## Detail

```yaml
on:
  schedule: [{ cron: "0 19 * * 0" }]     # Sunday 03:00 Asia/Taipei
  workflow_dispatch:
```

`wrangler d1 export wherego --remote`, encrypted with `age` against `BACKUP_AGE_PUBLIC_KEY` (private
key in 1Password, T14/T15), uploaded as a **1-year-retention** artifact.

Why this exists at all, verbatim from §11.3 — it is the difference between a 30-day window and a
real backup:

> D1 Time Travel is a 30-day window and nothing else exists today. An accidental `DELETE` noticed
> on day 31, a billing lapse, or a Cloudflare-side incident loses the roster permanently — and the
> §7 Export screen covers **visits**, not `patients`, which is the irreplaceable table: it was
> reconstructed by hand from a CSV missing 69% of its addresses. This is CI-side and does not
> contradict §2's "no R2".

The export contains **the entire patient table** — names, birth MMDD, home addresses, coordinates.
It must be encrypted **before** it is uploaded, and the plaintext export must never become an
artifact, never be echoed, and never survive the job. The `age` recipient is a public key, so the
job needs no decryption capability at all; the private key stays in 1Password and never enters CI.

`workflow_dispatch` is required — T20 runs this on demand.

Pin every action to a full commit SHA (§11.1).

## Acceptance criteria

- [ ] `actionlint` clean.
- [ ] Triggers are the Sunday `0 19 * * 0` schedule **and** `workflow_dispatch`.
- [ ] The job loads only `BACKUP_AGE_PUBLIC_KEY` and the Cloudflare credentials from 1Password —
      not the LINE, Google or Access secrets.
- [ ] The plaintext export is encrypted before the upload step, and no step uploads, prints or
      leaves behind the unencrypted file.
- [ ] The artifact retention is 365 days.
- [ ] The private key is referenced nowhere in the workflow.
- [ ] Every `uses:` is pinned to a full 40-character commit SHA.
- [ ] `environment: production`, and `permissions: contents: read`.

## Validation

Static: `actionlint` and structural assertions — encryption step before upload, the retention value,
the secret list, absence of the private key. Then prove the mechanism locally without touching
production: export a **synthetic** local D1 (T06) to a file, run the same `age` command against the
real public key, and decrypt it with the private key. That proves the command shape and the key
pair; the real remote export and its decrypt drill are T20's. **No production data is exported
during validation** — the standing rule that patient data is never handled by the harness applies
to backups most of all.

## Open questions

None.
