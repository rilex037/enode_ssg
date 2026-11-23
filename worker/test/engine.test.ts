/**
 * Engine tests — plain Node, no test framework, no Cloudflare. Run:
 *
 *   npm run test:worker
 *
 * Exercises the full request flow against the in-memory adapters: MISS→HIT
 * caching, ETag/304 revalidation, 404 paths, version bumps, admin API.
 * These tests are the contract every new vendor adapter inherits for free.
 */

import assert from 'node:assert/strict'
import { SiteEngine } from '../src/core/engine.ts'
import { createRenderer } from '../src/core/render.ts'
import type { Assets } from '../src/core/types.ts'
import {
  MemoryPageCache,
  MemoryPageSource,
  MemoryVersionStore,
} from '../src/adapters/memory/index.ts'

const BASE = 'http://localhost'
const request = (path: string, init?: RequestInit) => new Request(`${BASE}${path}`, init)

function makeEngine(overrides: { assets?: Assets; adminToken?: string } = {}) {
  const cache = new MemoryPageCache()
  const versions = new MemoryVersionStore()
  const engine = new SiteEngine({
    source: new MemoryPageSource({
      '/docs/hello': { title: 'Hello', html: '<h1>Hello</h1>' },
    }),
    cache,
    versions,
    renderer: createRenderer({ css: 'body{margin:0}' }),
    versionTtlMs: 0,
    adminToken: overrides.adminToken,
    assets: overrides.assets,
  })
  return { engine, cache, versions }
}

// 1. First request: render, store, MISS
{
  const { engine, cache } = makeEngine()
  const res = await engine.handle(request('/docs/hello'))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-page-cache'), 'MISS')
  const body = await res.text()
  assert.match(body, /<h1>Hello<\/h1>/)
  assert.match(body, /<style>body\{margin:0\}<\/style>/)
  assert.equal(cache.putCount, 1)
  console.log('✓ first request renders and stores the page (MISS)')
}

// 2. Second request: served from cache, HIT, no new put
{
  const { engine, cache } = makeEngine()
  await engine.handle(request('/docs/hello'))
  const res = await engine.handle(request('/docs/hello'))
  assert.equal(res.headers.get('x-page-cache'), 'HIT')
  assert.equal(cache.putCount, 1)
  console.log('✓ second request is served from cache (HIT)')
}

// 3. ETag revalidation: 304 without touching cache or source
{
  const { engine, cache } = makeEngine()
  const first = await engine.handle(request('/docs/hello'))
  const etag = first.headers.get('etag')
  assert.ok(etag, 'etag header present')
  const res = await engine.handle(request('/docs/hello', { headers: { 'if-none-match': etag! } }))
  assert.equal(res.status, 304)
  assert.equal(cache.putCount, 1)
  assert.equal(await res.text(), '')
  console.log('✓ matching If-None-Match short-circuits to 304')
}

// 4. Version bump: new ETag forces MISS, old cache entries never re-served
{
  const { engine, versions, cache } = makeEngine()
  const first = await engine.handle(request('/docs/hello'))
  const etag = first.headers.get('etag')
  await versions.bump()
  const res = await engine.handle(request('/docs/hello'))
  assert.equal(res.headers.get('x-page-cache'), 'MISS')
  assert.notEqual(res.headers.get('etag'), etag)
  assert.equal(cache.putCount, 2)
  // A stale conditional still revalidates correctly after the bump.
  const stale = await engine.handle(request('/docs/hello', { headers: { 'if-none-match': etag! } }))
  assert.notEqual(stale.status, 304)
  console.log('✓ version bump invalidates the cache and changes the ETag')
}

// 5. Unknown path: 404 from the renderer when no assets adapter
{
  const { engine } = makeEngine()
  const res = await engine.handle(request('/nope'))
  assert.equal(res.status, 404)
  assert.match(await res.text(), /404/)
  console.log('✓ unknown path returns a rendered 404')
}

// 6. Unknown path: prerendered 404.html wins when an assets adapter exists
{
  const assetBody = '<!doctype html><title>static 404</title>'
  const { engine } = makeEngine({
    assets: { fetch: async (path) => (path === '/404.html'
      ? new Response(assetBody, { status: 200 })
      : null) },
  })
  const res = await engine.handle(request('/nope'))
  assert.equal(res.status, 404)
  assert.equal(await res.text(), assetBody)
  console.log('✓ unknown path prefers the prerendered 404.html asset')
}

// 7. Admin API: disabled without token, guarded with one
{
  const disabled = makeEngine()
  assert.equal((await disabled.engine.handle(request('/__site/bump', { method: 'POST' }))).status, 404)

  const { engine } = makeEngine({ adminToken: 'secret' })
  assert.equal(
    (await engine.handle(request('/__site/bump', { method: 'POST' }))).status,
    401,
  )
  const ok = await engine.handle(
    request('/__site/bump', { method: 'POST', headers: { authorization: 'Bearer secret' } }),
  )
  assert.equal(ok.status, 200)
  assert.equal(((await ok.json()) as { version: string }).version, '1')
  const version = await engine.handle(
    request('/__site/version', { headers: { authorization: 'Bearer secret' } }),
  )
  assert.equal(((await version.json()) as { version: string }).version, '1')
  console.log('✓ admin API is token-guarded (disabled / 401 / 200 bump)')
}

// 8. Non-GET methods on pages: 405; HEAD works
{
  const { engine } = makeEngine()
  assert.equal((await engine.handle(request('/docs/hello', { method: 'PUT' }))).status, 405)
  const head = await engine.handle(request('/docs/hello', { method: 'HEAD' }))
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  console.log('✓ 405 for PUT, empty body for HEAD')
}

console.log('\nAll engine tests passed.')
