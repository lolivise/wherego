# T21 · Preview-version flow and the dev-channel tunnel

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-15 (preview + tunnel halves)
**Spec** `docs/PLAN.md` §11.4 items 3–4, §11.5 · **Depends on** T13, T18 · **State** `todo`
**Execution** **manual** — wrangler against production, plus a `cloudflared` tunnel.

## Outcome

The `wrangler versions upload` → `versions secret put` → smoke-test-the-preview-URL →
`wrangler versions deploy` flow has been performed once successfully, and a `cloudflared` tunnel
reaches the **development** LINE channel.

## Scope

- **In:** performing the preview-version flow once, end to end, and writing the commands down.
  Standing up the tunnel and proving it reaches the dev channel.
- **Out:** making `deploy.yml` use preview versions — T16 deploys directly, and changing that is a
  Phase 7 decision. LINE webhook handling (Phase 5).

## Detail

**Preview versions from Phase 0, not Phase 7.** §11.4 item 4, verbatim, because the whole point of
this task is that it is being done now rather than later:

> **Zero-traffic preview versions, from Phase 0 — not Phase 7.** `wrangler versions upload` →
> smoke-test the preview URL → `wrangler versions deploy` to promote. This is the closest thing to
> staging the architecture allows and it costs nothing; adopting it in the final phase means the
> entire build happens without it, which is backwards. **The risky deploys are the early ones.**

§11.5 adds the secret step: `wrangler versions upload` → `versions secret put` → smoke-test →
`wrangler versions deploy`. A preview version does not inherit new secrets, so a release that
introduces one fails on the preview URL — which is exactly the rehearsal this flow exists to give.

**The tunnel.** §11.4 item 3: local E2E with Miniflare, with the tunnel pointed at the **dev LINE
channel** (§10.7 step 4), **never at production**. T13 created the dev channel precisely so this is
possible; verbatim from P0-08: *a channel has exactly one webhook URL, so without this, pointing a
`cloudflared` tunnel at it takes the production bot offline for the duration.*

Doing this now means Phase 5 starts with a working loop rather than discovering the constraint
mid-phase.

## Manual checklist

1. `wrangler versions upload` on the current code. Record the preview URL.
2. `wrangler versions secret put` for at least one secret, to exercise the step rather than skip it.
3. Smoke-test the **preview URL**'s `/healthz` — confirm it returns the uploaded version's commit,
   and that it differs from the live version's if the code differs.
4. `wrangler versions deploy` to promote. Confirm the live hostname now reports that commit.
5. Write the four commands down where the next person will find them.
6. Start `cloudflared` against `wrangler dev --local` (T06). Point the **development** LINE
   channel's webhook URL at the tunnel.
7. Send a message to the dev OA. Confirm it reaches the local Worker.
8. Confirm the **production** channel's webhook URL is untouched and still points at the T02
   hostname.

## Acceptance criteria

- [ ] `wrangler versions upload` produced a preview URL, and `/healthz` on it answered with the
      uploaded commit.
- [ ] `versions secret put` was exercised, not skipped.
- [ ] `wrangler versions deploy` promoted that version, and the live hostname reports its commit.
- [ ] The four commands are written down.
- [ ] A `cloudflared` tunnel reaches `wrangler dev --local`, and a message to the **dev** OA arrives
      at the local Worker.
- [ ] The **production** channel's webhook URL still points at the T02 hostname and was never
      repointed at the tunnel. Checked after the tunnel work, not before.
- [ ] No test patient exists in production D1 as a result of anything in this task.

## Validation

Observed directly: the preview URL responds, the promotion changes the live commit, a real message
traverses the tunnel. The last two criteria are the ones that matter and the ones nobody checks —
confirm the production webhook URL **after** the tunnel session, since the failure mode is
repointing it and forgetting. Local D1 is Miniflare and synthetic throughout. Nothing here is
agent-executable.

## Open questions

None.
