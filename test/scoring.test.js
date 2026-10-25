import test from 'node:test';
import assert from 'node:assert/strict';
import { groupConstraints, checkVenue, groupScore, addMinutes } from '../src/agent/scoring.js';
import { isOpenAt, normalizePlace } from '../src/qloo/normalize.js';
import { keywordsToCuisines } from '../src/data/vocab.js';

test('halal implies pork-free', () => {
  assert.deepEqual(groupConstraints([{ dietary: ['halal'] }, { dietary: ['vegetarian'] }]).sort(), ['halal', 'pork_free', 'vegetarian']);
});

test('least-misery: a venue one player hates ranks below a balanced one', () => {
  const balanced = groupScore({ memberAffinities: { a: 0.6, b: 0.6, c: 0.6 }, distanceM: 1000, radiusM: 3000 });
  const lopsided = groupScore({ memberAffinities: { a: 0.95, b: 0.9, c: 0.05 }, distanceM: 1000, radiusM: 3000 });
  assert.ok(balanced.score > lopsided.score);
});

test('unknown dietary data is "unverified" (live) not silently passed or failed', () => {
  const r = checkVenue({ dietary: { halal: null }, hours: null }, { needs: ['halal', 'pork_free'], day: 'Monday', arriveAt: '23:00', mode: 'live' });
  assert.equal(r.pass, true);
  assert.deepEqual(r.unverified, ['halal', 'late-night hours']);
  const bad = checkVenue({ dietary: { halal: false } }, { needs: ['halal'], day: 'Monday', arriveAt: '23:00', mode: 'mock' });
  assert.equal(bad.pass, false);
});

test('hours handle past-midnight closing', () => {
  const h = { Friday: [{ opens: 'T17:00', closes: 'T02:00' }] };
  assert.equal(isOpenAt(h, 'Friday', '23:30'), true);
  assert.equal(isOpenAt(h, 'Friday', '01:30'), true);
  assert.equal(isOpenAt(h, 'Friday', '12:00'), false);
  assert.equal(isOpenAt(null, 'Friday', '12:00'), null);
  assert.equal(addMinutes('23:50', 20), '00:10');
});

test('normalizes a Qloo-shaped place entity', () => {
  const p = normalizePlace({ entity_id: 'X', name: 'Kedai', location: { lat: 3.1, lon: 101.6 }, properties: { address: 'PJ', price_level: 2, business_rating: 4.2, keywords: [{ name: 'Halal food' }] }, tags: [{ name: 'Malaysian Restaurant' }], query: { affinity: 0.8 } }, { lat: 3.1, lon: 101.61 });
  assert.equal(p.id, 'X'); assert.equal(p.priceLevel, 2); assert.equal(p.affinity, 0.8); assert.equal(p.dietary.halal, true);
  assert.ok(p.distanceM > 1000 && p.distanceM < 1200);
});

test('craving parser uses word boundaries (malay != mala)', () => {
  assert.deepEqual(keywordsToCuisines('malay'), ['malay']);
  assert.ok(keywordsToCuisines('char kway teow').includes('chinese'));
});
