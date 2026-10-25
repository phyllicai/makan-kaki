// Inlines public/ into src/static.gen.js and bundles worker.js -> dist/worker.mjs (for Cloudflare Workers).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const f = p => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
writeFileSync(new URL('../src/static.gen.js', import.meta.url),
  `export const INDEX = ${JSON.stringify(f('index.html'))};\nexport const APP = ${JSON.stringify(f('app.js'))};\nexport const CSS = ${JSON.stringify(f('styles.css'))};\n`);
console.log('wrote src/static.gen.js');
