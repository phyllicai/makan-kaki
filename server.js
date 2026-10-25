// Zero-dependency Node server: static UI + JSON API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeQloo } from './src/qloo/index.js';
import { makeLLM } from './src/agent/llm.js';
import { runAgent } from './src/agent/agent.js';
import { COURTS, SAMPLE_GROUP } from './src/data/courts.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = +process.env.PORT || 8787;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const qloo = makeQloo();
const llm = makeLLM();
// Simple per-IP rate limit so a public demo can't burn the Qloo quota.
const hits = new Map();
function limited(ip) { const now = Date.now(); const arr = (hits.get(ip) || []).filter(t => now - t < 60000); arr.push(now); hits.set(ip, arr); return arr.length > 20; }

function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, qloo: qloo.mode, llm: llm ? llm.model : null });
    if (url.pathname === '/api/config') return send(res, 200, { courts: COURTS, sample: SAMPLE_GROUP, mode: qloo.mode, llm: llm ? llm.model : null });
    if (url.pathname === '/api/plan' && req.method === 'POST') {
      if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many requests, try again in a minute.' });
      let body = ''; for await (const ch of req) { body += ch; if (body.length > 50000) return send(res, 413, { error: 'Too large' }); }
      const input = JSON.parse(body || '{}');
      const out = await runAgent(input, { qloo, llm });
      return send(res, 200, out);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\') p = '/index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, { error: 'not found' });
    console.error(e);
    send(res, e.status === 401 ? 502 : 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Makan Kaki on http://localhost:${PORT}  (Qloo: ${qloo.mode}${llm ? `, LLM: ${llm.model}` : ', LLM: off'})`));
