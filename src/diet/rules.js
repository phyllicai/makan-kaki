// Dietary guard for real (noisy) Qloo place data.
// Qloo tags are crowd/ML-derived, so a place can carry both "Halal" and "Pork bone soup".
// Rule: hard negative evidence (pork, beef, bar/pub) always beats a positive tag.
// Returns per-need status: true (positive evidence), false (conflicting evidence), null (unknown),
// plus human-readable evidence so the UI/trace can say *why* a place was ruled out.

// --- Qloo tag IDs (verified against GET /v2/tags on the hackathon API) ---
export const HALAL_TAG_IDS = [
  'urn:tag:dietary_option:qloo:halal',
  'urn:tag:offerings:place:halal_food',
  'urn:tag:offerings:place:halal_options',
  'urn:tag:genre:place:restaurant:halal',
  'urn:tag:cuisine:qloo:halal',
];
export const VEG_TAG_IDS = [
  'urn:tag:dietary_option:qloo:vegetarian',
  'urn:tag:dietary_option:qloo:vegan',
  'urn:tag:offerings:place:vegetarian_options',
  'urn:tag:offerings:place:vegan_options',
  'urn:tag:genre:place:restaurant:vegetarian',
  'urn:tag:genre:place:restaurant:vegan',
  'urn:tag:category:place:vegan_restaurant',
  'urn:tag:category:place:vegetarian_restaurant',
];
export const DIET_SIGNAL_TAGS = { halal: HALAL_TAG_IDS, vegetarian: VEG_TAG_IDS };

// Phrases that *contain* a denylisted word but mean the opposite; stripped before scanning.
const NEGATIONS = [
  /\b(pork|lard|beef|alcohol)[\s-]*free\b/g, /\bno[\s-]+(pork|lard|beef|alcohol)\b/g, /\bnon[\s-]*(pork|beef|alcoholic)\b/g,
  /\bwithout\s+(pork|lard|beef)\b/g, /\b(beef|chicken|turkey|duck|halal)\s+(bacon|ham|pepperoni|sausage)\b/g,
  /\b(salad|sauce|juice|snack|dessert|bingsu|cendol|ice|tea|coffee|milk|noodle|sushi|oyster|protein|smoothie|yogurt|poke|soup|cereal|waffle|breakfast|nail|candy|chocolate|granola|taco|salsa)\s+bar\b/g,
  /\bmini\s*bar\b/g,
];
const NON_HALAL = /\b(non|not)[\s-]*halal\b/;

// Denylists (matched with word boundaries for Latin text, substring for CJK).
const PORK = ['pork', 'bak kut teh', 'bakuteh', 'bak kut', 'bah kut teh', 'char siu', 'char siew', 'cha siu', 'chasiu', 'chashu', 'siew yoke', 'siew yuk', 'siu yuk', 'siu yoke', 'sio bak', 'lard', 'babi', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'salami', 'chorizo', 'pancetta', 'tonkotsu', 'katsudon', 'tonkatsu', 'lechon', 'lou bak', 'loh bak', 'lor bak', 'chu yuk', 'trotter', 'samgyeopsal', 'samgyupsal', 'pork belly', 'babi guling', 'dongpo'];
const PORK_CJK = ['猪', '豬', '肉骨茶', '叉烧', '叉燒', '烧肉', '燒肉', '卤肉', '滷肉', '豚'];
const BEEF = ['beef', 'steak', 'steakhouse', 'wagyu', 'brisket', 'bulgogi', 'galbi', 'kalbi', 'gyudon', 'gyukatsu', 'yakiniku', 'daging lembu', 'lembu', 'sup tulang', 'ngau', 'oxtail', 'rendang daging', 'sirloin', 'ribeye', 'rib eye', 'tenderloin', 'roast beef'];
const BEEF_CJK = ['牛肉', '牛腩', '牛杂', '牛雜', '牛扒', '牛排', '牛丸'];
const BAR_NAME = ['bar', 'pub', 'brewery', 'brewpub', 'brew house', 'brewhouse', 'taproom', 'tap room', 'tavern', 'beer', 'beerhouse', 'wine', 'cocktail', 'cocktails', 'izakaya', 'speakeasy', 'saloon', 'bier', 'biergarten', 'taphouse'];
const BAR_CJK = ['啤酒', '酒吧', '酒馆', '酒館'];
const BAR_TAG = /urn:tag:(category:place|genre:place(:restaurant)?):(bar|pub|brewpub|brewery|beer_[a-z_]+|wine_bar|cocktail_bar|sports_bar|night_?club|izakaya|gastropub|lounge|tavern)\b/;
const ALCOHOL_TAG = /urn:tag:(offerings:place|beverage_offering:qloo|beverage_offering:place):(alcohol|beer|wine|cocktails|hard_liquor|full_bar|spirits|happy_hour_drinks|craft_beer|sake)\b/;
const VEG_ONLY_TAG = /urn:tag:(offerings:place:vegetarian_options_only|category:place:(vegan|vegetarian)_restaurant|genre:place:restaurant:(vegan|vegetarian))\b/;
const VEG_WORDS = ['vegetarian', 'vegan', 'plant-based', 'plant based', 'chai fan', 'meatless', 'zhai'];
const VEG_CJK = ['素食', '斋', '齋'];
// Meat-centric *identity* (name or category, not a single menu item) that rules out a vegetarian-only diner.
const MEAT_CENTRIC = /\b(bak kut teh|bakuteh|steakhouse|steak house|chicken rice|satay|sate|korean bbq|kbbq|yakiniku|char siu|siew yoke|roast duck|duck rice|pork|beef noodle|fish head|carvery|lechon)\b/;

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = words => new RegExp(`(^|[^a-z0-9])(${words.map(esc).join('|')})(?=$|[^a-z0-9])`, 'i');
const PORK_RE = wordRe(PORK), BEEF_RE = wordRe(BEEF), BAR_RE = wordRe(BAR_NAME), VEG_RE = wordRe(VEG_WORDS);

function clean(s) { let t = String(s || '').toLowerCase(); for (const r of NEGATIONS) t = t.replace(r, ' '); return t; }
function firstHit(texts, re, cjk = []) {
  for (const raw of texts) {
    const t = clean(raw);
    const m = t.match(re); if (m) return { word: m[2], in: String(raw).slice(0, 60) };
    const c = cjk.find(w => String(raw).includes(w)); if (c) return { word: c, in: String(raw).slice(0, 60) };
  }
  return null;
}

/**
 * Assess one place. Input: a raw Qloo entity (or normalized pieces).
 * { name, tagNames[], tagIds[], keywords[], description, dishes[] }
 */
export function assessDiet({ name = '', tagNames = [], tagIds = [], keywords = [], description = '', dishes = [] }) {
  const ids = tagIds.map(String);
  const textual = [name, ...tagNames, ...keywords, ...dishes, description].filter(Boolean);
  const evidence = {};

  // Pork: any text or tag id segment.
  const porkTag = ids.filter(id => !/free|(beef|chicken|turkey|duck)_(bacon|ham)/.test(id)).find(id => /(^|[:_])(pork|pork_[a-z_]+|bak_kut_teh|char_siu|lard|bacon|ham)([_:]|$)/.test(id.replace(/^.*:/, ':')));
  const pork = firstHit(textual, PORK_RE, PORK_CJK) || (porkTag ? { word: 'pork', in: porkTag.replace(/^.*:/, '').replace(/_/g, ' ') } : null);
  const beefTag = ids.filter(id => !/free/.test(id)).find(id => /(^|[:_])(beef|steak|steakhouse|wagyu|brisket|bulgogi)([_:]|$)/.test(id.replace(/^.*:/, ':')));
  const beef = firstHit(textual, BEEF_RE, BEEF_CJK) || (beefTag ? { word: 'beef', in: beefTag.replace(/^.*:/, '').replace(/_/g, ' ') } : null);
  const barTag = ids.find(id => BAR_TAG.test(id));
  const bar = firstHit([name], BAR_RE, BAR_CJK) || (barTag ? { word: 'bar', in: barTag.replace(/^.*:/, '').replace(/_/g, ' ') } : null);
  const alcoholTag = ids.find(id => ALCOHOL_TAG.test(id));

  const allText = textual.map(clean).join(' | ');
  const halalTagged = ids.some(id => HALAL_TAG_IDS.includes(id) || /:(halal|muslim_friendly)$/.test(id)) || /\bhalal\b|muslim[\s-]friendly/.test(allText);
  const nonHalal = NON_HALAL.test(textual.join(' ').toLowerCase());
  const vegTagged = ids.some(id => VEG_TAG_IDS.includes(id)) || !!firstHit(textual, VEG_RE, VEG_CJK);
  const vegOnly = ids.some(id => VEG_ONLY_TAG.test(id)) || /\b(pure vegetarian|vegetarian restaurant|vegan restaurant)\b/.test(allText);
  const meatCentric = clean([name, ...tagNames.filter(n => /restaurant|shop|house/i.test(n))].join(' | ')).match(MEAT_CENTRIC);

  const dietary = { halal: null, pork_free: null, vegetarian: null, no_beef: null };
  const flags = {};

  // Halal: pork, non-halal or a bar is a hard fail even if Qloo also says "Halal".
  if (pork) { dietary.halal = false; evidence.halal = `pork on menu (${pork.in})`; }
  else if (nonHalal) { dietary.halal = false; evidence.halal = 'listed as non-halal'; }
  else if (bar) { dietary.halal = false; evidence.halal = `bar/alcohol venue (${bar.in})`; }
  else if (alcoholTag && !halalTagged) { dietary.halal = false; evidence.halal = `serves alcohol (${alcoholTag.replace(/^.*:/, '').replace(/_/g, ' ')})`; }
  else if (halalTagged) {
    dietary.halal = true; evidence.halal = 'tagged halal on Qloo';
    if (alcoholTag) flags.halal = `alcohol also listed (${alcoholTag.replace(/^.*:/, '').replace(/_/g, ' ')})`;
  }

  // Pork-free.
  if (pork) { dietary.pork_free = false; evidence.pork_free = `pork on menu (${pork.in})`; }
  else if (dietary.halal === true || vegOnly || /\bpork[\s-]*free\b|\bno[\s-]+pork\b/.test(textual.join(' ').toLowerCase())) { dietary.pork_free = true; evidence.pork_free = dietary.halal ? 'halal-tagged' : 'pork-free / vegetarian-only'; }

  // No beef.
  if (beef) { dietary.no_beef = false; evidence.no_beef = `beef on menu (${beef.in})`; }
  else if (vegOnly) { dietary.no_beef = true; evidence.no_beef = 'vegetarian-only'; }

  // Vegetarian options.
  if (vegTagged || vegOnly) { dietary.vegetarian = true; evidence.vegetarian = vegOnly ? 'vegetarian-only venue' : 'vegetarian options tagged'; }
  else if (meatCentric) { dietary.vegetarian = false; evidence.vegetarian = `meat-centric (${meatCentric[1]})`; }

  return { dietary, evidence, flags };
}
