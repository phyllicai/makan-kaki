import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDiet, HALAL_TAG_IDS } from '../src/diet/rules.js';
import { normalizePlace } from '../src/qloo/normalize.js';
import { checkVenue, groupConstraints, groupScore } from '../src/agent/scoring.js';
import { runAgent } from '../src/agent/agent.js';
import { QlooClient } from '../src/qloo/client.js';

const tag = (name, id) => ({ name, id });
const HALAL = tag('Halal', 'urn:tag:dietary_option:qloo:halal');

test('bak kut teh place is not halal / not pork-free, by name in English or Chinese', () => {
  for (const name of ['Hing Kee Bakuteh Main Branch', 'Restoran Bak Kut Teh Klang', '甲洞大街 兴记肉骨茶', 'Ah Seng Char Siu Rice', 'Siew Yoke King', 'Restoran Babi Panggang']) {
    const d = assessDiet({ name });
    assert.equal(d.dietary.halal, false, name);
    assert.equal(d.dietary.pork_free, false, name);
    assert.match(d.evidence.halal, /pork/);
  }
});

test('a pork menu tag beats a (noisy) Qloo "Halal" tag', () => {
  const p = normalizePlace({ entity_id: 'X', name: 'One Dish Hotpot', tags: [HALAL, tag('Pork bone soup', 'urn:tag:menu_highlight:qloo:pork_bone_soup'), tag('Beer', 'urn:tag:offerings:place:beer')] });
  assert.equal(p.dietary.halal, false);
  assert.match(p.dietEvidence.halal, /Pork bone soup/);
  const chk = checkVenue(p, { needs: ['halal', 'pork_free'], day: 'Monday', arriveAt: '22:00', mode: 'live' });
  assert.equal(chk.pass, false);
  assert.equal(chk.failed.length, 1, 'pork evidence listed once');
});

test('pork detected from tag id alone, lard, and CJK characters', () => {
  assert.equal(assessDiet({ name: 'Kedai A', tagIds: ['urn:tag:specialty_dish:place:pork_ribs'] }).dietary.pork_free, false);
  assert.equal(assessDiet({ name: 'Kedai B', keywords: ['fried with lard'] }).dietary.halal, false);
  assert.equal(assessDiet({ name: '猪脚饭' }).dietary.halal, false);
});

test('negations do not trigger the denylist', () => {
  for (const kw of ['Pork-free', 'pork free dim sum', 'No pork no lard', 'beef bacon', 'chicken ham', 'Salad bar', 'Sauce bar']) {
    const d = assessDiet({ name: 'Kedai C', keywords: [kw] });
    assert.notEqual(d.dietary.halal, false, kw);
    assert.notEqual(d.dietary.pork_free, false, kw);
  }
  assert.equal(assessDiet({ name: 'Pork-Free Dim Sum House' }).dietary.pork_free, true);
  assert.equal(assessDiet({ name: 'Cendol & Bingsu Bar' }).dietary.halal, null);
  assert.equal(assessDiet({ name: 'Hamid Nasi Kandar' }).dietary.halal, null, 'no false "ham" hit');
});

test('bars, pubs and beer venues are not halal; alcohol tags only flag a halal-tagged place', () => {
  assert.equal(assessDiet({ name: 'The Brew House Kepong' }).dietary.halal, false);
  assert.equal(assessDiet({ name: 'Jalan Alor Beer Garden' }).dietary.halal, false);
  assert.equal(assessDiet({ name: 'Kedai D', tagIds: ['urn:tag:category:place:bar'] }).dietary.halal, false);
  assert.equal(assessDiet({ name: 'Kedai E', tagIds: ['urn:tag:offerings:place:beer'] }).dietary.halal, false);
  const flagged = assessDiet({ name: 'Mamak F', tagNames: ['Halal'], tagIds: [HALAL.id, 'urn:tag:beverage_offering:qloo:cocktails'] });
  assert.equal(flagged.dietary.halal, true);
  assert.match(flagged.flags.halal, /cocktails/);
  const chk = checkVenue({ dietary: flagged.dietary, dietFlags: flagged.flags, hours: null }, { needs: ['halal', 'pork_free'], day: 'Monday', arriveAt: '22:00', mode: 'mock' });
  assert.equal(chk.pass, true); assert.equal(chk.status.halal, 'unverified');
  assert.equal(assessDiet({ name: 'X', tagIds: ['urn:tag:payments:place:debit_cards'] }).dietary.halal, null);
});

test('non-halal label is a hard fail; halal tags and muslim-friendly are positive', () => {
  assert.equal(assessDiet({ name: 'Kedai G', keywords: ['Non-halal'] }).dietary.halal, false);
  for (const id of HALAL_TAG_IDS) assert.equal(assessDiet({ name: 'K', tagIds: [id] }).dietary.halal, true, id);
  assert.equal(assessDiet({ name: 'K', tagNames: ['Muslim Friendly'] }).dietary.halal, true);
  assert.equal(assessDiet({ name: 'K', tagIds: [HALAL.id] }).dietary.pork_free, true);
});

test('no-beef and vegetarian rules', () => {
  assert.equal(assessDiet({ name: 'Wagyu Steakhouse' }).dietary.no_beef, false);
  assert.equal(assessDiet({ name: 'Kedai H', tagNames: ['Beef noodle soup'] }).dietary.no_beef, false);
  assert.equal(assessDiet({ name: '牛肉面' }).dietary.no_beef, false);
  assert.equal(assessDiet({ name: 'Kedai I', keywords: ['no beef'] }).dietary.no_beef, null);
  assert.equal(assessDiet({ name: 'Sri Annapoorna', keywords: ['pure vegetarian'] }).dietary.no_beef, true);
  assert.equal(assessDiet({ name: 'Kedai J', tagIds: ['urn:tag:offerings:place:vegetarian_options'] }).dietary.vegetarian, true);
  assert.equal(assessDiet({ name: 'Ah Seng Bak Kut Teh' }).dietary.vegetarian, false);
  assert.equal(assessDiet({ name: 'Kedai K' }).dietary.vegetarian, null);
  const chk = checkVenue({ dietary: { no_beef: false }, dietEvidence: { no_beef: 'beef on menu (Wagyu)' } }, { needs: ['no_beef'], day: 'Monday', arriveAt: '22:00', mode: 'live' });
  assert.equal(chk.pass, false); assert.match(chk.failed[0], /not no beef: beef on menu/);
  assert.deepEqual(groupConstraints([{ dietary: ['no_beef'] }]), ['no_beef']);
});

test('verified dietary fit outranks an equal-taste unverified one', () => {
  const base = { memberAffinities: { a: 0.7, b: 0.7 }, distanceM: 1000, radiusM: 3000 };
  assert.ok(groupScore({ ...base, verifiedCount: 1 }).score > groupScore({ ...base, unverifiedCount: 1 }).score);
});

// Fake Qloo hackathon API: a pork place ranks #1 on taste, a halal-tagged place only appears via the halal filter.
function fakeQloo() {
  const ent = (id, name, tags, aff) => ({ entity_id: id, name, location: { lat: 3.2133, lon: 101.637 }, tags, properties: { hours: { Thursday: [{ opens: 'T10:00', closes: 'T02:00' }] } }, query: { affinity: aff } });
  const ALL = [
    ent('P1', 'Hing Kee Bakuteh 兴记肉骨茶', [tag('Chinese', 'urn:tag:cuisine:qloo:chinese')], 0.95),
    ent('P2', 'One Dish Hotpot', [HALAL, tag('Pork bone soup', 'urn:tag:menu_highlight:qloo:pork_bone_soup')], 0.9),
    ent('P3', 'The Brew House Kepong', [tag('Bar', 'urn:tag:category:place:bar')], 0.88),
    ent('P4', 'Ah Go Go Fish Curry', [tag('Chinese', 'urn:tag:cuisine:qloo:chinese')], 0.86),
    ent('H1', "Restoran Shah's Corner", [HALAL, tag('Vegetarian Meals', 'urn:tag:offerings:place:vegetarian_options')], 0.7),
    ent('H2', 'Najath Corner', [HALAL], 0.65),
    ent('H3', 'Murni Discovery', [tag('Halal food', 'urn:tag:offerings:place:halal_food')], 0.6),
  ];
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url); calls.push(u);
    let rows = ALL;
    if (u.pathname === '/v2/tags') return { ok: true, status: 200, text: async () => JSON.stringify({ results: { tags: [{ id: 'urn:tag:cuisine:qloo:malay', name: 'Malay' }] } }) };
    if (u.pathname === '/search') return { ok: true, status: 200, text: async () => JSON.stringify({ results: [] }) };
    const ft = u.searchParams.get('filter.tags') || '';
    if (/halal/.test(ft)) rows = ALL.filter(e => e.tags.some(t => /halal/.test(t.id)));
    else rows = ALL.filter(e => e.id !== 'H2' && e.id !== 'H3');
    const only = u.searchParams.get('filter.results.entities'); if (only) rows = rows.filter(e => only.split(',').includes(e.entity_id));
    return { ok: true, status: 200, text: async () => JSON.stringify({ results: { entities: rows } }) };
  };
  const q = new QlooClient({ apiKey: 'k', fetchImpl }); q.minGapMs = 0;
  return { q, calls };
}

test('live-shaped run: halal group never gets pork, bar or unconfirmed spots ahead of halal-tagged ones', async () => {
  const { q, calls } = fakeQloo();
  const r = await runAgent({ courtId: 'kepong', day: 'Thursday', endTime: '22:00', members: [
    { name: 'Aina', cravings: 'nasi lemak', dietary: ['halal'] }, { name: 'Wei Jie', cravings: 'bak kut teh', dietary: [] }] }, { qloo: q });
  const names = r.results.map(v => v.name);
  assert.deepEqual(names.slice(0, 3).sort(), ["Murni Discovery", 'Najath Corner', "Restoran Shah's Corner"].sort());
  for (const n of ['Hing Kee Bakuteh 兴记肉骨茶', 'One Dish Hotpot', 'The Brew House Kepong']) assert.ok(!names.includes(n), n);
  assert.ok(!names.includes('Ah Go Go Fish Curry'), 'unconfirmed halal held back when 3 confirmed exist');
  assert.ok(r.heldBack.some(h => h.name === 'Ah Go Go Fish Curry'));
  assert.ok(r.rejected.some(x => x.name.startsWith('Hing Kee') && /pork/.test(x.reasons[0])));
  assert.ok(calls.some(u => /dietary_option:qloo:halal/.test(u.searchParams.get('filter.tags') || '')), 'asked Qloo for halal-tagged places');
  assert.ok(r.results.every(v => !('tagIds' in v)));
});

test('insights take never exceeds Qloo max of 50 when scoring many candidates', async () => {
  const takes = [];
  const fetchImpl = async (url) => { const u = new URL(url); if (u.searchParams.get('take')) takes.push(+u.searchParams.get('take'));
    const ents = Array.from({ length: 40 }, (_, i) => ({ entity_id: `${u.searchParams.get('filter.tags') ? 'H' : 'E'}${i}`, name: `Kedai ${i}`, location: { lat: 3.1, lon: 101.6 }, tags: [HALAL], query: { affinity: 0.5 } }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ results: { entities: ents, tags: [{ id: 'urn:tag:cuisine:qloo:malay', name: 'Malay' }] } }) }; };
  const q = new QlooClient({ apiKey: 'k', fetchImpl }); q.minGapMs = 0;
  await runAgent({ courtId: 'ss2', members: [{ name: 'A', cravings: 'malay', dietary: ['halal'] }] }, { qloo: q });
  assert.ok(takes.every(t => t >= 1 && t <= 50), JSON.stringify(takes));
});
