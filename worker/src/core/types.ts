/**
 * Vendor-neutral ports of the dynamic page layer.
 *
 * The core engine (see engine.ts) only talks to these interfaces. Concrete
 * adapters live in worker/src/adapters/ — one folder per vendor (Cloudflare
 * today, anything with storage + a KV-ish store tomorrow). Swapping vendors
 * means writing one adapter file and wiring it in a server entry point; the
 * core never changes.
 */

/** A single content page, as stored in the source of truth (e.g. D1). */
export interface PageContent {
  /** Canonical URL path, starts with "/", no trailing slash (e.g. "/docs/hello"). */
  path: string
  title: string
  /** Body HTML. Trusted output of the content pipeline — never user input. */
  html: string
  /** Optional meta description, rendered into <meta name="description">. */
  description?: string
}

/** Source of truth for page content (the "database"). */
export interface PageSource {
  getPage(path: string): Promise<PageContent | null>
}

/**
 * Durable cache for rendered pages (the "object storage"). Regenerable at
 * any time: deleting its contents only costs one regeneration per page.
 */
export interface PageCache {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  /** Best-effort bulk removal by key prefix; optional (for cleanup jobs). */
  deletePrefix?(prefix: string): Promise<void>
}

/**
 * Site-wide content version. Bumping it invalidates every cached page at
 * once: the version is part of the cache key, so old entries simply stop
 * being looked up.
 */
export interface VersionStore {
  get(): Promise<string>
  bump(): Promise<string>
}

/** Access to the prerendered static bundle (used for the 404 page shell). */
export interface Assets {
  /** Serves a file from the static bundle by URL path, or null when absent. */
  fetch(path: string): Promise<Response | null>
}

export interface RenderContext {
  version: string
}

/** Turns a PageContent into a complete HTML document. */
export interface Renderer {
  page(page: PageContent, ctx: RenderContext): string
  notFound(): string
}
