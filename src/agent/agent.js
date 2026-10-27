// "Makan Kaki" agent: plan -> act (Qloo tools) -> observe -> reflect -> (retry) -> explain.
// The controller is deterministic so the demo is reproducible; an LLM (optional) only
// extracts preferences from free text and writes the final pitch from verified facts.
import { COURTS } from '../data/courts.js';
import { keywordsToCuisines } from '../data/vocab.js';
import { groupConstraints, checkVenue, groupScore, addMinutes, DIET_LABEL } from './scoring.js';
import { DIET_SIGNAL_TAGS } from '../diet/rules.js';

const MAX_ITER = 3;
const WANT_PASSING = 3;

function splitList(s) { return String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean); }
function pickPlaceTags(tags) {
  const pref = tags.filter(t => /place|restaurant|cuisine|dining|mock:tag/i.test(`${t.id} ${t.type || ''}`));
  return (pref.length ? pref : tags).slice(0, 2);
}

export async function runAgent(input, { qloo, llm = null, now = () => Date.now() } = {}) {
  const t0 = now();
  const trace = [];
  const log = (kind, title, detail = {}) => trace.push({ step: trace.length + 1, kind, title, detail, ms: now() - t0 });

  // ---------- 1. Understand the request ----------
  const court = input.court?.lat != null ? { id: 'custom', label: input.court.label || 'Custom location', lat: +input.court.lat, lon: +input.court.lon }
    : COURTS.find(c => c.id === input.courtId) || COURTS[0];
  const day = input.day || 'Thursday';
  const endTime = input.endTime || '22:30';
  const arriveAt = addMinutes(endTime, 20); // shower + drive
  let radiusM = Math.min(Math.max(+input.radiusM || 3000, 500), 15000);
  let budgetMax = input.budgetMax ? +input.budgetMax : null;
  const members = (input.members || []).filter(m => m && m.name).slice(0, 12).map(m => ({
    name: String(m.name).slice(0, 40),
    cravings: splitList(m.cravings).slice(0, 8),
    likedPlaces: splitList(m.likedPlaces).slice(0, 5),
    dietary: (m.dietary || []).filter(d => DIET_LABEL[d]),
    notes: String(m.notes || '').slice(0, 300),
  }));
  if (!members.length) throw new Error('Add at least one player.');
  log('plan', `Plan for ${members.length} players near ${court.label}`, { arriveAt: `${day} ${arriveAt}`, radiusM, budgetMax, steps: ['resolve tastes → Qloo tags/entities', 'group insights near court', 'score each player per venue', 'check hard constraints', 'reflect & widen if needed', 'explain'] });

  // Optional: LLM turns free-text notes ("no seafood, craving something soupy") into extra cravings/dietary flags.
  if (llm) {
    for (const m of members.filter(x => x.notes)) {
      try {
        const out = JSON.parse(await llm.chat('Extract food preferences. Reply JSON {"cravings":[short food words],"dietary":[subset of "halal","vegetarian","pork_free"]}. Never invent.', m.notes, { json: true, maxTokens: 150 }));
        m.cravings.push(...(out.cravings || []).slice(0, 4));
        for (const d of out.dietary || []) if (DIET_LABEL[d] && !m.dietary.includes(d)) m.dietary.push(d);
        log('llm', `Read ${m.name}'s note`, { cravings: out.cravings, dietary: out.dietary });
      } catch (e) { log('warn', `Could not parse ${m.name}'s note with LLM`, { error: e.message }); }
    }
  }

  // ---------- 2. Resolve each player's taste into Qloo signals ----------
  const tagCache = new Map();
  for (const m of members) {
    m.tagIds = []; m.entityIds = []; m.resolved = [];
    const keywords = new Set();
    for (const c of m.cravings) { keywords.add(c); for (const k of keywordsToCuisines(c)) keywords.add(k); }
    for (const kw of [...keywords].slice(0, 8)) {
      if (!tagCache.has(kw)) tagCache.set(kw, pickPlaceTags(await qloo.searchTags(kw).catch(() => [])));
      for (const t of tagCache.get(kw)) if (!m.tagIds.includes(t.id)) { m.tagIds.push(t.id); m.resolved.push({ from: kw, tag: t.name || t.id }); }
    }
    for (const lp of m.likedPlaces) {
      const hits = await qloo.searchPlaces(lp, { lat: court.lat, lon: court.lon, radiusM: 40000, take: 1 }).catch(() => []);
      if (hits[0]) { m.entityIds.push(hits[0].id); m.resolved.push({ from: lp, entity: hits[0].name }); }
    }
    log('tool', `Qloo: resolved ${m.name}'s taste`, { tags: m.tagIds.length, places: m.entityIds.length, mapping: m.resolved.slice(0, 8) });
  }
  const needs = groupConstraints(members);
  log('think', needs.length ? `Hard constraints: ${needs.map(n => DIET_LABEL[n]).join(', ')}; open at ${arriveAt}` : `No dietary constraints; must be open at ${arriveAt}`, { needs });

  // ---------- 3–5. Act / observe / reflect loop ----------
  let ranked = [], rejected = [], maybe = [], iter = 0;
  const keep = new Map(), keepMaybe = new Map(); // best passing rows across all search rounds
  const allTags = [...new Set(members.flatMap(m => m.tagIds))];
  const allEntities = [...new Set(members.flatMap(m => m.entityIds))];
  while (iter < MAX_ITER) {
    iter++;
    const candidates = await qloo.placeInsights({ lat: court.lat, lon: court.lon, radiusM, entityIds: allEntities, tagIds: allTags, day, priceMax: budgetMax ?? undefined, take: 40 });
    log('tool', `Qloo Insights: ${candidates.length} candidate spots within ${(radiusM / 1000).toFixed(1)} km`, { iteration: iter, top: candidates.slice(0, 5).map(c => `${c.name} (${c.affinity ?? '?'})`) });
    // Dietary retrieval: also pull spots Qloo itself tags halal / vegetarian, ranked by the same group taste.
    for (const need of ['halal', 'vegetarian'].filter(n => needs.includes(n))) {
      const extra = await qloo.placeInsights({ lat: court.lat, lon: court.lon, radiusM, entityIds: allEntities, tagIds: allTags, filterTagIds: DIET_SIGNAL_TAGS[need], day, priceMax: budgetMax ?? undefined, take: 25 }).catch(() => []);
      const seen = new Set(candidates.map(c => c.id));
      const added = extra.filter(c => !seen.has(c.id));
      candidates.push(...added);
      log('tool', `Qloo Insights (filter: ${need}-tagged): +${added.length} spots`, { iteration: iter, top: added.slice(0, 5).map(c => c.name) });
      if (need === 'halal') break; // one diet-filtered pull per round keeps us inside the rate limit
    }
    if (!candidates.length) { if (!reflect('no candidates')) break; continue; }

    // Per-player affinity for each candidate: one Insights call per player, restricted to the candidate set.
    const ids = candidates.map(c => c.id);
    const perMember = {};
    for (const m of members) {
      const rows = [];
      // Qloo caps take at 50, so score the candidate set in chunks.
      if (m.tagIds.length || m.entityIds.length) for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        rows.push(...await qloo.placeInsights({ lat: court.lat, lon: court.lon, radiusM, entityIds: m.entityIds, tagIds: m.tagIds, restrictToIds: chunk, take: chunk.length, explain: false }).catch(() => []));
      }
      perMember[m.name] = Object.fromEntries(rows.map(r => [r.id, r.affinity ?? 0]));
    }
    // Live affinities aren't guaranteed to be 0..1 across calls; rescale per player so nobody dominates.
    for (const m of members) {
      const vals = Object.values(perMember[m.name]);
      const max = Math.max(...vals, 0);
      if (max > 1) for (const k in perMember[m.name]) perMember[m.name][k] /= max;
    }
    log('tool', `Qloo Insights ×${members.length}: scored every spot for each player`, { players: members.map(m => m.name) });

    ranked = []; rejected = []; maybe = [];
    for (const c of candidates) {
      const chk = checkVenue(c, { needs, day, arriveAt, mode: qloo.mode });
      const memberAffinities = Object.fromEntries(members.map(m => [m.name, +(perMember[m.name][c.id] ?? (m.tagIds.length || m.entityIds.length ? 0 : 0.5)).toFixed(3)]));
      const verifiedCount = Object.values(chk.status).filter(x => x === 'ok').length;
      const s = groupScore({ memberAffinities, distanceM: c.distanceM, radiusM, unverifiedCount: chk.unverified.length, verifiedCount });
      const row = { ...c, check: chk, memberAffinities, ...s };
      // Halal is a religious requirement: in live mode only Qloo-tagged halal spots go in the main list;
      // "no evidence either way" spots are held back as a clearly-flagged fallback.
      if (chk.pass && needs.includes('halal') && qloo.mode === 'live' && chk.status.halal !== 'ok') maybe.push(row);
      else (chk.pass ? ranked : rejected).push(row);
    }
    for (const [acc, rows] of [[keep, ranked], [keepMaybe, maybe]]) for (const r of rows) { const p = acc.get(r.id); if (!p || r.score > p.score) acc.set(r.id, r); }
    ranked = [...keep.values()].sort((a, b) => b.score - a.score);
    maybe = [...keepMaybe.values()].filter(m => !keep.has(m.id));
    const dietRejects = rejected.filter(r => r.check.failed.some(f => f.startsWith('not ')));
    if (needs.length) log('think', `Diet guard: ruled out ${dietRejects.length} spot${dietRejects.length === 1 ? '' : 's'} on Qloo evidence${maybe.length ? `, held back ${maybe.length} with unconfirmed halal status` : ''}`, { rejectedSample: dietRejects.slice(0, 4).map(r => `${r.name}: ${r.check.failed[0]}`) });
    log('observe', `${ranked.length} spots pass so far, ${rejected.length} rejected this round`, { rejectedSample: rejected.filter(r => !dietRejects.includes(r)).slice(0, 4).map(r => `${r.name}: ${r.check.failed.join(', ')}`) });
    if (ranked.length >= WANT_PASSING) break;
    if (iter >= MAX_ITER || !reflect(`only ${ranked.length} spots fit everyone`)) break;
  }

  function reflect(why) {
    if (radiusM < 10000) { radiusM = Math.min(Math.round(radiusM * 1.8), 10000); log('reflect', `${why} → widening search to ${(radiusM / 1000).toFixed(1)} km`); return true; }
    if (budgetMax && budgetMax < 4) { budgetMax++; log('reflect', `${why} → relaxing budget to ${'$'.repeat(budgetMax)}`); return true; }
    log('reflect', `${why} → no further relaxations; returning best effort`); return false;
  }

  // ---------- 6. Explain ----------
  if (ranked.length < WANT_PASSING && maybe.length) {
    maybe.sort((a, b) => b.score - a.score);
    const fill = maybe.slice(0, WANT_PASSING - ranked.length);
    ranked.push(...fill);
    log('reflect', `Only ${ranked.length - fill.length} confirmed-halal spots; adding ${fill.length} with no pork evidence but unconfirmed halal status, flagged "halal? verify"`);
  }
  const top = ranked.slice(0, 5).map(({ tagIds, ...v }) => v);
  for (const v of top) v.why = templateWhy(v, members, needs, arriveAt);
  if (llm && top.length) {
    try {
      const facts = top.slice(0, 3).map(v => ({ name: v.name, distance_km: v.distanceM != null ? +(v.distanceM / 1000).toFixed(1) : null, tags: v.tags.slice(0, 5), keywords: v.keywords.slice(0, 4), player_match: v.memberAffinities, unverified: v.check.unverified }));
      const txt = await llm.chat('You are a friendly Malaysian badminton kaki choosing supper. Using ONLY the JSON facts, write one short line per venue (max 30 words) explaining why it suits this group. Mention unverified items honestly. Reply JSON {"lines":[...]} in venue order.', JSON.stringify({ arrive: arriveAt, needs, venues: facts }), { json: true, maxTokens: 400 });
      const lines = JSON.parse(txt).lines || [];
      lines.forEach((l, i) => { if (top[i] && typeof l === 'string') top[i].pitch = l; });
      log('llm', 'Wrote the group pitch from verified facts', { model: llm.model });
    } catch (e) { log('warn', 'LLM pitch failed; using template explanations', { error: e.message }); }
  }
  log('done', top.length ? `Top pick: ${top[0].name}` : 'No spot fits everyone — see rejected list', {});

  return {
    mode: qloo.mode, llm: llm ? llm.model : null, court, day, arriveAt, radiusM, needs,
    members: members.map(({ name, dietary, resolved }) => ({ name, dietary, resolved })),
    results: top,
    rejected: [...rejected].sort((a, b) => (b.check.failed.some(f => f.startsWith('not ')) ? 1 : 0) - (a.check.failed.some(f => f.startsWith('not ')) ? 1 : 0)).slice(0, 8).map(r => ({ name: r.name, reasons: r.check.failed })),
    heldBack: maybe.filter(m => !ranked.includes(m)).slice(0, 5).map(r => ({ name: r.name, reasons: r.check.unverified.length ? r.check.unverified : ['halal not confirmed on Qloo'] })),
    trace,
    stats: { qlooCalls: qloo.calls, iterations: iter, ms: now() - t0 },
  };
}

function templateWhy(v, members, needs, arriveAt) {
  const entries = Object.entries(v.memberAffinities).sort((a, b) => b[1] - a[1]);
  const fans = entries.filter(([, a]) => a >= 0.55).map(([n]) => n);
  const lowest = entries[entries.length - 1];
  const parts = [];
  if (fans.length) parts.push(`Strong taste match for ${fans.join(', ')}`);
  if (lowest && lowest[1] < 0.55) parts.push(`${lowest[0]} still scores ${Math.round(lowest[1] * 100)}%`);
  if (needs.length) parts.push(v.check.unverified.length ? `check ${v.check.unverified.join(' & ')} on arrival` : `fits ${needs.map(n => DIET_LABEL[n]).join(' + ')}`);
  if (v.distanceM != null) parts.push(`${(v.distanceM / 1000).toFixed(1)} km from court`);
  parts.push(v.hours ? `open when you arrive (${arriveAt})` : 'hours not listed');
  return parts.join(' · ');
}
