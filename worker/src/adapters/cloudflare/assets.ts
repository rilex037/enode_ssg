/**
 * Static-assets adapter: serves files from the prerendered bundle via the
 * Workers ASSETS binding (the same files the CDN serves before the worker
 * is ever invoked — this is the fallback path for worker-rendered pages).
 */

import type { Fetcher } from '@cloudflare/workers-types'
import type { Assets } from '../../core/types.ts'

export class WorkerAssets implements Assets {
  private fetcher: Fetcher

  constructor(fetcher: Fetcher) {
    this.fetcher = fetcher
  }

  async fetch(path: string): Promise<Response | null> {
    // The binding needs absolute URLs; the host is ignored for routing.
    // It is typed with Workers-flavored fetch types while the engine speaks
    // the runtime-agnostic Fetch types — same shapes at runtime, so cast
    // once at this single boundary.
    const response = (await this.fetcher.fetch(
      new URL(path, 'https://assets.local').toString(),
    )) as unknown as Response
    return response.status === 404 ? null : response
  }
}
