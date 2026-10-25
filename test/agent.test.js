import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent/agent.js';
import { MockQloo } from '../src/qloo/mock.js';
import { QlooClient } from '../src/qloo/client.js';
import { SAMPLE_GROUP } from '../src/data/courts.js';

test('mock run: every pick satisfies hard constraints and is open on arrival', async () => {
  const r = await runAgent(SAMPLE_GROUP, { qloo: new MockQloo() });
  assert.equal(r.mode, 'mock');
  assert.ok(r.results.length >= 3);
  for (const v of r.results) {
    assert.equal(v.dietary.halal, true);
    assert.equal(v.dietary.vegetarian, true);
    assert.equal(v.check.pass, true);
    assert.equal(Object.keys(v.memberAffinities).length, 4);
  }
  assert.ok(r.trace.some(t => t.kind === 'tool'));
  const names = r.results.map(v => v.name);
  assert.equal(new Set(names).size, names.length, 'no duplicate venues');
});

test('agent reflects and widens radius when too few spots fit', async () => {
  const input = { ...SAMPLE_GROUP, radiusM: 800 };
  const r = await runAgent(input, { qloo: new MockQloo() });
  assert.ok(r.trace.some(t => t.kind === 'reflect'));
  assert.ok(r.radiusM > 800);
});

test('live client sends X-Api-Key to hackathon base URL with GET query params', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, results: { entities: [{ entity_id: 'E1', name: 'Test Kedai', location: { lat: 3.12, lon: 101.62 }, properties: {}, query: { affinity: 0.7 } }] } }) }; };
  const q = new QlooClient({ apiKey: 'k123', fetchImpl: fakeFetch });
  const res = await q.placeInsights({ lat: 3.1185, lon: 101.623, radiusM: 3000, tagIds: ['urn:tag:genre:place:restaurant:malaysian'], day: 'Thursday' });
  const u = new URL(calls[0].url);
  assert.equal(u.origin, 'https://hackathon.api.qloo.com');
  assert.equal(u.pathname, '/v2/insights');
  assert.equal(u.searchParams.get('filter.type'), 'urn:entity:place');
  assert.equal(u.searchParams.get('filter.location'), 'POINT(101.623 3.1185)');
  assert.equal(u.searchParams.get('filter.hours'), 'Thursday');
  assert.equal(calls[0].opts.headers['X-Api-Key'], 'k123');
  assert.equal(res[0].name, 'Test Kedai');
});

test('optional LLM pitch is used when available, and agent survives LLM failure', async () => {
  const llm = { model: 'fake', chat: async (sys) => sys.includes('Extract') ? '{"cravings":[],"dietary":[]}' : JSON.stringify({ lines: ['Mamak run lah!'] }) };
  const r = await runAgent(SAMPLE_GROUP, { qloo: new MockQloo(), llm });
  assert.equal(r.results[0].pitch, 'Mamak run lah!');
  const broken = { model: 'x', chat: async () => { throw new Error('down'); } };
  const r2 = await runAgent(SAMPLE_GROUP, { qloo: new MockQloo(), llm: broken });
  assert.ok(r2.results.length && r2.trace.some(t => t.kind === 'warn'));
});
