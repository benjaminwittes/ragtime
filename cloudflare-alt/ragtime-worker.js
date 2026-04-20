/**
 * RAGtime — Cloudflare Worker proxy for the Anthropic API
 * ---------------------------------------------------------
 * Accepts POST /ask with a JSON body containing EITHER:
 *   { password, system, messages, max_tokens, model }   ← demo path
 *   { user_api_key, system, messages, max_tokens, model } ← BYO-key path
 *
 * Responsibilities:
 *   1. Constant-time password comparison against the shared DEMO_PASSWORD.
 *   2. Per-password daily quota (500 req/day) tracked in KV.
 *   3. Per-IP rate limit (10 req/min) tracked in KV.
 *   4. Forwards the request to https://api.anthropic.com/v1/messages using
 *      either the worker's ANTHROPIC_API_KEY (demo) or the user's provided
 *      key (BYO-key path — NOT quota-tracked).
 *   5. Returns Anthropic's response as-is, plus permissive CORS so the
 *      static HTML app can call it from any origin.
 *
 * Env vars / bindings (set via wrangler):
 *   ANTHROPIC_API_KEY  (secret)   — Ben's demo API key
 *   QUOTA              (KV)       — namespace for password-day + ip-minute counters
 *
 * Optional override:
 *   DEMO_PASSWORD      (secret)   — defaults to "Lawfareskunkworks"
 */

const DEFAULT_DEMO_PASSWORD = 'Lawfareskunkworks';
const DAILY_QUOTA = 500;
const PER_IP_PER_MIN = 10;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') return corsResponse();
    if (request.method !== 'POST') return json({ error: { message: 'Method not allowed' } }, 405);

    const url = new URL(request.url);
    if (url.pathname !== '/ask') return json({ error: { message: 'Not found' } }, 404);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: { message: 'Invalid JSON body' } }, 400); }

    const { password, user_api_key, system, messages, max_tokens, model } = body || {};
    if (!messages || !model) return json({ error: { message: 'Missing messages or model' } }, 400);

    // Per-IP rate limit (applies to both auth paths)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = new Date();
    const ipKey = `ip:${ip}:${yyyymmddhhmm(now)}`;
    const ipCount = parseInt(await env.QUOTA.get(ipKey) || '0', 10);
    if (ipCount >= PER_IP_PER_MIN) {
      return json({ error: { message: 'Rate limit exceeded (10 req/min per IP)' } }, 429);
    }
    ctx.waitUntil(env.QUOTA.put(ipKey, String(ipCount + 1), { expirationTtl: 120 }));

    // Resolve which API key to use
    let apiKey;
    if (password) {
      const demoPw = env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
      if (!constantTimeEqual(password, demoPw)) {
        return json({ error: { message: 'Invalid demo password' } }, 401);
      }
      const dayKey = `quota:demo:${yyyymmdd(now)}`;
      const dayCount = parseInt(await env.QUOTA.get(dayKey) || '0', 10);
      if (dayCount >= DAILY_QUOTA) {
        return json({ error: { message: 'Daily demo quota exhausted (500 requests). Try again tomorrow, or provide your own API key.' } }, 429);
      }
      ctx.waitUntil(env.QUOTA.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }));
      apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) return json({ error: { message: 'Worker not configured — ANTHROPIC_API_KEY missing' } }, 500);
    } else if (user_api_key) {
      // BYO-key: forward verbatim, no quota tracking, no server-side storage.
      apiKey = user_api_key;
    } else {
      return json({ error: { message: 'No credentials provided (need password or user_api_key)' } }, 401);
    }

    // Forward to Anthropic
    let anthropicResp;
    try {
      anthropicResp = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({ model, max_tokens: max_tokens || 4000, system, messages }),
      });
    } catch (err) {
      return json({ error: { message: 'Upstream fetch failed: ' + err.message } }, 502);
    }

    // Pass through status + body, add CORS
    const text = await anthropicResp.text();
    return new Response(text, {
      status: anthropicResp.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    });
  },
};

// --- helpers ---

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// Length-bounded constant-time string comparison. Returns true only if strings
// are identical in both content and length; does NOT short-circuit on mismatch.
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function yyyymmdd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function yyyymmddhhmm(d) {
  const iso = d.toISOString();
  return iso.slice(0, 10).replace(/-/g, '') + iso.slice(11, 16).replace(':', '');
}
