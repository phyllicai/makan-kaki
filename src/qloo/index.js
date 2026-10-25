import { QlooClient } from './client.js';
import { MockQloo } from './mock.js';

/** One env var flips the whole app to live Qloo: QLOO_API_KEY. */
export function makeQloo(env = process.env) {
  const forceMock = (env.QLOO_MODE || '').toLowerCase() === 'mock';
  if (env.QLOO_API_KEY && !forceMock) return new QlooClient({ apiKey: env.QLOO_API_KEY, baseUrl: env.QLOO_BASE_URL || undefined });
  return new MockQloo();
}
