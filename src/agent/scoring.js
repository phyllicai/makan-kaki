// Pure, deterministic group-ranking logic (unit tested).
import { isOpenAt } from '../qloo/normalize.js';

export const DIET_LABEL = { halal: 'halal', vegetarian: 'vegetarian options', pork_free: 'pork-free' };

/** Hard constraints implied by the group. Halal implies pork-free. */
export function groupConstraints(members) {
  const need = new Set();
  for (const m of members) for (const d of m.dietary || []) { need.add(d); if (d === 'halal') need.add('pork_free'); }
  return [...need];
}

export function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h * 60 + m + mins) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Check one venue against hard constraints. Returns { pass, unverified[], failed[] } */
export function checkVenue(v, { needs, day, arriveAt, mode }) {
  const failed = [], unverified = [], status = {};
  for (const n of needs) {
    if (n === 'pork_free' && needs.includes('halal')) continue; // covered by halal check
    const s = v.dietary?.[n];
    if (s === false) { failed.push(DIET_LABEL[n]); status[n] = 'fail'; }
    else if (s == null) { unverified.push(DIET_LABEL[n]); status[n] = 'unverified'; }
    else status[n] = 'ok';
  }
  const open = isOpenAt(v.hours, day, arriveAt);
  if (open === false) failed.push(`closed at ${arriveAt}`);
  else if (open == null && mode === 'live') unverified.push('late-night hours');
  // In live mode, unknown dietary data is a soft flag (Qloo has no halal certification field); in mock it's authoritative.
  return { pass: failed.length === 0, failed, unverified, status };
}

/**
 * Group score: blends average happiness with "least misery" so one member isn't sacrificed,
 * plus proximity (tired legs after badminton) and a penalty for unverified constraints.
 */
export function groupScore({ memberAffinities, distanceM, radiusM, unverifiedCount = 0 }) {
  const vals = Object.values(memberAffinities);
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const min = vals.length ? Math.min(...vals) : 0;
  const proximity = distanceM == null ? 0.5 : Math.max(0, 1 - distanceM / Math.max(radiusM, 1));
  const score = 0.45 * mean + 0.35 * min + 0.2 * proximity - 0.08 * unverifiedCount;
  return { score: +Math.max(0, score).toFixed(4), mean: +mean.toFixed(3), min: +min.toFixed(3), proximity: +proximity.toFixed(3) };
}
