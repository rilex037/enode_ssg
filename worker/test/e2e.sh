#!/usr/bin/env bash
#
# End-to-end checks against a running worker. Defaults match local dev:
#
#   npx wrangler dev --port 8799 --ip 127.0.0.1 --var ADMIN_TOKEN:test-token
#   bash worker/test/e2e.sh
#
# Or point it at a deployed site: bash worker/test/e2e.sh https://example.com "$TOKEN"
set -u
BASE="${1:-http://127.0.0.1:8799}"
TOKEN="${2:-test-token}"
TMP="$(mktemp -d)"
passed=0
failed=0

assert() { # assert <name> <cmd...> — passes when the command exits 0
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "✓ $name"; passed=$((passed + 1))
  else
    echo "✗ $name"; failed=$((failed + 1))
  fi
}

req() { # req <method> <path> [curl args...] -> status in $code, headers in $TMP/h, body in $TMP/b
  code="$(curl -s -X "$1" -D "$TMP/h" -o "$TMP/b" -w '%{http_code}' "${@:3}" "$BASE$2")"
}

is() { # helper usable inside assert: assert "..." is "$code" = 200
  test "$1" "$2" "$3"
}

# 1. Static pages are served from assets, worker never involved
req GET /
assert "homepage 200" is "$code" = 200
assert "homepage served as pure asset (no x-page-cache header)" test -z "$(grep -i x-page-cache "$TMP/h")"
assert "homepage body is the prerendered file" grep -q "Welcome to your SSG site" "$TMP/b"

# 2. Dynamic page: first hit renders, stores in R2
req GET /docs/hello
assert "dynamic page 200" is "$code" = 200
assert "first hit is a MISS (rendered on demand)" grep -qi "^x-page-cache: MISS" "$TMP/h"
assert "content comes from D1" grep -q "Hello from D1" "$TMP/b"
assert "page ships with inlined CSS (same look as static pages)" grep -q "<style>" "$TMP/b"
assert "ETag present (version-embedded)" grep -qi "^etag:" "$TMP/h"
ETAG="$(grep -i '^etag:' "$TMP/h" | tr -d '\r' | cut -d' ' -f2)"

# 3. Second hit served from the R2 cache
req GET /docs/hello
assert "second hit is a HIT (served from R2)" grep -qi "^x-page-cache: HIT" "$TMP/h"

# 4. Conditional request short-circuits to 304
req GET /docs/hello -H "If-None-Match: $ETAG"
assert "matching If-None-Match returns 304" is "$code" = 304

# 5. Unknown dynamic path falls back to the prerendered 404.html asset
req GET /this/does/not/exist
assert "unknown path 404" is "$code" = 404
assert "404 body served (prerendered page)" grep -q "404" "$TMP/b"

# 6. Admin API is token-guarded
req POST /__site/bump
assert "admin without token is 401" is "$code" = 401
req POST /__site/bump -H "Authorization: Bearer wrong"
assert "admin with wrong token is 401" is "$code" = 401
req POST /__site/bump -H "Authorization: Bearer $TOKEN"
assert "admin bump with token is 200" is "$code" = 200
assert "bump returns the new version" grep -q '"version"' "$TMP/b"

# 7. After a version bump the page regenerates (version memo TTL is 10s)
echo "  … waiting out the 10s version memo"
sleep 12
req GET /docs/hello
assert "bumped version forces regeneration (MISS)" grep -qi "^x-page-cache: MISS" "$TMP/h"

echo
if [ "$failed" -gt 0 ]; then
  echo "$failed check(s) FAILED, $passed passed."
  exit 1
fi
echo "All $passed e2e checks passed."
