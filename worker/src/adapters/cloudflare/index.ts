/**
 * Cloudflare Workers entry point — pure wiring, no logic.
 *
 * Routing model (wrangler.jsonc): the prerendered dist/ bundle is uploaded
 * as Worker assets and served by the CDN WITHOUT invoking this worker.
 * The fetch handler below only runs when no asset matches the URL, i.e.
 * exactly for dynamic content pages and the admin API. Static pages stay
 * as fast as a pure static host; the worker is never in their path.
 */

import type { D1Database, Fetcher, R2Bucket } from '@cloudflare/workers-types'
import { SiteEngine } from '../../core/engine.ts'
import { createRenderer } from '../../core/render.ts'
import { SITE_CSS } from '../../../generated/site-css.ts'
import { WorkerAssets } from './assets.ts'
import { D1PageSource, D1VersionStore } from './d1.ts'
import { R2PageCache } from './r2.ts'

export interface Env {
  /** D1 database with the pages + site_meta tables (worker/schema.sql). */
  DB: D1Database
  /** R2 bucket used as the rendered-page cache. */
  CACHE: R2Bucket
  /** Static assets binding (the prerendered dist/ bundle). */
  ASSETS: Fetcher
  /** Shared secret for POST /__site/bump; admin API is disabled when unset. */
  ADMIN_TOKEN?: string
  /** Optional site name for the default renderer's header link. */
  SITE_NAME?: string
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const engine = new SiteEngine({
      source: new D1PageSource(env.DB),
      cache: new R2PageCache(env.CACHE),
      versions: new D1VersionStore(env.DB),
      assets: new WorkerAssets(env.ASSETS),
      renderer: createRenderer({ css: SITE_CSS, siteName: env.SITE_NAME }),
      adminToken: env.ADMIN_TOKEN,
    })
    return engine.handle(request)
  },
}
