# Mocks

Mock servers for third parties, shared across every phase rather than duplicated per task — see
`.claude/harness/CONVENTIONS.md`. Each service gets its own subdirectory, e.g.
`tools/mocks/google-geocoding/`, `tools/mocks/line/`.

Empty as of T01. The first task to need a mock pays for its contents:

- **T06** — Miniflare fixtures.
- **T08** — mock JWKS at `tools/mocks/cf-access/`.

No validation reaches a real third party. Google Maps, LINE, and any external API are mocked here;
Cloudflare runs under Miniflare.
