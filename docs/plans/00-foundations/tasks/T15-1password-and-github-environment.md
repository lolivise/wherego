# T15 · 1Password vault, service account, and the `production` GitHub Environment

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-11
**Spec** `docs/PLAN.md` §10 (all of it) · **Depends on** T03, T12, T13, T14 · **State** `todo`
**Execution** **manual** — 1Password, Cloudflare, GitHub settings.

## Outcome

Every credential in the system lives in the `Wherego` 1Password vault; a read-only service account
can read exactly that vault; its token is a `production` **Environment** secret behind a required
reviewer; and the Cloudflare API token has exactly the five §10.2 permissions.

## Scope

- **In:** the vault, its contents, the service account, the Cloudflare API token, the GitHub
  Environment and its reviewer, `APP_HOST` as a variable, and secret scanning.
- **Out:** `deploy.yml` consuming any of it (T16). Running a deploy (T18, T20).

## Detail

**Every secret lives in 1Password. The only credential in GitHub is the service account token that
unlocks the rest** (§10). Vault layout from §10.5 — **one item, one section per service**, so a
reference is `op://<vault>/<item>/<section>/<field>`:

```
Vault: Wherego
└── credentials                    ← a single item; the services are SECTIONS within it
      ├── CLOUDFLARE
      │     ACCOUNT_ID             ← T02, already stored
      │     API_TOKEN              ← step 2 below
      ├── CLOUDFLARE_ACCESS
      │     AUD                    ← T19 fills these; create them now, leave them empty
      │     TEAM_DOMAIN
      ├── GOOGLE_MAPS
      │     API_KEY                ← T12
      ├── LINE
      │     CHANNEL_SECRET         ← T13 (production)
      │     CHANNEL_ACCESS_TOKEN   ← T13 (production)
      │     CHANNEL_ID
      │     ALERT_RECIPIENT        ← T13 (LINE_ALERT_RECIPIENT, §10.3)
      ├── HEALTHCHECKS
      │     PING_URL               ← T14; three checks, one field — see T14's open question
      └── BACKUP
            AGE_PUBLIC_KEY         ← T14
            AGE_PRIVATE_KEY        ← T14; never leaves the vault, never reaches CI
```

**Every segment matches literally** — `CLOUDFLARE` is not `Cloudflare`, `ACCOUNT_ID` is not
`Account ID`. A mismatched label resolves to an empty value, and the failure is reported against
the workflow step rather than the field. This is exactly what checklist step 9 exists to catch.

The `BACKUP_AGE_PUBLIC_KEY` / `HEALTHCHECK_PING_URL` omission that P0-11 had to resolve is **gone**
— §10.5's layout block now lists all twelve fields, so this task and the spec no longer disagree.
The **private** key is stored but is never a Worker secret and never enters CI.

**Environment secret, not repository secret** (§10.1) — verbatim, because the distinction is one
dropdown and the failure is total:

> a repository secret is readable by any workflow on any branch.

**Add a required reviewer to the `production` Environment.** From P0-11:

> One checkbox, and the only human gate between `git push` and a live clinical scheduler with no
> staging.

**Cloudflare API token** — custom, with exactly these five (§10.2):

| Scope | Permission | Level | Needed for |
|-------|-----------|-------|-----------|
| Account | Workers Scripts | Edit | `wrangler deploy` |
| Account | D1 | Edit | `wrangler d1 migrations apply` |
| Account | Account Settings | Read | account resolution |
| User | User Details | Read | `wrangler whoami` |
| Zone | Workers Routes | Edit | only if a custom domain is bound |

The Zone/Workers Routes row is required here, because T18 does bind a custom domain. Cloudflare has
no GitHub OIDC support for API tokens, so this is long-lived — **set an expiry and calendar the
rotation** (§10.6).

`APP_HOST` (the T02 hostname) is a GitHub Environment **variable, not a secret** — §11.2 reads it
via `vars.APP_HOST` in the smoke test.

Also §10.6: enable GitHub **secret scanning + push protection**.

## Manual checklist

1. In the `Wherego` vault, extend the `credentials` item so every section and field above exists.
   `CLOUDFLARE/ACCOUNT_ID` is already there from T02. Create `CLOUDFLARE_ACCESS/AUD` and
   `TEAM_DOMAIN` now with empty values so T19 has somewhere to write.
2. Create the Cloudflare API token with **exactly** the five permissions — no more. Set an expiry.
   Put it in `CLOUDFLARE/API_TOKEN`.
3. Create the read-only 1Password **service account**, scoped to the `Wherego` vault only. Set an
   expiry. Put a calendar reminder for the rotation.
4. GitHub → Settings → Environments → create `production`.
5. Add `OP_SERVICE_ACCOUNT_TOKEN` as an **Environment** secret on `production`. Confirm it is not
   also a repository secret.
6. Add a **required reviewer** to the `production` Environment.
7. Add `APP_HOST` as an Environment **variable** on `production`, set to the T02 hostname.
8. Enable secret scanning and push protection on the repository.
9. Verify every `op://` reference in §11.2's `deploy.yml` block resolves against the vault, using
   the service account token — before T16 depends on it.

## Acceptance criteria

- [ ] Every section and field in the layout above exists in `Wherego/credentials`, spelled and
      cased exactly. `CLOUDFLARE_ACCESS/AUD` and `TEAM_DOMAIN` exist and are empty, pending T19.
- [ ] The service account is read-only and scoped to `Wherego` only — it cannot read another vault.
      Verified by trying.
- [ ] `OP_SERVICE_ACCOUNT_TOKEN` is an Environment secret on `production` and is **not** a
      repository secret.
- [ ] The `production` Environment has a required reviewer.
- [ ] `APP_HOST` is an Environment **variable** with the T02 hostname as its value.
- [ ] The Cloudflare API token has exactly the five §10.2 permissions — verified by reading the
      token's permission list, and confirming nothing beyond them is granted.
- [ ] The Cloudflare API token and the service account token both have an expiry, and both
      rotations are in a calendar.
- [ ] Secret scanning and push protection are on.
- [ ] Every `op://Wherego/credentials/...` reference used in §11.2 resolves to a **non-empty**
      value. Proven by resolving them, not by reading the paths — a wrong section or field label
      resolves empty rather than erroring.
- [ ] No secret was echoed to a terminal or passed as a command-line argument (§10.6).

## Validation

Resolve each `op://` reference with the service account token and confirm a non-empty value —
that is the criterion that catches a typo'd path, and a typo'd path is a deploy failure at T20 with
a message that names the workflow rather than the field. Attempt a read against a second vault and
confirm it is denied. Read the token permission pages rather than asserting from intent. Nothing
here is agent-executable, and **no secret value may be pasted into any harness artifact or agent
prompt** — validation records that a reference resolved, never what it resolved to.

## Open questions

- **Three healthchecks ping URLs, one `PING_URL` field** (carried from T14). Decide the shape here
  and, if it differs from §10.3/§10.5, update the spec rather than diverging from it.
