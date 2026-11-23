import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * Makes `vite preview` behave like a real static host (Vercel, Netlify,
 * Cloudflare Pages): an unknown URL is answered with `404.html` and a real
 * 404 status code, instead of Vite's SPA fallback which would serve
 * `index.html` with a 200.
 */
function staticHostFallback(): Plugin {
  return {
    name: 'static-host-fallback',
    configurePreviewServer(server) {
      const outDir = join(server.config.root, server.config.build.outDir ?? 'dist')

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url || !req.headers.accept?.includes('text/html')) return next()
        if (/\.[a-z0-9]+$/i.test(url)) return next()

        const candidates = [
          join(outDir, url),
          join(outDir, url, 'index.html'),
          join(outDir, `${url}.html`),
        ]
        const exists = candidates.some(
          (path) => existsSync(path) && statSync(path).isFile(),
        )
        if (exists) return next()

        const notFound = join(outDir, '404.html')
        if (!existsSync(notFound)) return next()

        res.statusCode = 404
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(readFileSync(notFound))
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), staticHostFallback()],
  server: {
    host: true,
    port: 3000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    cssTarget: 'chrome87',
    cssMinify: 'lightningcss',
    assetsInlineLimit: 2048,
    cssCodeSplit: false,
  },
  ssgOptions: {
    dirStyle: 'flat',
    formatting: 'minify',
    script: 'async defer',
    rootContainerId: 'app',
    beastiesOptions: false,
  },
})
