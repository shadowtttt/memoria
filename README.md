# Memoria

The private installation at `/memoria/` uses the existing site's login. The
browser sends JSON to the same-origin `/memoria/api`; Caddy validates the site
session and supplies `MEMORIA_WEB_TOKEN` only on the server. The terminal panel
uses the existing `/terminal/feed` session-protected route.

The GitHub Pages copy is a relocation page. It asks for the owner's private site
address rather than publishing that address or a credential in this repository.
Existing browser conversation caches are retained, but private pages are no
longer served from the service worker cache. Server data is not migrated.

## Deployment

Deploy only `index.html`, `style.css`, `sw.js`, and `js/*.js` into the private
site's `memoria/` directory. Do not deploy tests, development dependencies, or
the historical `recall-test.html` diagnostic page. That diagnostic page still
uses the retired PIN interface and is not part of this release.

Import `deploy/memoria.caddy` globally in Caddy, and import `memoria_session`
only in the Access-protected host. Keep the existing site's static-file login
gate and terminal route. Supply the current API web token using a server-only
0600 env file; never embed it in static files. Token rotation must update this
gateway copy and recreate Caddy as well as update the backend.

The proxy admits only same-origin JSON POSTs with `X-Memoria-Client: session`,
checks the site cookie, strips credentials supplied by clients, and forwards
the web token. The existing backend still enforces separate audit and channel
credentials. HTML messages are displayed as text; fenced HTML previews retain
their sandbox and cannot use the parent's login.

## Checks

`npm ci && npm test` checks session handling and the pinned Markdown renderer.
`python3 tests/gateway_test.py` runs on Linux with Docker and a running
`caddy-proxy` image, using synthetic local upstreams and no production tokens.
