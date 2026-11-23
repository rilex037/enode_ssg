-- Sample content for local development. Apply with: npm run db:seed
-- Safe to run repeatedly; delete rows you do not want.

INSERT OR IGNORE INTO pages (path, title, description, html) VALUES
(
  '/docs/hello',
  'Hello from D1',
  'A sample dynamic page rendered on demand.',
  '<h1>Hello from D1</h1>
<p>This page is not prerendered. The static bundle has no file for this URL,
so the worker rendered it from D1, cached it in R2 under the current site
version, and will serve the cached copy from now on.</p>
<p>Check the <code>x-page-cache</code> response header: <code>MISS</code> on
the first hit, <code>HIT</code> afterwards.</p>'
),
(
  '/docs/cache-invalidation',
  'Cache invalidation',
  'How a version bump refreshes every page.',
  '<h1>Cache invalidation</h1>
<p>Every rendered page is stored in R2 under a key that embeds the site
version: <code>v/&lt;version&gt;/&lt;path&gt;.html</code>. Publishing new
content is one call:</p>
<pre><code>curl -X POST https://example.com/__site/bump -H "Authorization: Bearer $ADMIN_TOKEN"</code></pre>
<p>That bumps the version in D1, so every page lookup misses and pages
regenerate on their next request. Nothing stale is ever served, and no
per-page hash bookkeeping is needed.</p>'
);
