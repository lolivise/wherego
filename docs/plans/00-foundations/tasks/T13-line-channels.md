# T13 · LINE channels — production **and** development

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-08
**Spec** `docs/PLAN.md` §10.7 steps 3–4, §11.4 · **Depends on** T02 · **State** `todo`
**Execution** **manual** — LINE Developers console.

## Outcome

Two Messaging API channels exist — production, configured against the app hostname from T02, and a
free development channel with only the engineer's own account approved — and the Taiwan
push-message tier is confirmed.

## Scope

- **In:** both channels, their settings, the tokens and secrets captured for T15, and the tier
  confirmation.
- **Out:** webhook signature verification and every bot behaviour (Phase 5). Putting the
  credentials into 1Password (T15). The `cloudflared` tunnel (T21).

## Detail

**Production channel:** set the webhook URL (the hostname decided in T02 plus the webhook path),
**disable auto-reply**, set the Official Account to **not searchable**, and issue the long-lived
channel access token.

**The development channel is not optional and not a nicety.** Verbatim from P0-08:

> **Create a second, free Messaging API channel as the development OA**, with your own account as
> its sole approved recipient. A channel has exactly one webhook URL, so without this, pointing a
> `cloudflared` tunnel at it takes the production bot offline for the duration — which across
> Phase 5 is most of it. Ten minutes, no cost.

§11.4 makes it a standing control rather than a Phase 5 convenience: local E2E points the tunnel at
the **dev** channel, never at production, and **never puts test patients in production D1**.

**Confirm the Taiwan push-message tier.** This feeds open question 6 (how many LINE recipients, on
which tier), which T11 asks the clinic. Confirming the tier here means the clinic answers a real
question rather than a hypothetical one.

The credentials this task produces are §10.3 runtime secrets — `LINE_CHANNEL_SECRET`,
`LINE_CHANNEL_ACCESS_TOKEN` — plus `channel_id` per the §10.5 vault layout. They go to T15.
`LINE_ALERT_RECIPIENT` (the engineer's own LINE user id, the destination for every job failure under
R15) is also captured here, since obtaining it means messaging the dev channel.

## Manual checklist

1. **Production channel.** Create it. Webhook URL = `https://<T02 hostname>/<webhook path>`. Enable
   *Use webhook*.
2. Disable **auto-reply messages** and the default greeting.
3. Set the Official Account to **not searchable**.
4. Issue the **long-lived** channel access token. Record it, and the channel secret and channel id.
5. **Development channel.** Create a second, free Messaging API channel. Add your own account as
   its sole approved recipient. Record its secret, token and id separately — the two sets must
   never be confusable.
6. Capture your own LINE user id for `LINE_ALERT_RECIPIENT`.
7. Confirm the **Taiwan push-message tier** and its free-message allowance. Write the number down
   for T11.
8. Hand everything to T15. Nothing from this task goes into the repo.

## Acceptance criteria

- [ ] Two Messaging API channels exist and are clearly distinguishable by name.
- [ ] The production channel's webhook URL is the T02 hostname — not a `workers.dev` URL, not a
      tunnel URL.
- [ ] Auto-reply and the default greeting are **off** on the production channel.
- [ ] The production Official Account is **not searchable**.
- [ ] A long-lived channel access token exists for production.
- [ ] The development channel exists, is free-tier, and has exactly one approved recipient.
- [ ] `LINE_ALERT_RECIPIENT` — the engineer's LINE user id — is recorded.
- [ ] The Taiwan push tier is confirmed and written down against open question 6.
- [ ] No token, secret or user id from this task appears in the repo or in git history.

## Validation

Console inspection of each setting on both channels. The webhook URL will not respond yet — the
Worker is not bound to the hostname until T18 — so **do not** use LINE's *Verify* button as a
criterion here; it belongs to Phase 5, and a red verify result at this point is expected rather than
a bug. Nothing in this task is agent-executable, and no validation anywhere in this project calls
the real LINE API: Phase 5 runs against `tools/mocks/line/`.

## Open questions

- The webhook path. It is one of exactly two paths on T08's unauthenticated allowlist, so it must
  match what T08 allowlists. If T08 has already run, take the path from there; if not, decide it
  here and T08 inherits it. Either way it is decided once.
