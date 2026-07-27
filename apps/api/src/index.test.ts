// Guards T04's STUB in ./index.ts — the PlanCoordinator Durable Object returns 501, and the
// default export's fetch handler falls through to the ASSETS binding rather than answering
// itself. This is a behavioural test: it imports the module and runs it, rather than pattern-
// matching the source text. It replaces three regex assertions (plus a comment stripper, a brace
// matcher and an `if (false)` heuristic) that lived in tools/guards/wrangler-config.test.ts and
// produced three rounds of near-misses — see
// docs/plans/00-foundations/work/T04-wrangler-config/validation-03.md and plan.md's "Revision 2".
//
// T07 REWRITES this file, it does not delete it (see
// docs/plans/00-foundations/tasks/T07-healthz-hono-skeleton.md, "Found at T04"). The
// PlanCoordinator assertion below stays true through T07 — the real Durable Object is Phase 3 —
// and the delegation assertion becomes a claim about the Hono app's catch-all route instead of
// the object-literal `fetch` member exercised here: `export default app` is itself an object with
// a `fetch` method, so `worker.fetch(request, env)` keeps working unmodified against a Hono app.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import worker, { PlanCoordinator } from './index';

// `new URL('./index.ts', import.meta.url)` would construct an instance of the AMBIENT `URL`
// declared by @cloudflare/workers-types (apps/api/tsconfig.json's `types` array), not Node's —
// the two are incompatible, and `fileURLToPath` wants Node's. Passing `import.meta.url` (a plain
// string) straight to `fileURLToPath` sidesteps that entirely; joining with `path` from there
// needs no URL type at all.
const indexSourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');

// Fetcher, Request and Response are global ambient types from @cloudflare/workers-types (see
// apps/api/tsconfig.json's `types` array) — that package has no named exports to import, only
// global declarations, which is why index.ts itself references Fetcher the same way.

describe('the PlanCoordinator stub (T04; the real Durable Object is Phase 3)', () => {
  it('fetch() returns 501', () => {
    const response = new PlanCoordinator().fetch();
    expect(response.status).toBe(501);
  });

  // B22 — the runtime ALWAYS invokes a Durable Object's fetch with a real Request; the test
  // above alone would still pass a stub shaped `fetch(request?: Request) { return request ===
  // undefined ? 501 : 200; }`, which returns 200 to every actual invocation. index.ts is frozen
  // at 1660df21… and declares `fetch(): Response` with no parameter at all, so this call needs a
  // narrow cast — the point of the cast is precisely to prove the stub ignores whatever argument
  // it is given, which the declared (parameterless) signature cannot express on its own.
  it('fetch() still returns 501 when called the way a Durable Object namespace actually calls it, with a real Request', () => {
    const coordinator = new PlanCoordinator();
    const request = new Request('https://wherego.storium.work/plan/2026-08-03');
    const fetchIgnoringItsArgument = coordinator.fetch as unknown as (request: Request) => Response;
    const response = fetchIgnoringItsArgument(request);
    expect(response.status).toBe(501);
  });

  // B18 — R13 requires three things: the class returns 501, the handler delegates, and "the
  // class body is a 501 WITH A COMMENT NAMING PHASE 3 AS ITS OWNER." The first two are proven
  // behaviourally above; the third is a claim about what CHARACTERS are in the file, which is
  // exactly when a raw-text read is the right instrument rather than a relapse into text-matching
  // (R6 already reads raw text for the Asia/Taipei cron comments, for the identical reason). This
  // clause had no test in any revision until now (validation-04, B18).
  it('the class body names Phase 3 as its owner, in a comment', () => {
    const indexSource = readFileSync(indexSourcePath, 'utf8');
    expect(indexSource).toMatch(/Phase 3/);
  });
});

describe('the default handler falls through to the ASSETS binding', () => {
  it('calls env.ASSETS.fetch with the incoming request, and returns exactly what it returned', async () => {
    const served = new Response('<html>shell</html>');
    const assetsFetch = vi.fn(() => Promise.resolve(served));
    const assets = { fetch: assetsFetch } as unknown as Fetcher;
    const request = new Request('https://wherego.storium.work/plan/2026-08-03');

    const result = await worker.fetch(request, { ASSETS: assets });

    // Two independent claims, both required by R13's "falls through to the assets binding":
    // that env.ASSETS.fetch is actually invoked with the request (not bypassed, not called with
    // something else), and that whatever it resolved to is exactly what comes back (not a second,
    // different response). Either half can fail on its own — a handler that returns
    // `new Response('x')` without calling ASSETS.fetch fails only the first; a handler that calls
    // ASSETS.fetch but returns a different Response fails only the second.
    expect(assetsFetch).toHaveBeenCalledWith(request);
    expect(result).toBe(served);
  });
});
