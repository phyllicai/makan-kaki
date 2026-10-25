// Run once you have a key:  QLOO_API_KEY=... npm run smoke:live
// Verifies the hackathon base URL, auth header, tag search, place search and Insights for a KL point.
import { QlooClient } from '../src/qloo/client.js';
const key = process.env.QLOO_API_KEY;
if (!key) { console.error('Set QLOO_API_KEY first.'); process.exit(1); }
const q = new QlooClient({ apiKey: key, baseUrl: process.env.QLOO_BASE_URL || undefined });
const ss2 = { lat: 3.1185, lon: 101.6230 };
const step = async (name, fn) => { try { const r = await fn(); console.log(`✔ ${name}:`, JSON.stringify(r).slice(0, 400)); return r; } catch (e) { console.log(`✘ ${name}: ${e.message}`); } };
await step('tags "malaysian"', () => q.searchTags('malaysian'));
await step('tags "halal"', () => q.searchTags('halal'));
await step('search "Village Park Restaurant"', () => q.searchPlaces('Village Park Restaurant', { ...ss2, radiusM: 20000 }));
const tags = (await q.searchTags('malaysian').catch(() => [])).slice(0, 2).map(t => t.id);
await step('insights near SS2', () => q.placeInsights({ ...ss2, radiusM: 3000, tagIds: tags, take: 5 }).then(r => r.map(x => ({ n: x.name, a: x.affinity, d: x.distanceM, diet: x.dietary, hours: !!x.hours }))));
