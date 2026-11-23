/**
 * Standalone Node server on the same vendor-neutral core — the proof that
 * the dynamic layer has no Cloudflare dependency. Uses only the in-memory
 * adapters, so it needs no build step, no wrangler and no account:
 *
 *   node worker/src/standalone.ts            # http://localhost:8787
 *   PORT=3000 node worker/src/standalone.ts
 *
 * Point it at the same renderer by running `npm run build` first so the
 * CSS snapshot in worker/generated/ is fresh; it works without it too.
 */

import { createServer } from 'node:http'
import { SiteEngine } from './core/engine.ts'
import { createRenderer } from './core/render.ts'
import { SITE_CSS } from '../generated/site-css.ts'
import { MemoryPageCache, MemoryPageSource, MemoryVersionStore } from './adapters/memory/index.ts'

const port = Number(process.env.PORT ?? 8787)

const engine = new SiteEngine({
  source: new MemoryPageSource({
    '/docs/hello': {
      title: 'Hello from the standalone server',
      description: 'Rendered on demand by the vendor-neutral core.',
      html: `<h1>Hello from the standalone server</h1>
<p>This page was rendered on demand by <code>worker/src/standalone.ts</code> —
plain Node, no Cloudflare bindings involved. It is proof that the engine is
vendor-neutral: swapping Cloudflare for another host means writing one
adapter file.</p>`,
    },
  }),
  cache: new MemoryPageCache(),
  versions: new MemoryVersionStore(),
  renderer: createRenderer({ css: SITE_CSS, siteName: 'enode_ssg' }),
})

createServer((req, res) => {
  const host = req.headers.host ?? `localhost:${port}`
  const request = new Request(`http://${host}${req.url}`, { method: req.method })
  engine.handle(request).then((response) => {
    res.writeHead(response.status, Object.fromEntries(response.headers))
    response.text().then((body) => res.end(body))
  })
}).listen(port, () => {
  console.log(`standalone dynamic server on http://localhost:${port}`)
})
