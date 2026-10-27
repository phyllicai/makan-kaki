// MOCK MODE — fictional venues, synthetic affinities. Used only when QLOO_API_KEY is unset
// (or QLOO_MODE=mock). Same interface as QlooClient so the agent code path is identical.
import { CUISINES, keywordsToCuisines } from '../data/vocab.js';
import { COURTS } from '../data/courts.js';
import { normalizePlace } from './normalize.js';

const H = (o, c) => Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => [d, [{ opens: `T${o}`, closes: `T${c}` }]]));

// Fictional venue archetypes. Names are invented; they are not real businesses.
const ARCHETYPES = [
  { n: 'Mamak Bintang 24 Jam', c: ['mamak', 'malay', 'indian', 'noodles'], halal: true, veg: true, pork_free: true, p: 1, r: 4.0, h: H('00:00', '23:59'), k: ['open 24 hours', 'big groups', 'football on TV'] },
  { n: 'Restoran Nasi Lemak Daun', c: ['malay'], halal: true, veg: false, pork_free: true, p: 1, r: 4.3, h: H('17:00', '02:00'), k: ['late night', 'sambal'] },
  { n: 'Kedai Kopi Lima Kaki', c: ['chinese', 'kopitiam', 'noodles'], halal: false, veg: false, pork_free: false, p: 1, r: 4.2, h: H('07:00', '23:30'), k: ['hawker stalls', 'char kway teow'] },
  { n: 'Dragon Tai Chow', c: ['chinese', 'seafood'], halal: false, veg: true, pork_free: false, p: 2, r: 4.1, h: H('11:00', '00:30'), k: ['zi char', 'round tables', 'big groups'] },
  { n: 'Pork-Free Dim Sum House', c: ['chinese', 'noodles'], halal: false, veg: true, pork_free: true, p: 2, r: 4.0, h: H('06:00', '15:00'), k: ['dim sum', 'breakfast'] },
  { n: 'Sri Annapoorna Leaf', c: ['indian', 'vegetarian'], halal: true, veg: true, pork_free: true, p: 1, r: 4.5, h: H('07:00', '23:00'), k: ['banana leaf', 'pure vegetarian', 'thosai'] },
  { n: 'Briyani Corner Express', c: ['indian', 'malay'], halal: true, veg: true, pork_free: true, p: 1, r: 4.0, h: H('10:00', '01:00'), k: ['briyani', 'late night'] },
  { n: 'Seoul Wings & Bowls', c: ['korean', 'western'], halal: true, veg: true, pork_free: true, p: 2, r: 4.2, h: H('12:00', '00:00'), k: ['korean fried chicken', 'muslim-friendly', 'tteokbokki'] },
  { n: 'Smash Burger Lab', c: ['western'], halal: true, veg: true, pork_free: true, p: 2, r: 4.4, h: H('12:00', '23:00'), k: ['burger', 'halal-certified'] },
  { n: 'Ikan Bakar Pak Long', c: ['malay', 'seafood'], halal: true, veg: false, pork_free: true, p: 2, r: 4.3, h: H('18:00', '01:00'), k: ['ikan bakar', 'open-air', 'late night'] },
  { n: 'Satay Senja', c: ['malay', 'satay'], halal: true, veg: false, pork_free: true, p: 1, r: 4.1, h: H('17:00', '00:30'), k: ['satay', 'groups'] },
  { n: 'Bak Kut Teh Ah Seng', c: ['chinese', 'pork'], halal: false, veg: false, pork_free: false, p: 2, r: 4.4, h: H('07:00', '22:00'), k: ['bak kut teh', 'herbal soup'] },
  { n: 'Mala Steamboat Night', c: ['steamboat', 'chinese'], halal: false, veg: true, pork_free: true, p: 3, r: 4.0, h: H('17:00', '02:00'), k: ['hotpot', 'mala', 'group sharing'] },
  { n: 'Tomyam Kak Yah', c: ['thai', 'malay', 'seafood'], halal: true, veg: false, pork_free: true, p: 1, r: 4.2, h: H('11:00', '00:00'), k: ['tomyam', 'thai-kelantan'] },
  { n: 'Ramen Kaze', c: ['japanese', 'noodles'], halal: false, veg: true, pork_free: false, p: 3, r: 4.3, h: H('11:30', '22:00'), k: ['ramen', 'tonkotsu'] },
  { n: 'Cendol & Bingsu Bar', c: ['dessert'], halal: true, veg: true, pork_free: true, p: 1, r: 4.3, h: H('13:00', '00:00'), k: ['cendol', 'bingsu', 'dessert'] },
  { n: 'Lanzhou Muslim Noodle House', c: ['chinese', 'noodles'], halal: true, veg: true, pork_free: true, p: 1, r: 4.3, h: H('10:00', '01:00'), k: ['chinese muslim', 'hand-pulled noodles', 'wantan'] },
  { n: 'Green Court Poke', c: ['healthy', 'japanese'], halal: true, veg: true, pork_free: true, p: 2, r: 4.0, h: H('10:00', '21:30'), k: ['protein bowls', 'post-workout'] },
  { n: 'Chai Fan Vegetarian Kitchen', c: ['vegetarian', 'chinese'], halal: false, veg: true, pork_free: true, p: 1, r: 4.1, h: H('08:00', '21:00'), k: ['vegetarian', 'economy rice'] },
];

function seeded(i) { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }

function buildCatalog() {
  const out = [];
  COURTS.forEach((court, ci) => {
    ARCHETYPES.forEach((a, ai) => {
      const s = ci * 100 + ai;
      const dist = 250 + seeded(s) * 5500; // metres
      const ang = seeded(s + 7) * Math.PI * 2;
      const dLat = (dist * Math.cos(ang)) / 111320;
      const dLon = (dist * Math.sin(ang)) / (111320 * Math.cos((court.lat * Math.PI) / 180));
      out.push({
        mock: true,
        entity_id: `mock:place:${court.id}:${ai}`,
        name: a.n,
        location: { lat: +(court.lat + dLat).toFixed(5), lon: +(court.lon + dLon).toFixed(5) },
        properties: { address: `(fictional) near ${court.label}`, price_level: a.p, business_rating: a.r, keywords: a.k, hours: a.h },
        tags: a.c.map(c => ({ name: c, id: `mock:tag:${c}` })),
        dietary: { halal: a.halal, vegetarian: a.veg, pork_free: a.pork_free },
        cuisines: a.c,
        popularity: 0.5 + seeded(s + 3) * 0.5,
      });
    });
  });
  return out;
}

export class MockQloo {
  constructor() { this.mode = 'mock'; this.calls = 0; this.catalog = buildCatalog(); this.pseudo = new Map(); }

  async searchTags(keyword) {
    this.calls++;
    return keywordsToCuisines(keyword).map(c => ({ id: `mock:tag:${c}`, name: c, type: 'mock:tag:cuisine' }));
  }

  async searchPlaces(query, { lat, lon } = {}) {
    this.calls++;
    const q = query.toLowerCase();
    const hit = this.catalog.filter(e => e.name.toLowerCase().includes(q)).slice(0, 1);
    if (hit.length) return hit.map(e => normalizePlace(e, { lat, lon }));
    // Unknown real-world name: make a pseudo-entity whose taste comes from words in the name / well-known MY spots.
    const known = { 'village park': ['malay'], 'jalan alor': ['chinese', 'seafood', 'satay'], 'nando': ['western'], 'sushi king': ['japanese'], 'old town': ['kopitiam'], 'secret recipe': ['dessert', 'western'], 'kfc': ['western'], 'marini': ['western'] };
    let c = keywordsToCuisines(q);
    for (const [k, v] of Object.entries(known)) if (q.includes(k)) c = [...new Set([...c, ...v])];
    if (!c.length) return [];
    const id = `mock:place:pseudo:${q.replace(/[^a-z0-9]+/g, '-')}`;
    const e = { mock: true, entity_id: id, name: query, tags: c.map(x => ({ name: x })), cuisines: c, properties: {} };
    this.pseudo.set(id, e);
    return [normalizePlace(e)];
  }

  cuisinesOf(id) {
    const e = this.catalog.find(x => x.entity_id === id) || this.pseudo.get(id);
    return e ? e.cuisines : [];
  }

  async placeInsights({ lat, lon, radiusM = 3000, entityIds = [], tagIds = [], filterTagIds = [], restrictToIds = [], day, priceMax, take = 30 } = {}) {
    this.calls++;
    // Build a taste vector from signals (tags weight 1, liked places weight 0.7 per cuisine).
    const w = {};
    for (const t of tagIds) { const c = t.replace('mock:tag:', ''); w[c] = (w[c] || 0) + 1; }
    for (const id of entityIds) for (const c of this.cuisinesOf(id)) w[c] = (w[c] || 0) + 0.7;
    const norm = Math.sqrt(Object.values(w).reduce((s, v) => s + v * v, 0)) || 1;
    let rows = this.catalog.map(e => normalizePlace(e, { lat, lon }));
    if (filterTagIds.some(t => /halal/.test(t))) rows = rows.filter(r => r.dietary.halal === true);
    else if (filterTagIds.some(t => /vegetarian|vegan/.test(t))) rows = rows.filter(r => r.dietary.vegetarian === true);
    if (restrictToIds.length) rows = rows.filter(r => restrictToIds.includes(r.id));
    else rows = rows.filter(r => r.distanceM <= radiusM && (priceMax == null || r.priceLevel <= priceMax));
    // Same archetype appears near several courts; keep only the nearest copy of each name.
    const nearest = new Map();
    for (const r of rows) { const p = nearest.get(r.name); if (!p || r.distanceM < p.distanceM) nearest.set(r.name, r); }
    rows = [...nearest.values()];
    const scored = rows.map(r => {
      const raw = this.catalog.find(e => e.entity_id === r.id);
      const match = raw.cuisines.reduce((s, c) => s + (w[c] || 0), 0) / (norm * Math.sqrt(raw.cuisines.length));
      const affinity = Math.max(0, Math.min(1, 0.15 + 0.75 * match + 0.1 * raw.popularity));
      return { ...r, affinity: +affinity.toFixed(3) };
    });
    return scored.sort((a, b) => b.affinity - a.affinity).slice(0, take);
  }
}
