/**
 * Post build step.
 *
 * Inlines the compiled stylesheet into every prerendered HTML file, which
 * removes the render-blocking CSS request and guarantees the first paint is
 * already styled. Standalone CSS files are deleted afterwards.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '..', 'dist')

const htmlFiles = readdirSync(dist).filter((f) => f.endsWith('.html'))

let failed = false

// 1. Inline the stylesheet into each HTML file
const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g

for (const file of htmlFiles) {
  const path = join(dist, file)
  let html = readFileSync(path, 'utf-8')
  let css = ''

  html = html.replace(STYLESHEET_LINK, (tag) => {
    const href = tag.match(/href="([^"]+)"/)?.[1]
    // Keep external stylesheets (e.g. Google Fonts) untouched.
    if (!href || !href.startsWith('/')) return tag

    const cssPath = join(dist, href)
    if (!existsSync(cssPath)) return tag

    css += readFileSync(cssPath, 'utf-8')
    return ''
  })

  if (css) {
    html = html.replace('</head>', `<style>${css}</style></head>`)
    writeFileSync(path, html, 'utf-8')
  }
}

// 2. Delete the now-unused standalone CSS files
const assetsDir = join(dist, 'assets')
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (name.endsWith('.css')) {
      unlinkSync(join(assetsDir, name))
    }
  }
}

// 3. Make sure no JS references a deleted stylesheet
if (existsSync(assetsDir)) {
  const cssFiles = readdirSync(assetsDir).filter((n) => n.endsWith('.css'))
  for (const name of readdirSync(assetsDir)) {
    if (!name.endsWith('.js')) continue
    const js = readFileSync(join(assetsDir, name), 'utf-8')
    const orphans = cssFiles.filter((css) => js.includes(css))
    if (orphans.length) {
      console.error(`✗ ${name} still references deleted stylesheet(s): ${orphans.join(', ')}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('\nPost build checks failed.')
  process.exit(1)
}

console.log('\nPost build complete. CSS inlined into', htmlFiles.length, 'HTML file(s).')
