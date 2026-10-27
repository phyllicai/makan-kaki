#!/bin/sh
# Bundles server.js + inlined public/ into one gzipped, base64 file for Railway's APP_B64 variable.
# Railway start command: printf %s "$APP_B64" | base64 -d | gunzip > /tmp/app.mjs && exec node /tmp/app.mjs
set -e
cd "$(dirname "$0")/.."
node scripts/build-worker.js >/dev/null
sed -e "s#^import { readFile } from 'node:fs/promises';#import { INDEX, APP, CSS } from './src/static.gen.js';\nconst STATIC = { '/index.html': INDEX, '/app.js': APP, '/styles.css': CSS };#" \
    -e "s#const data = await readFile(file);#const data = STATIC[p.replace(/\\\\\\\\/g, '/')]; if (data == null) return send(res, 404, { error: 'not found' });#" \
    server.js > .railway-server.mjs
npx -y esbuild .railway-server.mjs --bundle --platform=node --format=esm --outfile=dist/railway-app.mjs --log-level=warning
rm .railway-server.mjs
gzip -9 -c dist/railway-app.mjs | base64 -w0 > dist/railway-app.b64
echo "dist/railway-app.b64 ($(wc -c < dist/railway-app.b64) bytes)"
