// Optional LLM layer (OpenAI-compatible Chat Completions). The agent works fully without it.
// Enable with LLM_API_KEY (+ optional LLM_BASE_URL, LLM_MODEL).
export function makeLLM(env = process.env, fetchImpl = globalThis.fetch) {
  if (!env.LLM_API_KEY) return null;
  const base = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.LLM_MODEL || 'gpt-4o-mini';
  return {
    model,
    async chat(system, user, { json = false, maxTokens = 600 } = {}) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      try {
        const res = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LLM_API_KEY}` },
          body: JSON.stringify({ model, temperature: 0.4, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
        });
        if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
        const body = await res.json();
        return body.choices?.[0]?.message?.content || '';
      } finally { clearTimeout(t); }
    },
  };
}
