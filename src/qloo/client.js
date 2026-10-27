// Real Qloo adapter. Talks to the hackathon environment by default.
// Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
// - Auth: X-Api-Key header (not Bearer, not query param)
// - Base URL for hackathon keys: https://hackathon.api.qloo.com
// - /v2/insights is GET with query-string params
import { normalizePlace } from './normalize.js';

const DEFAULT_BASE = 'https://hackathon.api.qloo.com';

export class QlooClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
    if (!apiKey) throw new Error('QlooClient needs an apiKey');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.mode = 'live';
    this.calls = 0;
    this.cache = new Map(); // private, in-memory only (Qloo allows server-side caching)
    this.minGapMs = 350; // hackathon keys are rate-limited; space calls out
    this._next = 0;
  }

  async _pace() {
    const wait = this._next - Date.now();
    this._next = Math.max(Date.now(), this._next) + this.minGapMs;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }

  async get(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const url = `${this.baseUrl}${path}?${qs}`;
    if (this.cache.has(url)) return this.cache.get(url);
    for (let attempt = 0; ; attempt++) {
      try { return await this._getOnce(path, url); }
      catch (e) {
        if (e.status !== 429 || attempt >= 4) throw e;
        await new Promise(r => setTimeout(r, 800 * 2 ** attempt)); // backoff on rate limit
      }
    }
  }

  async _getOnce(path, url) {
    await this._pace();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    this.calls++;
    try {
      const res = await this.fetch(url, { headers: { 'X-Api-Key': this.apiKey, accept: 'application/json' }, signal: ctrl.signal });
      const text = await res.text();
      let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
      if (!res.ok) {
        const err = new Error(`Qloo ${path} -> HTTP ${res.status}: ${(body && (body.error?.message || body.message)) || text.slice(0, 200)}`);
        err.status = res.status; err.body = body;
        throw err;
      }
      this.cache.set(url, body);
      return body;
    } finally { clearTimeout(t); }
  }

  /** Find place-genre tag IDs (e.g. a cuisine) by keyword. Returns [{id,name}] */
  async searchTags(keyword, { take = 5 } = {}) {
    const body = await this.get('/v2/tags', { 'filter.query': keyword, 'filter.parents.types': 'urn:entity:place', take });
    const tags = body?.results?.tags || body?.results || [];
    return tags.map(t => ({ id: t.tag_id || t.id, name: t.name, type: t.subtype || t.type })).filter(t => t.id);
  }

  /** Resolve a free-text place name (e.g. "Village Park Restaurant") near a point to Qloo place entities. */
  async searchPlaces(query, { lat, lon, radiusM = 30000, take = 3 } = {}) {
    const params = { query, types: 'urn:entity:place', take };
    if (lat != null && lon != null) {
      // /search wants "lat,lon" (unlike /v2/insights, which takes WKT POINT(lon lat))
      params['filter.location'] = `${lat},${lon}`;
      params['filter.radius'] = Math.round(radiusM / 1000); // km
    }
    const body = await this.get('/search', params);
    const arr = body?.results || [];
    return arr.map(e => normalizePlace(e, { lat, lon })).filter(p => p.id);
  }

  /**
   * Place insights near a point, driven by taste signals.
   * opts: { lat, lon, radiusM, entityIds, tagIds, filterTagIds, restrictToIds, day, priceMax, take }
   */
  async placeInsights({ lat, lon, radiusM = 3000, entityIds = [], tagIds = [], filterTagIds = [], restrictToIds = [], day, priceMax, take = 30, explain = true } = {}) {
    const params = {
      'filter.type': 'urn:entity:place',
      'filter.location': `POINT(${lon} ${lat})`,
      'filter.location.radius': radiusM,
      'signal.interests.entities': entityIds,
      'signal.interests.tags': tagIds,
      'operator.signal.interests.tags': tagIds.length > 1 ? 'union' : undefined,
      'filter.results.entities': restrictToIds,
      // Hard tag filter, e.g. only places Qloo tags as halal (union = any of the listed tags).
      'filter.tags': filterTagIds,
      'operator.filter.tags': filterTagIds.length > 1 ? 'union' : undefined,
      'filter.hours': day,
      'filter.price_level.max': priceMax,
      'feature.explainability': explain ? 'true' : undefined,
      take,
    };
    // Qloo requires at least one valid signal or filter; fall back to a generic restaurant tag.
    if (!entityIds.length && !tagIds.length && !filterTagIds.length) params['filter.tags'] = 'urn:tag:category:place:restaurant';
    const body = await this.get('/v2/insights', params);
    const ents = body?.results?.entities || [];
    return ents.map(e => normalizePlace(e, { lat, lon }));
  }
}
