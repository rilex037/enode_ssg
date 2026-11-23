# Dynamic pages: architecture

This framework keeps the "fully static in code" idea and adds one dynamic
layer for content pages. This document explains the design decisions and
answers the open questions from the original plan.

## The one-paragraph summary

The prerendered `dist/` bundle is uploaded **as Worker static assets**.
Any URL that matches an asset is served by the CDN and **never invokes the
worker** — static pages stay exactly as fast as a pure static host. When
no asset matches, the worker runs: it renders the page from the content
database, caches the HTML in object storage under a key that embeds the
site version, and serves it. Publishing new content is one version bump;
every cached page misses on its next request and regenerates.

```
request ─► asset matches? ── yes ─► served by CDN (worker never runs)
              │ no
              ▼
           worker: version lookup (memoized ≤10s)
              ├─ If-None-Match matches ─► 304 (nothing touched)
              ├─ cache GET v/<N><path>.html ── hit ─► serve (HIT)
              └─ miss ─► render from DB ─► store ─► serve (MISS)
```

## Why assets-first kills the routing mess

The original concern was that mixing fully static access with worker
routing gets messy. It doesn't have to, because the split is done by the
platform, not by your code: with Worker static assets, matching URLs are
served directly from the CDN and everything else falls through to the
worker. One deployment, one domain, no route table to keep in sync.

Practical consequences:

- `/`, `/404`, and every page you prerender in `src/router/index.ts` are
  plain files — zero worker invocations, zero latency added.
- `/docs/hello` (content page, exists only in D1) automatically lands in
  the worker. Nobody has to register it anywhere.
- `not_found_handling: "none"` in `wrangler.jsonc` — the worker produces
  404s itself, preferring your prerendered `404.html`.

If some paths must *always* hit the worker (e.g. an API under `/api/`),
set `assets.run_worker_first: ["/api/*"]` — that's the only knob.

## Why vue-router stays untouched

vue-router only knows the static routes, and that is fine: dynamic pages
are rendered by the worker as complete HTML documents — 0 KB of JS, no
hydration, no router involvement. They look identical to static pages
because the worker uses a CSS snapshot the postbuild step takes from the
prerendered bundle (`worker/generated/site-css.ts`, regenerated on every
`npm run build`).

If a content page later needs interactivity, add ONE catch-all route in
`src/router/index.ts` (e.g. `/:pathMatch(.*)*` already exists for 404) and
have that component fetch the content from an endpoint. The worker is the
natural place to expose `GET /__site/page?path=...` returning JSON from
the same `PageSource`. Static pages and the shell never change.

## Cache invalidation: versioned keys, not hash comparison

The original sketch — a site hash in a header, each page carrying its
hash, refresh on mismatch — is the right instinct. The simplest correct
implementation of it: **put the version in the cache key** and never
compare anything.

- The current version lives in D1 (`site_meta`), one row.
- A page is stored as `v/<version><path>.html` (e.g. `v/5/docs/hello.html`).
- Publishing = `POST /__site/bump` (Bearer token) → version 6.
- Every lookup now targets `v/6/...`, so all `v/5/...` objects are
  unreachable garbage. No stale page can ever be served; there is no
  comparison logic to get wrong.

Supporting details:

- The version lookup is memoized per worker instance (10s), so the D1
  read is amortized across requests.
- The ETag is `"<version>:<path>"` — deterministic, so a conditional
  request answers 304 **without touching cache or storage at all**. After
  a bump, ETags change automatically.
- Responses use `Cache-Control: public, max-age=0, s-maxage=60,
  must-revalidate`: browsers revalidate cheaply (304s), the CDN may cache
  for ≤60s, which bounds staleness after a bump.
- Old-version objects in R2 are never read again; delete them with an R2
  lifecycle rule or `PageCache.deletePrefix("v/")` from a cron job. R2
  storage is cents — not worth rushing.

## Storage layout (and what is Cloudflare-specific)

| Concern | Port (core) | Cloudflare adapter | Notes |
| --- | --- | --- | --- |
| Page content | `PageSource` | D1 (`pages` table) | Source of truth, any SQL DB ports 1:1 |
| Rendered cache | `PageCache` | R2 bucket | Regenerable — nuking it only costs one render per page |
| Site version | `VersionStore` | D1 (`site_meta`) | Any KV or SQL row works |
| Static bundle | `Assets` | Workers ASSETS binding | Used for the prerendered 404 |
| Request flow | `SiteEngine` | — | Vendor-neutral, pure Fetch types |

The core (`worker/src/core/`) imports nothing vendor-specific — it speaks
plain Fetch `Request`/`Response` and the four interfaces above. The
Cloudflare adapter is pure wiring in `worker/src/adapters/cloudflare/`,
and `worker/src/adapters/memory/` is a reference implementation. The
proof it's not vendor lock-in: `node worker/src/standalone.ts` serves the
exact same request flow from plain Node with zero Cloudflare types.

Porting to another vendor (e.g. S3 + Postgres + a Node/Deno/Bun edge
runtime) means writing one adapter file per interface and a new entry
point — the engine, renderer, tests and schema shape all carry over.
The engine unit tests (`npm run test:worker`) then serve as the contract
for the new adapters.

## Development workflow

```bash
npm run dev               # static site only (vite)
npm run dev:standalone    # dynamic layer on plain Node, no account needed
npm run dev:worker        # build site + wrangler dev (local D1/R2 sims)

npm run build             # prerender + inline CSS + CSS snapshot for worker
npm run test:worker       # engine unit tests (plain Node, no account)
npm run test:e2e          # 17 checks against a running worker

npm run db:schema         # apply worker/schema.sql to local D1
npm run db:seed           # sample content pages
npm run deploy            # build + wrangler deploy
```

Deploy checklist (first run):

1. `npx wrangler d1 create enode-content` — put the printed `database_id`
   into `worker/wrangler.jsonc`.
2. `npx wrangler r2 bucket create enode-page-cache`
3. Apply schema remotely: `npx wrangler d1 execute DB --remote --file=worker/schema.sql`
4. `npx wrangler secret put ADMIN_TOKEN` — enables `POST /__site/bump`.
5. `npm run deploy`

## Known limitations / future refinements

- **Head extras:** the worker template inlines CSS but not external
  `<link>`s (web fonts etc.). If the static shell grows those, mirror
  them in `createRenderer` options or extend postbuild to snapshot the
  whole `<head>`.
- **Per-page invalidation:** a bump refreshes the whole site. If you ever
  need single-page refresh, add a page-level version column and include
  it in the key — the engine's key builder is the only place to touch.
- **R2 growth:** without a lifecycle rule, old versions accumulate.
  Set a 30-day lifecycle on the bucket and forget about it.
- **Cache API:** Cloudflare's per-colo Cache API could sit in front of R2
  for even hotter reads; it's evictable and per-datacenter, so R2 stays
  the source of truth for page HTML.
