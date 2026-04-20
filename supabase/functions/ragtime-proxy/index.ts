/**
 * RAGtime — Supabase Edge Function proxy for the Anthropic API
 * -------------------------------------------------------------
 * Accepts POST with JSON body containing EITHER:
 *   { password, system, messages, max_tokens, model }   ← demo path
 *   { user_api_key, system, messages, max_tokens, model } ← BYO-key path
 *
 * Responsibilities:
 *   1. Constant-time password comparison against DEMO_PASSWORD.
 *   2. Per-password daily quota (500 req/day) tracked in ragtime_quota (Postgres).
 *   3. Per-IP rate limit (10 req/min) tracked in ragtime_quota.
 *   4. Forwards to https://api.anthropic.com/v1/messages using either
 *      the Vault-stored shared key (demo) or the user's BYO key (not quota-tracked).
 *   5. Returns Anthropic's response as-is with permissive CORS.
 *
 * Auth: verify_jwt is disabled. This function authenticates itself via its
 * demo-password / BYO-key scheme; daily quota + per-IP rate limit are the
 * guardrails. JWT-based auth would prevent the static HTML client from calling
 * the function without a signed-in user.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEMO_PASSWORD = Deno.env.get("RAGTIME_DEMO_PASSWORD") || "Lawfareskunkworks";
const DAILY_QUOTA = 500;
const PER_IP_PER_MIN = 10;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Anthropic key cache. Pulled once per isolate lifetime so we don't hit the
// Vault RPC on every request.
let cachedAnthropicKey: string | null = null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsNoBody();
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405);
  }

  let body: {
    password?: string;
    user_api_key?: string;
    system?: string;
    messages?: unknown;
    max_tokens?: number;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }

  const { password, user_api_key, system, messages, max_tokens, model } = body || {};
  if (!messages || !model) {
    return json({ error: { message: "Missing messages or model" } }, 400);
  }

  // Resolve client IP
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";

  const now = new Date();

  // Per-IP rate limit (applies to both auth paths)
  const ipKey = `ip:${ip}:${yyyymmddhhmm(now)}`;
  const ipExpires = new Date(now.getTime() + 120_000); // 2-minute TTL marker
  const ipCount = await incrementCounter(ipKey, ipExpires);
  if (ipCount === null) {
    return json({ error: { message: "Quota backend unavailable" } }, 500);
  }
  if (ipCount > PER_IP_PER_MIN) {
    return json({ error: { message: `Rate limit exceeded (${PER_IP_PER_MIN} requests/minute per IP)` } }, 429);
  }

  // Resolve API key based on auth path
  let apiKey: string | undefined;
  if (password) {
    if (!constantTimeEqual(password, DEMO_PASSWORD)) {
      return json({ error: { message: "Invalid demo password" } }, 401);
    }
    const dayKey = `demo:${yyyymmdd(now)}`;
    const dayExpires = new Date(now.getTime() + 48 * 3600 * 1000); // 48h TTL marker
    const dayCount = await incrementCounter(dayKey, dayExpires);
    if (dayCount === null) {
      return json({ error: { message: "Quota backend unavailable" } }, 500);
    }
    if (dayCount > DAILY_QUOTA) {
      return json({
        error: {
          message: `Daily demo quota exhausted (${DAILY_QUOTA} requests). Try again tomorrow, or provide your own API key.`,
        },
      }, 429);
    }
    apiKey = await getAnthropicKey();
    if (!apiKey) {
      return json({ error: { message: "Proxy not configured — Anthropic key missing from Vault" } }, 500);
    }
  } else if (user_api_key) {
    apiKey = user_api_key; // forwarded verbatim; not stored, not quota-tracked
  } else {
    return json({ error: { message: "No credentials provided (need password or user_api_key)" } }, 401);
  }

  // Forward to Anthropic
  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ model, max_tokens: max_tokens || 4000, system, messages }),
    });
  } catch (err) {
    return json({ error: { message: "Upstream fetch failed: " + (err as Error).message } }, 502);
  }

  // Pass through Anthropic's body + status, add CORS
  const text = await upstream.text();

  // Opportunistic cleanup — ~1/200 chance per request to avoid table growth.
  if (Math.random() < 0.005) {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/ragtime_quota_cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: "{}",
    }).catch(() => {}); // fire and forget
  }

  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────

async function incrementCounter(key: string, expiresAt: Date): Promise<number | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ragtime_quota_incr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_key: key, p_expires: expiresAt.toISOString() }),
    });
    if (!resp.ok) {
      console.error("quota RPC error", resp.status, await resp.text());
      return null;
    }
    const count = await resp.json();
    return typeof count === "number" ? count : null;
  } catch (err) {
    console.error("quota RPC exception", err);
    return null;
  }
}

async function getAnthropicKey(): Promise<string | null> {
  if (cachedAnthropicKey) return cachedAnthropicKey;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ragtime_get_anthropic_key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: "{}",
    });
    if (!resp.ok) {
      console.error("key RPC error", resp.status, await resp.text());
      return null;
    }
    const k = await resp.json();
    if (typeof k === "string" && k.length > 0) {
      cachedAnthropicKey = k;
      return k;
    }
    return null;
  } catch (err) {
    console.error("key RPC exception", err);
    return null;
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function corsNoBody(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// Length-bounded constant-time equality. Does NOT short-circuit on first mismatch.
function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function yyyymmddhhmm(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 10).replace(/-/g, "") + iso.slice(11, 16).replace(":", "");
}
