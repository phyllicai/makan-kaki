import { assessDiet } from '../diet/rules.js';

// Map a raw Qloo place entity (or mock entity) into the small shape the agent uses.
export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = x => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function normalizePlace(e, origin = {}) {
  const p = e.properties || {};
  const loc = e.location || p.location || {};
  const lat = loc.lat ?? loc.latitude ?? p.geocode?.lat ?? null;
  const lon = loc.lon ?? loc.lng ?? loc.longitude ?? p.geocode?.lon ?? null;
  const rawTags = e.tags || p.tags || [];
  const tags = rawTags.map(t => (typeof t === 'string' ? t : t.name)).filter(Boolean);
  const tagIds = rawTags.map(t => (typeof t === 'string' ? '' : t.id || t.tag_id || '')).filter(Boolean);
  const keywords = (p.keywords || []).map(k => (typeof k === 'string' ? k : k.name)).filter(Boolean);
  const dishes = (p.specialty_dishes || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean);
  const diet = assessDiet({ name: e.name || '', tagNames: tags, tagIds, keywords, description: p.description || '', dishes });
  const dietary = { ...diet.dietary };
  // Mock venues carry authoritative flags; real Qloo data goes through the evidence rules above.
  for (const k of Object.keys(e.dietary || {})) if (e.dietary[k] != null) dietary[k] = e.dietary[k];
  let distanceM = e.query?.distance ?? loc.distance ?? null;
  if (distanceM == null && lat != null && origin.lat != null) distanceM = Math.round(haversineM(origin.lat, origin.lon, lat, lon));
  return {
    id: e.entity_id || e.id,
    name: e.name,
    address: p.address || e.address || '',
    lat, lon,
    distanceM,
    priceLevel: p.price_level ?? e.priceLevel ?? null,
    rating: p.business_rating ?? e.rating ?? null,
    tags,
    keywords,
    hours: p.hours || e.hours || null,
    dietary, // true = positive evidence, false = conflicting evidence (e.g. pork on menu), null = unknown
    dietEvidence: diet.evidence,
    dietFlags: diet.flags,
    tagIds,
    affinity: e.query?.affinity ?? e.affinity ?? null,
    explainability: e.query?.explainability || null,
    mock: !!e.mock,
  };
}

/** Returns true/false/null (unknown) for "open at day+HH:MM". Accepts Qloo-style hours objects defensively. */
export function isOpenAt(hours, day, hhmm) {
  if (!hours || !day || !hhmm) return null;
  const slots = hours[day] || hours[day.toLowerCase()];
  if (!Array.isArray(slots)) return null;
  const toMin = s => { const m = String(s).replace(/^T/, '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const t = toMin(hhmm);
  for (const s of slots) {
    const o = toMin(s.opens), c = toMin(s.closes);
    if (o == null || c == null) continue;
    if (c <= o ? (t >= o || t < c) : (t >= o && t < c)) return true; // handles past-midnight closing
  }
  return false;
}
