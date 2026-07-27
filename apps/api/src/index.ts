// Placeholder Worker entry point. This exists only so `tsc` has an input to check, and so
// `wrangler deploy --dry-run` has an entrypoint that exports the Durable Object it declares —
// the real Hono app, routes and the LINE webhook arrive in T07, which replaces this file's
// fetch handler wholesale.
// See docs/plans/00-foundations/tasks/T01-monorepo-scaffold.md "Explicitly not required".

// Stub Durable Object. `wrangler deploy` hard-errors if a class named in wrangler.toml's
// `durable_objects.bindings` is not exported from `main` — this export exists to satisfy that,
// not to hold any state. The real PlanCoordinator (§6.5: every D1 write goes through it) is
// Phase 3. `new_sqlite_classes` in wrangler.toml is a config-side declaration; nothing here
// needs the `cloudflare:workers` `DurableObject` base class.
export class PlanCoordinator {
  fetch(): Response {
    return new Response('Not implemented', { status: 501 });
  }
}

interface Env {
  ASSETS: Fetcher;
}

export default {
  // Falls through to the static-asset binding rather than returning a bare 501. This is what
  // makes SPA fallback (`not_found_handling = "single-page-application"` in wrangler.toml)
  // observable: the asset router only applies that fallback to requests that arrive through the
  // ASSETS binding, so a deep link like /plan/2026-08-03 must reach this handler and be handed to
  // env.ASSETS.fetch() for `index.html` to come back instead of a 404.
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
