/**
 * Default page renderer: complete HTML documents with the site stylesheet
 * inlined, mirroring what scripts/postbuild.mjs does for static pages —
 * zero render-blocking requests, zero JS on content pages.
 *
 * The CSS comes from worker/generated/site-css.ts, a snapshot the postbuild
 * step rewrites on every build. The layout below is deliberately minimal;
 * it is the one place to customize the dynamic-page shell (header/footer,
 * analytics snippet, font <link>s, etc.).
 */

import type { PageContent, RenderContext, Renderer } from './types.ts'

export interface RendererOptions {
  css: string
  /** Used for the header link; falls back to "Home". */
  siteName?: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function document(title: string, body: string, css: string, description?: string): string {
  const meta = description
    ? `<meta name="description" content="${escapeHtml(description)}">`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="enode_ssg worker">
${meta}
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`
}

export function createRenderer(options: RendererOptions): Renderer {
  const { css, siteName } = options
  const home = escapeHtml(siteName ?? 'Home')

  return {
    page(page: PageContent, _ctx: RenderContext): string {
      return document(
        page.title,
        `<main class="page-container">${page.html}</main>`,
        css,
        page.description,
      )
    },

    notFound(): string {
      return document(
        '404 — Not Found',
        `<main class="page-container">
<h1>404 — Not Found</h1>
<p>The page you are looking for does not exist.</p>
<p><a href="/" class="btn">${home}</a></p>
</main>`,
        css,
      )
    },
  }
}
