/**
 * In-memory reference adapters. Not for production — they exist to:
 *
 *  - prove the core runs anywhere (see worker/src/standalone.ts, a plain
 *    Node server using only these adapters);
 *  - serve as the template when porting to a new vendor;
 *  - back the engine tests (worker/test/engine.test.ts).
 */

import type { PageCache, PageSource, VersionStore } from '../../core/types.ts'

export class MemoryPageSource implements PageSource {
  private pages: Map<string, { title: string; html: string; description?: string }>

  constructor(pages: Record<string, { title: string; html: string; description?: string }>) {
    this.pages = new Map(Object.entries(pages))
  }

  async getPage(path: string) {
    const page = this.pages.get(path)
    return page ? { path, ...page } : null
  }
}

export class MemoryPageCache implements PageCache {
  private entries = new Map<string, string>()
  private puts = 0

  /** How many times a page was written — lets tests assert MISS→HIT flow. */
  get putCount(): number {
    return this.puts
  }

  async get(key: string) {
    return this.entries.get(key) ?? null
  }

  async put(key: string, value: string) {
    this.puts++
    this.entries.set(key, value)
  }

  async deletePrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
  }
}

export class MemoryVersionStore implements VersionStore {
  private version: string

  constructor(initial = '0') {
    this.version = initial
  }

  async get() {
    return this.version
  }

  async bump() {
    this.version = String(Number(this.version) + 1)
    return this.version
  }
}
