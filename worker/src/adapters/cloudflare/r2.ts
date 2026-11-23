/**
 * R2 (Cloudflare's S3-equivalent object storage) adapter: the durable page
 * cache. Purely regenerable — nuke the bucket and pages rebuild on demand.
 */

import type { R2Bucket } from '@cloudflare/workers-types'
import type { PageCache } from '../../core/types.ts'

export class R2PageCache implements PageCache {
  private bucket: R2Bucket

  constructor(bucket: R2Bucket) {
    this.bucket = bucket
  }

  async get(key: string): Promise<string | null> {
    const object = await this.bucket.get(key)
    return object ? object.text() : null
  }

  async put(key: string, value: string): Promise<void> {
    await this.bucket.put(key, value, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    })
  }

  async deletePrefix(prefix: string): Promise<void> {
    // R2 has no native delete-by-prefix; list + delete. Fine for cleanup
    // jobs (run via a cron trigger or manually), never on the request path.
    let cursor: string | undefined
    do {
      const listing = await this.bucket.list({ prefix, cursor })
      await Promise.all(
        listing.objects.map((object) => this.bucket.delete(object.key)),
      )
      cursor = listing.truncated ? listing.cursor : undefined
    } while (cursor)
  }
}
