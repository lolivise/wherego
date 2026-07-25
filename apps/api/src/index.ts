// Placeholder Worker entry point. This exists only so `tsc` has an input to check —
// the real Hono app, routes and the PlanCoordinator Durable Object arrive in T07.
// See docs/plans/00-foundations/tasks/T01-monorepo-scaffold.md "Explicitly not required".
export default {
  fetch(): Response {
    return new Response('Not implemented', { status: 501 });
  },
};
