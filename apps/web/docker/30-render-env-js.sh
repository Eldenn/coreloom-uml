#!/bin/sh
# Runs from the nginx image's docker-entrypoint after 20-envsubst-on-templates.
# Rewrites the runtime config file the SPA reads before it boots (see
# apps/web/index.html and apps/web/src/lib/client.ts).
set -eu

: "${API_URL:=}"

if [ -z "$API_URL" ]; then
    echo "30-render-env-js: WARNING — API_URL is not set; the SPA will fall back to its build-time default." >&2
fi

cat > /usr/share/nginx/html/env.js <<EOF
window.__APP_CONFIG__ = { apiUrl: "${API_URL}" };
EOF

echo "30-render-env-js: wrote /usr/share/nginx/html/env.js (apiUrl=\"${API_URL}\")"
