/**
 * Vendor-neutral request engine: the whole dynamic-page flow.
 *
 *   request ─► version lookup (memoized ~10s)
 *          ─► If-None-Match matches? ─► 304 (no storage touched)
 *          ─► cache GET pages/v{N}/{path}.html
 *              ├─ hit  ─► serve (x-page-cache: HIT)
 *              └─ miss ─► render from PageSource
 *                          ├─ found    ─► store in cache, serve (MISS)
 *                          └─ not found ─► 404 (static 404.html asset or built-in)
 *
 * Cache invalidation: the version is part of the R2 key, so "refresh the
 * site" == "bump the version". A page cached under v4 is never looked up
 * again once the version is 5 — no per-page hash comparison anywhere.
 */

import type {
  Assets,
  PageCache,
  PageSource,
  Renderer,
  VersionStore,
} from './types.ts'

export interface SiteEngineOptions {
  source: PageSource
  cache: PageCache
  versions: VersionStore
  renderer: Renderer
  /** Optional access to the prerendered bundle, used for the 404 page. */
  assets?: Assets
  /**
   * Cache-Control for rendered pages. Default revalidates every browser
   * view (cheap 304s, ETag carries the version) and lets the CDN cache
   * for a short window — stale window after a version bump is at most
   * s-maxage seconds.
   */
  cacheControl?: string
  /** How long to memoize the version lookup per instance. Default 10s. */
  versionTtlMs?: number
  /** Admin API path prefix. POST {adminPath}/bump refreshes the site. */
  adminPath?: string
  /**
   * Shared secret for the admin API ("Authorization: Bearer <token>").
   * Leave undefined to disable admin endpoints entirely.
   */
  adminToken?: string
}

export function pageKey(version: string, path: string): string {
  const normalized = path === '/' ? '/index' : path.replace(/\/+$/, '')
  return `v/${version}${normalized}.html`
}

const DEFAULT_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, must-revalidate'

export class SiteEngine {
  private opts: Required<Pick<SiteEngineOptions, 'cacheControl' | 'versionTtlMs' | 'adminPath'>> &
    SiteEngineOptions
  private memoVersion: { value: string; expiresAt: number } | null = null

  constructor(options: SiteEngineOptions) {
    this.opts = {
      ...options,
      cacheControl: options.cacheControl ?? DEFAULT_CACHE_CONTROL,
      versionTtlMs: options.versionTtlMs ?? 10_000,
      adminPath: options.adminPath ?? '/__site',
    }
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith(this.opts.adminPath + '/')) {
      return this.handleAdmin(request, url)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }

    return this.servePage(request, url.pathname)
  }

  private async servePage(request: Request, path: string): Promise<Response> {
    const version = await this.getVersion()
    // Deterministic ETag: changes whenever the version bumps, so a matching
    // If-None-Match answers 304 without touching cache or storage at all.
    const etag = `"${version}:${path}"`

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { etag, 'cache-control': this.opts.cacheControl },
      })
    }

    const key = pageKey(version, path)
    const headers = new Headers({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': this.opts.cacheControl,
      etag,
    })

    const cached = await this.opts.cache.get(key)
    if (cached !== null) {
      headers.set('x-page-cache', 'HIT')
      return new Response(request.method === 'HEAD' ? null : cached, { headers })
    }

    const page = await this.opts.source.getPage(path)
    if (!page) return this.serveNotFound(request, headers)

    const html = this.opts.renderer.page(page, { version })
    headers.set('x-page-cache', 'MISS')
    await this.opts.cache.put(key, html)
    return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers })
  }

  private async serveNotFound(request: Request, headers: Headers): Promise<Response> {
    // Prefer the prerendered 404.html so dynamic misses look exactly like
    // static misses. Fall back to the renderer's built-in 404.
    if (this.opts.assets) {
      const asset = await this.opts.assets.fetch('/404.html')
      if (asset) {
        const body = await asset.text()
        return new Response(request.method === 'HEAD' ? null : body, {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
    }
    return new Response(request.method === 'HEAD' ? null : this.opts.renderer.notFound(), {
      status: 404,
      headers,
    })
  }

  private async handleAdmin(request: Request, url: URL): Promise<Response> {
    if (!this.opts.adminToken) {
      return new Response('Not found', { status: 404 })
    }
    const auth = request.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${this.opts.adminToken}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const action = url.pathname.slice(this.opts.adminPath.length)
    if (request.method === 'POST' && action === '/bump') {
      const version = await this.opts.versions.bump()
      this.memoVersion = null
      return Response.json({ ok: true, version })
    }
    if (request.method === 'GET' && action === '/version') {
      return Response.json({ version: await this.getVersion() })
    }
    return new Response('Not found', { status: 404 })
  }

  private async getVersion(): Promise<string> {
    const now = Date.now()
    if (this.memoVersion && this.memoVersion.expiresAt > now) {
      return this.memoVersion.value
    }
    const value = await this.opts.versions.get()
    this.memoVersion = { value, expiresAt: now + this.opts.versionTtlMs }
    return value
  }
}
