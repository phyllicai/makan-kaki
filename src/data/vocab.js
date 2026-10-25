// Food vocabulary used to (a) turn free-text cravings into tag keywords and
// (b) power the clearly-labelled MOCK mode. In live mode, keywords are resolved
// to real Qloo tag IDs via GET /v2/tags.
export const CUISINES = {
  malay: ['malay', 'nasi', 'rendang', 'kampung', 'ayam penyet', 'nasi kandar'],
  mamak: ['mamak', 'roti canai', 'teh tarik', 'maggi goreng', 'nasi kandar', 'thosai'],
  chinese: ['chinese', 'char kway teow', 'wantan', 'wonton', 'hokkien mee', 'chicken rice', 'dim sum', 'zi char', 'tai chow'],
  indian: ['indian', 'banana leaf', 'thosai', 'dosa', 'briyani', 'biryani', 'tandoori'],
  thai: ['thai', 'tomyam', 'tom yum', 'som tam'],
  japanese: ['japanese', 'sushi', 'ramen', 'izakaya', 'donburi'],
  korean: ['korean', 'kbbq', 'korean bbq', 'tteokbokki', 'fried chicken'],
  western: ['western', 'burger', 'steak', 'pasta', 'grill', 'pizza'],
  seafood: ['seafood', 'ikan bakar', 'chilli crab', 'lala', 'fish head'],
  noodles: ['noodle', 'mee', 'ramen', 'pan mee', 'laksa', 'wantan'],
  satay: ['satay', 'sate'],
  steamboat: ['steamboat', 'hotpot', 'hot pot', 'mala'],
  dessert: ['dessert', 'cendol', 'ais kacang', 'abc', 'bingsu', 'ice cream', 'tau fu fa'],
  kopitiam: ['kopitiam', 'kopi', 'coffee shop', 'toast', 'half-boiled'],
  healthy: ['healthy', 'salad', 'poke', 'grain bowl', 'protein'],
  vegetarian: ['vegetarian', 'vegan', 'plant-based', 'chai fan'],
  pork: ['bak kut teh', 'char siu', 'siew yuk', 'pork'],
};

export function keywordsToCuisines(text) {
  const t = String(text || '').toLowerCase();
  const out = new Set();
  const has = w => new RegExp(`(^|[^a-z])${escapeRe(w)}($|[^a-z])`).test(t);
  for (const [c, words] of Object.entries(CUISINES)) if (c === t || has(c) || words.some(has)) out.add(c);
  return [...out];
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
