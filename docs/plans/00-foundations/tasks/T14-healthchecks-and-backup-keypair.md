# T14 · healthchecks.io checks and the `age` backup keypair

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-10
**Spec** `docs/PLAN.md` §2, §5.6 item 9, §10.3, §11.3 · **Depends on** — · **State** `todo`
**Execution** **manual** — healthchecks.io, plus `age-keygen` locally.

## Outcome

A healthchecks.io check exists per cron with its ping URL recorded, and an `age` keypair exists with
both halves held for 1Password.

## Scope

- **In:** the checks, their schedules and grace periods, the ping URLs, and the keypair.
- **Out:** pinging from the Worker (Phase 3). `backup.yml` itself (T17). Storing either in 1Password
  (T15).

## Detail

Why an external monitor is architecture rather than ops, verbatim from §2:

> **An external monitor is part of the architecture, not an ops afterthought.** Every detector in a
> system that lives inside the thing being detected is worthless the moment that thing stops
> running. The gap audit, the rule audit and the alerting all run in the Worker; `healthchecks.io`
> is the only observer outside the failure domain (R15).

P0-10 puts it plainly: **an in-Worker heartbeat cannot detect its own non-execution.**

One check per cron, matching T04's three triggers:

```
"0 0 * * 1-5"    # Mon–Fri 08:00 Asia/Taipei — commit run
"0 23 * * 0-4"   # Mon–Fri 07:00 Asia/Taipei — morning push
"0 18 * * *"     # daily 02:00 Asia/Taipei — nightly maintenance
```

A check whose schedule does not match its cron either alerts every day or never alerts. Both are
worse than no check, and the `0-4` weekday field on the morning push is exactly where that mistake
gets made.

`HEALTHCHECK_PING_URL` is a §10.3 runtime secret. §10.5's vault layout lists
`healthchecks/ping_url` singular — with three checks there are three URLs, and how they are stored
is a question for T15, not an assumption to make here.

**The `age` keypair:** `age-keygen`. The **public** key becomes `BACKUP_AGE_PUBLIC_KEY` and is
pushed into the Worker's environment for §11.3's weekly export. The **private** key goes into
1Password too — and it is the only thing that can ever read a backup. §11.3 on why the backup
exists at all:

> D1 Time Travel is a 30-day window and nothing else exists today. An accidental `DELETE` noticed
> on day 31, a billing lapse, or a Cloudflare-side incident loses the roster permanently — and the
> §7 Export screen covers **visits**, not `patients`, which is the irreplaceable table.

## Manual checklist

1. Create three healthchecks.io checks, one per cron, each with the matching schedule, the correct
   timezone, and a grace period wider than the job's worst-case runtime.
2. Record all three ping URLs.
3. Run `age-keygen`. Record the public key and the private key.
4. **Verify the keypair round-trips before going any further**: encrypt a scratch file to the public
   key and decrypt it with the private key. A keypair that has never decrypted anything is not a
   backup plan.
5. Hand all of it to T15. Neither key goes into the repo.

## Acceptance criteria

- [ ] Three checks exist, one per cron expression, with schedules that match those expressions and
      the Asia/Taipei timezone.
- [ ] Each check can be pinged manually and its status goes green — proven by pinging each one.
- [ ] Each check's grace period is set deliberately, not left at the default.
- [ ] An `age` keypair exists.
- [ ] A scratch file encrypted to the public key decrypts with the private key. Done once, now.
- [ ] Neither key, and no ping URL, appears in the repo or in git history.

## Validation

`curl` each ping URL and observe the check turn green in the dashboard. Round-trip the keypair with
a scratch file and delete the scratch file afterwards. T17's `backup.yml` decrypt drill is a
separate, later proof against a real D1 export — this one only proves the keys are a pair.
Nothing here is agent-executable.

## Open questions

- **Three ping URLs, one vault field.** §10.5 shows `healthchecks/ping_url` singular and §10.3
  lists a single `HEALTHCHECK_PING_URL` secret. Decide in T15 whether that is three fields, one
  JSON blob, or one check with three tags — and if the spec's shape has to change, change the spec.
