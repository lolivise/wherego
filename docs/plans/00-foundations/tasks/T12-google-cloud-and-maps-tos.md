# T12 · Google Cloud project, restricted key, budget — and the Maps ToS caching answer

**Phase** [`../../00-foundations.md`](../../00-foundations.md) · **Plan tasks** P0-09
**Spec** `docs/PLAN.md` §4 *Geocoding rules*, §9, §10.3, §10.7 step 5 · **Depends on** — · **State** `todo`
**Execution** **manual** — Google Cloud console, plus reading the Maps Platform Terms.

## Outcome

A Google Cloud project exists with Geocoding, Places and Routes enabled, an API-restricted server
key and a billing budget alert — and the question of whether lat/lng caching is time-limited has a
written answer recorded in `docs/PLAN.md` §4.

## Scope

- **In:** the project, the three APIs, the server key, the budget alert, and the ToS answer.
- **Out:** putting the key into 1Password (T15). Any geocoding code (Phase 1). The browser key —
  named here so it is not conflated with the server key, but it is created when the SPA needs it in
  Phase 4.

## Detail

**The ToS answer is the deliverable that matters.** The ROADMAP lists it under *Decisions still owed
by the build* as a **schema gate, not a launch checkbox**. P0-09, verbatim:

> **Resolve the caching terms before the schema is finalized** (Maps Platform Terms §3.2.3 caching,
> §3.2.4 Place IDs). "Geocode once, cache forever" is load-bearing in §2 and §4. If the answer is
> time-limited, `geocode_cache.fetched_at` gains a reader and the nightly job gains a
> re-resolve-from-`place_id` sweep with a budgeted call volume. Today `fetched_at` is written and
> never read, which is the shape of an unanswered question.

§9 adds the scope of the answer:

> Place IDs are storable long-term; other content generally is not. Caching by address hash plus
> storing `place_id` keeps a re-resolve-from-place_id fallback open. `plan_days.route_km` /
> `route_minutes` are also stored Routes content and fall under the same answer.

So the answer covers three stored things, not one: `geocode_cache` lat/lng, `patients.lat/lng`, and
`plan_days.route_km` / `route_minutes`.

**Two hard rules on the key** (§10.3):

> it is a *server-side* key that never reaches the browser, and it is **API-restricted** to
> Geocoding, Places, and Routes only. Interactive maps in the SPA use a separate referrer-restricted
> browser key — a build-time `var`, not a secret.

## Manual checklist

1. Create the Google Cloud project. Enable **Geocoding**, **Places**, **Routes** — and nothing else.
2. Create the server key. Apply **API restrictions** to exactly those three. Leave application
   restrictions off or IP-based; **never** referrer-based, which would imply browser use.
3. Set a billing budget alert.
4. Read Maps Platform Terms §3.2.3 and §3.2.4. Write down the answer for each of: cached lat/lng,
   stored `place_id`, and stored Routes distances/durations.
5. Record the answer in `docs/PLAN.md` §4 **and** in this task's artifacts. Say what it implies:
   either "geocode once, cache forever holds" or "`fetched_at` gains a reader and the nightly job
   gains a re-resolve sweep with a budgeted call volume".
6. Hold the key for T15. Do not put it in the repo, an env file, or a chat message.

## Acceptance criteria

- [ ] The project exists with exactly Geocoding, Places and Routes enabled.
- [ ] The server key is API-restricted to those three, verified by reading the key's restriction
      page — not by intent.
- [ ] A billing budget alert exists with a threshold.
- [ ] A written answer to the caching question exists, covering lat/lng, `place_id`, and Routes
      distances/durations separately.
- [ ] `docs/PLAN.md` §4 reflects the answer.
- [ ] If the answer is time-limited: the implied change to the nightly sweep is written down as a
      Phase 3 requirement, and the reader for `geocode_cache.fetched_at` is named as a Phase 1
      requirement. If it is not time-limited: that is stated explicitly, so nobody re-opens it.
- [ ] The key exists nowhere in the repo, in git history, or in any file the harness wrote.

## Validation

Console inspection for the project, the API list, the key restrictions and the budget. The ToS
answer is validated by it existing and being specific — "seems fine" is not an answer, and a task
closed on one leaves Phase 1 building on an assumption. **No call is made to a real Google API in
this or any validation** (standing rule); Phase 1's geocoding runs against `tools/mocks/google/`.

## Open questions

- Whether the answer needs Google's own confirmation rather than a reading of the terms. If the
  terms are genuinely ambiguous, say so and record the conservative interpretation — a documented
  conservative reading is a decision; an undocumented optimistic one is the thing this task exists
  to prevent.
