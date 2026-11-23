/**
 * D1 (Cloudflare's SQLite) adapters: page content source + site version.
 * Schema: worker/schema.sql
 */

import type { D1Database } from '@cloudflare/workers-types'
import type { PageSource, VersionStore } from '../../core/types.ts'

interface PageRow {
  path: string
  title: string
  description: string | null
  html: string
}

export class D1PageSource implements PageSource {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  async getPage(path: string) {
    const row = await this.db
      .prepare('SELECT path, title, description, html FROM pages WHERE path = ?1')
      .bind(path)
      .first<PageRow>()
    if (!row) return null
    return {
      path: row.path,
      title: row.title,
      description: row.description ?? undefined,
      html: row.html,
    }
  }
}

export class D1VersionStore implements VersionStore {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  async get(): Promise<string> {
    const row = await this.db
      .prepare("SELECT value FROM site_meta WHERE key = 'version'")
      .first<{ value: string }>()
    return row?.value ?? '0'
  }

  async bump(): Promise<string> {
    const row = await this.db
      .prepare(
        `INSERT INTO site_meta (key, value) VALUES ('version', '1')
         ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(site_meta.value AS INTEGER) + 1 AS TEXT)
         RETURNING value`,
      )
      .first<{ value: string }>()
    return row!.value
  }
}
