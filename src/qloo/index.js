import { QlooClient } from './client.js';
import { MockQloo } from './mock.js';

/** One env var flips the whole app to live Qloo: QLOO_API_KEY. */
export function makeQloo(env = process.env) {
  const mode = (env.QLOO_MODE || '').toLowerCase();
  const forceMock = mode === 'mock';
  if (mode === 'live' && !env.QLOO_API_KEY) throw new Error('QLOO_MODE=live but QLOO_API_KEY is not set');
  if (env.QLOO_API_KEY && !forceMock) return new QlooClient({ apiKey: env.QLOO_API_KEY, baseUrl: env.QLOO_BASE_URL || undefined });
  return new MockQloo();
}
