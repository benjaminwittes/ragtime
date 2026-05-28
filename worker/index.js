// ragtime-worker.js  v3.2
//
// Ragtime AI proxy — paid tier (Supabase) + demo password + BYO key.
//
// Change in v3.2 (2026-05-18): Anthropic requests now use streaming
// (`stream: true`) end-to-end inside the worker. The frontend interface
// is unchanged — the worker assembles the SSE stream server-side into
// the same JSON response shape the non-streaming path returned in v3.1.
// Motivation: Cloudflare's edge in front of api.anthropic.com returns
// HTTP 524 ("origin timed out") when the upstream response exceeds
// ~100s. Long analysis prompts (e.g., 150K-char context for the
// litigation-corpus two-pass engine) regularly cross that threshold
// during Anthropic recovery windows or for genuinely large generations.
// With streaming, bytes start flowing within seconds and Cloudflare's
// idle timer never trips. OpenAI and Google requests remain
// non-streaming (Anthropic is the only path exposed to paid-tier and
// the one that hits 524 in practice).
//
// JWT verification: ES256 ONLY (via Supabase's published JWKS endpoint,
// `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). Supabase migrated projects
// to asymmetric JWTs (ECDSA P-256) at the 2026-05-16 cutover; the worker:
//   - Reads the token's `alg` and `kid` header claims.
//   - For ES256: fetches the JWK from Supabase's JWKS endpoint (cached in
//     module memory for 10 minutes), imports the public key, and verifies via
//     Web Crypto's ECDSA P-256 / SHA-256 path.
//   - Any other `alg` (including "none" and HS*, the algorithm-confusion
//     bypasses) is rejected.
// The legacy HS256 fallback (shared `SUPABASE_JWT_SECRET`) was removed once it
// went inert post-cutover; `SUPABASE_JWT_SECRET` is no longer read anywhere.
//
// Env vars required for paid-tier verification:
//   SUPABASE_URL   — already set; reused for JWKS fetch.

var DEFAULT_DEMO_PASSWORD = "Lawfareskunkworks";
var DAILY_QUOTA = 500;
var PER_IP_PER_MIN = 10;
var ANTHROPIC_VERSION = "2023-06-01";
var DEFAULT_MARKUP = 1.35;
// Courtesy deficit policy: the minimum balance below which new paid queries
// are blocked. Negative values let a user run a small deficit before being
// cut off — useful because cost estimates are conservative and small queries
// can land slightly past zero. Default -50¢ (≈ one moderate AMA query of
// over-spend) was chosen empirically: enough to absorb estimate slop but
// small enough that the next top-up clears it. Override via the
// BALANCE_FLOOR_CENTS env binding.
var DEFAULT_BALANCE_FLOOR_CENTS = -50;
var DEFAULT_PER_USER_PER_MIN = 30;

/**
 * Pure paid-budget check. Decides whether a paid user is allowed to start a
 * billed call given their current balance, the floor policy, and the
 * worst-case cost estimate. Replaces the old floor + MAX_SPEND_RATIO logic
 * with a single headroom = balance - floor rule:
 *
 *   - balance < floor                          → empty_balance
 *   - estMaxCents > (balance - floor)          → insufficient_for_estimate
 *   - else                                     → ok, with the headroom value
 *
 * Negative floors implement the courtesy deficit: at floor=-50, a user with
 * balance=0 can run queries up to 50¢ estimated; a user at balance=-30 can
 * run up to 20¢; balance=-51 is blocked.
 *
 * Returns `{ ok: true, headroomCents }` on success, or `{ ok: false, code,
 * message, balanceCents, floorCents, headroomCents, estMaxCents }` on
 * failure. Callers translate the failure into the right HTTP shape.
 */
/**
 * Resolve the return origin for a Stripe Checkout redirect. The frontend
 * passes `return_origin` in the /api/checkout body; we honor it only when
 * it matches a known allowlist (the configured APP_BASE_URL and the
 * standard React dev server hosts). Otherwise we fall back to the
 * configured APP_BASE_URL (production).
 *
 * This is a security boundary — Stripe redirects the user's browser to
 * whatever URL we hand it after checkout, so an unvalidated value could
 * land the user on an attacker-controlled domain with the session id in
 * the query string. The allowlist keeps the surface tight.
 *
 * Pure function (no env mutation, no fetch) so it's testable in isolation.
 */
function pickCheckoutReturnOrigin(requested, env) {
  const fallback = env.APP_BASE_URL || "https://benjaminwittes.github.io/ragtime";
  if (typeof requested !== "string" || !requested) return fallback;
  let origin;
  try {
    const u = new URL(requested);
    origin = u.origin;
  } catch {
    return fallback;
  }
  // Allowlist: the configured production origin (origin only, ignore path)
  // and the standard Vite dev server.
  const allowed = new Set();
  try { allowed.add(new URL(fallback).origin); } catch { /* malformed env */ }
  allowed.add("http://localhost:5173");
  allowed.add("http://127.0.0.1:5173");
  if (!allowed.has(origin)) return fallback;
  // Preserve the requested URL's pathname if the user provided one
  // (e.g. https://benjaminwittes.github.io/ragtime/), but trim any trailing
  // slash so success_url's "/?checkout=..." doesn't double up.
  try {
    const u = new URL(requested);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.origin}${path}`;
  } catch {
    return fallback;
  }
}

function checkPaidBudget({ balanceCents, floorCents, estMaxCents }) {
  if (balanceCents < floorCents) {
    return {
      ok: false,
      code: "empty_balance",
      message: floorCents >= 0
        ? "Your balance is empty. Top up to continue."
        : `Your balance is below the courtesy floor (${(floorCents / 100).toFixed(2)}). Top up to continue.`,
      balanceCents,
      floorCents,
    };
  }
  const headroomCents = balanceCents - floorCents;
  if (estMaxCents > headroomCents) {
    return {
      ok: false,
      code: "insufficient_for_estimate",
      message: `This query could cost up to $${(estMaxCents / 100).toFixed(2)}; your remaining headroom is $${(headroomCents / 100).toFixed(2)}. Top up or refine.`,
      balanceCents,
      floorCents,
      headroomCents,
      estMaxCents,
    };
  }
  return { ok: true, headroomCents };
}
// Off-box pipeline liveness: alert if the newest corpus document is older than
// this many minutes. Generous default — the harvest lane sleeps ~30 min between
// sweeps and backs off on CL rate limits, so a short lull is normal; this
// catches a real outage (fleet down / Mac2 dead), not noise.
var DEFAULT_PIPELINE_STALE_MINUTES = 120;

// ---------------- JWKS cache (module-scope) ----------------
// Lives for the life of one Worker isolate. Refreshed on miss-by-kid
// (handles key rotation) and on TTL expiry.
var jwksCache = null; // { url, keys: [...], expiresAt: epochMs }
var JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

var ENDPOINTS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions"
  // google: built per-model in PROVIDERS.google.buildRequest
};

var ANTHROPIC_RATES = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-7": { input: 15, output: 75 }
};

function lookupAnthropicRates(model) {
  if (ANTHROPIC_RATES[model]) return ANTHROPIC_RATES[model];
  if (/haiku/i.test(model)) return { input: 1, output: 5 };
  if (/sonnet/i.test(model)) return { input: 3, output: 15 };
  if (/opus/i.test(model)) return { input: 15, output: 75 };
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return corsResponse();
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/ask" && request.method === "POST") {
        return await askHandler(request, env, ctx);
      }
      if (path === "/corpus/plan" && request.method === "POST") {
        return await corpusPlanHandler(request, env, ctx);
      }
      if (path === "/corpus/execute" && request.method === "POST") {
        return await corpusExecuteHandler(request, env, ctx);
      }
      if (path === "/corpus/sql" && request.method === "POST") {
        return await corpusSqlHandler(request, env, ctx);
      }
      if (path === "/corpus/cases" && request.method === "POST") {
        return await corpusCasesHandler(request, env, ctx);
      }
      if (path === "/corpus/read-batch" && request.method === "POST") {
        return await corpusReadBatchHandler(request, env, ctx);
      }
      if (path === "/corpus/analyze" && request.method === "POST") {
        return await corpusAnalyzeHandler(request, env, ctx);
      }
      if (path === "/corpus/filter" && request.method === "POST") {
        return await corpusFilterHandler(request, env, ctx);
      }
      if (path === "/corpus/facets" && request.method === "POST") {
        return await corpusFacetsHandler(request, env, ctx);
      }
      if (path === "/corpus/entries" && request.method === "POST") {
        return await corpusEntriesHandler(request, env, ctx);
      }
      if (path === "/api/checkout" && request.method === "POST") {
        return await checkoutHandler(request, env);
      }
      if (path === "/api/stripe/webhook" && request.method === "POST") {
        return await webhookHandler(request, env);
      }
      if (path === "/api/balance" && request.method === "GET") {
        return await balanceHandler(request, env);
      }
      if (path === "/api/account" && request.method === "PATCH") {
        return await updateAccountHandler(request, env);
      }
      return json({ error: { message: "Not found" } }, 404);
    } catch (err) {
      return json({ error: { message: "Internal error: " + (err.message || String(err)) } }, 500);
    }
  },

  // Cron triggers (see wrangler.toml [triggers]). Two schedules:
  //   "0 13 * * 1"    weekly  → billing reconciliation
  //   anything else   frequent→ off-box pipeline liveness check
  async scheduled(event, env, ctx) {
    if (event.cron === "0 13 * * 1") {
      ctx.waitUntil(runReconciliation(env));
    } else {
      ctx.waitUntil(runPipelineLivenessCheck(env));
    }
  }
};

async function askHandler(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const {
    model,
    system,
    messages,
    max_tokens,
    password,
    user_api_key
  } = body || {};
  const provider = (body && body.provider) || "anthropic";
  if (!provider || !PROVIDERS[provider]) {
    return json({ error: { message: "Invalid or missing provider. Expected: anthropic | openai | google" } }, 400);
  }
  if (!model || typeof model !== "string") {
    return json({ error: { message: "Missing or invalid model" } }, 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: { message: "Missing messages" } }, 400);
  }
  const now = new Date();
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;

  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  let authMode;
  let apiKey;
  let userId = null;
  let account = null;

  if (bearerMatch) {
    const jwt = bearerMatch[1];
    const claims = await verifyJwt(jwt, env);
    if (!claims) {
      return json({ error: { message: "Invalid or expired session token. Please sign in again." } }, 401);
    }
    userId = claims.sub;
    // Soft-launch gate: paid tier is limited to allowed users during beta.
    const betaBlocked = await betaGate(env, claims);
    if (betaBlocked) return betaBlocked;
    // Per-account rate limit (paid path): bounds request rate independent of IP.
    const userRateLimited = await checkUserRateLimit(env, ctx, userId, now);
    if (userRateLimited) return userRateLimited;
    if (provider !== "anthropic") {
      return json({ error: {
        message: 'Paid tier currently supports Anthropic only. To use OpenAI or Google, switch to "My API key".'
      } }, 400);
    }
    account = await supabaseGetAccount(env, userId);
    if (!account) {
      return json({ error: { message: "Account not found. This is a server-side issue; please contact support." } }, 500);
    }
    const floor = parseInt(env.BALANCE_FLOOR_CENTS || DEFAULT_BALANCE_FLOOR_CENTS, 10);
    const rates = lookupAnthropicRates(model);
    if (!rates) {
      return json({ error: { message: 'No price configured for model "' + model + '". Contact support.' } }, 400);
    }
    const inputTokensEstimate = estimateInputTokens(system, messages);
    const maxOutputTokens = max_tokens || 4000;
    const estMaxCents = computeCostCents({
      inputTokens: inputTokensEstimate,
      outputTokens: maxOutputTokens,
      rates,
      markup: parseFloat(env.MARKUP || DEFAULT_MARKUP)
    });
    const budget = checkPaidBudget({
      balanceCents: account.balance_cents,
      floorCents: floor,
      estMaxCents,
    });
    if (!budget.ok) {
      return json({ error: {
        message: budget.message,
        code: budget.code,
        balance_cents: budget.balanceCents,
        floor_cents: budget.floorCents,
        ...(budget.code === "insufficient_for_estimate" ? {
          estimated_max_cents: budget.estMaxCents,
          headroom_cents: budget.headroomCents,
        } : {}),
      } }, 402);
    }
    authMode = "paid";
    apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ error: { message: "Worker not configured — ANTHROPIC_API_KEY missing" } }, 500);
  } else if (password) {
    if (provider !== "anthropic") {
      return json({ error: {
        message: 'The demo password only works with Anthropic. To use OpenAI or Google, switch to "My API key".'
      } }, 400);
    }
    const demoPw = env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
    if (!constantTimeEqual(password, demoPw)) {
      return json({ error: { message: "Invalid demo password" } }, 401);
    }
    const dayKey = `quota:demo:${yyyymmdd(now)}`;
    const dayCount = parseInt((await env.QUOTA.get(dayKey)) || "0", 10);
    if (dayCount >= DAILY_QUOTA) {
      return json({ error: {
        message: "Daily demo quota exhausted (500 requests). Try again tomorrow, or supply your own API key."
      } }, 429);
    }
    ctx.waitUntil(env.QUOTA.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }));
    authMode = "demo";
    apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ error: { message: "Worker not configured — ANTHROPIC_API_KEY missing" } }, 500);
  } else if (user_api_key) {
    authMode = "byok";
    apiKey = user_api_key;
  } else {
    return json({ error: { message: "No credentials provided (need Authorization header, password, or user_api_key)" } }, 401);
  }

  const built = PROVIDERS[provider].buildRequest({
    apiKey,
    model,
    system,
    messages,
    max_tokens: max_tokens || 4000
  });
  let upstream;
  try {
    upstream = await fetch(built.url, built.init);
  } catch (err) {
    return json({ error: { message: "Upstream fetch failed: " + err.message } }, 502);
  }
  let data;
  if (provider === "anthropic" && upstream.ok) {
    // v3.2: Anthropic streaming path. The upstream body is SSE; we
    // assemble it server-side into the same JSON shape v3.1 returned
    // from the non-streaming response. See assembleAnthropicStream
    // below for the parsing + accumulation logic and the reason this
    // exists (Cloudflare 524 elimination on long generations).
    try {
      data = await assembleAnthropicStream(upstream);
    } catch (err) {
      return json({ error: {
        message: "Anthropic stream parse failed: " + (err.message || String(err))
      } }, 502);
    }
  } else {
    // Non-streaming path: OpenAI, Google, and any non-OK Anthropic
    // response (errors come back as regular JSON, not SSE).
    const raw = await upstream.text();
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: {
        message: "Provider returned non-JSON (HTTP " + upstream.status + "): " + raw.slice(0, 300)
      } }, 502);
    }
  }
  if (!upstream.ok) {
    const msg = extractErrorMessage(provider, data) || `Provider error ${upstream.status}`;
    return json({ error: { message: msg, provider_status: upstream.status, provider_raw: data } }, upstream.status);
  }
  let normalized;
  try {
    normalized = PROVIDERS[provider].parseResponse(data, model);
  } catch (err) {
    return json({ error: {
      message: "Could not parse " + provider + " response: " + err.message,
      provider_raw: data
    } }, 502);
  }
  if (authMode === "paid") {
    const rates = lookupAnthropicRates(model);
    const inputTokens = (normalized.usage && normalized.usage.input_tokens) || 0;
    const outputTokens = (normalized.usage && normalized.usage.output_tokens) || 0;
    const markup = parseFloat(env.MARKUP || DEFAULT_MARKUP);
    const costCents = computeCostCents({ inputTokens, outputTokens, rates, markup });
    ctx.waitUntil(supabaseDebitBalance(env, userId, costCents, {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      markup,
      provider
    }));
    normalized._cost_cents = costCents;
    normalized._balance_cents = account.balance_cents - costCents;
  }
  return json(normalized, 200);
}

// ================= Corpus AMA (server-side port of the client "Ask" loop) ====
//
// The "Ask" (AMA) flow used to run entirely in index.html: the browser had the
// LLM write SQL, ran it against Supabase via the run_query RPC, and synthesized
// an answer — i.e. an arbitrary-SQL surface lived in the client. These endpoints
// move that loop server-side so the public never authors/sends SQL. The flow is
// two-phase to preserve the paid-mode cost preflight:
//
//   POST /corpus/plan     question + scope  -> planning LLM call (charged) ->
//                         { token, plan-for-display, estimated_cost }. The full
//                         plan (incl. SQL) is stored in KV under `token`; the
//                         client only gets an opaque token + a display copy.
//   POST /corpus/execute  token (+ auth)    -> run the STORED plan's SQL against
//                         the corpus + synthesis LLM call (charged) -> answer.
//
// Executing the SERVER-STORED plan (not client-returned SQL) is what keeps the
// surface closed: a tampered client SQL payload is ignored. run_query is itself
// SELECT-only + statement-timed-out, against the PII-free corpus project.
//
// Litigation-only for now (the v1 faithful port). Multi-corpus (FRUS/OLC schema
// docs + a corpus selector, driven by public.corpora) is an additive follow-up.

async function corpusFetch(env, path, init = {}) {
  if (!env.CORPUS_SUPABASE_URL || !env.CORPUS_SUPABASE_KEY) {
    throw new Error("Corpus Supabase env not configured");
  }
  const url = `${env.CORPUS_SUPABASE_URL.replace(/\/$/, "")}${path}`;
  const headers = {
    apikey: env.CORPUS_SUPABASE_KEY,
    Authorization: `Bearer ${env.CORPUS_SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers || {})
  };
  return fetch(url, { ...init, headers });
}

async function corpusRunQuery(env, sql) {
  const r = await corpusFetch(env, `/rest/v1/rpc/run_query`, {
    method: "POST",
    body: JSON.stringify({ query_text: sql })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`run_query ${r.status}: ${String(t).slice(0, 300)}`);
  }
  return await r.json();
}

// One auto-retry when Postgres returns 57014 (statement_timeout). The corpus
// runs with a 60s ceiling; cold-cache reads on the FTS GIN index can exceed
// that on the first attempt and finish quickly on the second once pages are
// warm. Observed empirically: a Claude-SQL query that times out on click 1
// typically succeeds on click 2. Only callers that can hit unpredictable
// cold-cache shapes use this (Claude SQL + AMA plan/execute); the fixed-shape
// readers (facets, cases, entries) stay on plain corpusRunQuery.
async function withStatementTimeoutRetry(fn, maxAttempts = 2) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!String(e && e.message).includes("57014")) throw e;
    }
  }
  throw lastErr;
}

// Per-IP rate limit shared by the corpus endpoints. Returns a 429 Response when
// over the limit, else null. (Public fetch endpoints use this alone; the LLM
// endpoints use it via resolveCorpusAuth.)
//
// Authed users (valid Supabase JWT) bypass the cap. The IP cap exists to bound
// anonymous abuse — signed-in users are already bounded by the per-account cap
// on the paid path and have an identity we can revoke if needed. Without this
// bypass, legitimate parallel flows blow past 10/min on the first big action:
// the Read button fires 4 parallel batches × ~25 cases each, so any Read over
// ~250 cases (10 batches) is guaranteed to trip the ceiling.
//
// Two ways to present the JWT for bypass:
//   - Authorization: Bearer <jwt>  — used by the paid path (also drives auth
//     resolution for /ask + /corpus/*; see resolveCorpusAuth)
//   - X-Session-Token: <jwt>       — used by signed-in users on demo / BYOK,
//     where the body-level credential (`password` / `user_api_key`) wins for
//     auth/billing, but the user still has a verifiable identity. Read here
//     ONLY for anti-abuse; it does NOT confer paid-mode credentials.
async function checkIpRateLimit(request, env, ctx) {
  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && (await verifyJwt(bearerMatch[1], env))) return null;
  const sessionTok = request.headers.get("X-Session-Token") || "";
  if (sessionTok && (await verifyJwt(sessionTok, env))) return null;

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipKey = `ip:${ip}:${yyyymmddhhmm(new Date())}`;
  const ipCount = parseInt((await env.QUOTA.get(ipKey)) || "0", 10);
  if (ipCount >= PER_IP_PER_MIN) {
    return json({ error: { message: "Rate limit exceeded (10 req/min per IP)" } }, 429);
  }
  ctx.waitUntil(env.QUOTA.put(ipKey, String(ipCount + 1), { expirationTtl: 120 }));
  return null;
}

// Per-user rate limit on the PAID path. Mirrors checkIpRateLimit but keyed on
// the authenticated account, so one user can't exceed N requests/min even by
// spreading across IPs (the per-IP guard alone wouldn't catch that). The
// prepaid balance already bounds total SPEND; this bounds request RATE — i.e. a
// runaway client loop or scripted abuse. Returns a 429 Response when over the
// limit, else null. Tunable via PER_USER_PER_MIN (default 30).
async function checkUserRateLimit(env, ctx, userId, now = new Date()) {
  const perMin = parseInt(env.PER_USER_PER_MIN || DEFAULT_PER_USER_PER_MIN, 10);
  const key = `user:${userId}:${yyyymmddhhmm(now)}`;
  const count = parseInt((await env.QUOTA.get(key)) || "0", 10);
  if (count >= perMin) {
    return json({ error: {
      message: `Rate limit exceeded (${perMin} requests/min for your account). Please slow down and retry shortly.`,
      code: "user_rate_limited"
    } }, 429);
  }
  ctx.waitUntil(env.QUOTA.put(key, String(count + 1), { expirationTtl: 120 }));
  return null;
}

// Resolve auth for a corpus request that will make >=1 billed model call.
// Mirrors askHandler's auth (IP rate-limit + paid/demo/byok), reusing the same
// standalone helpers. Returns {authMode, apiKey, userId, account} or a Response.
async function resolveCorpusAuth(request, env, ctx, provider, body) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;

  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const claims = await verifyJwt(bearerMatch[1], env);
    if (!claims) return json({ error: { message: "Invalid or expired session token. Please sign in again." } }, 401);
    const betaBlocked = await betaGate(env, claims);
    if (betaBlocked) return betaBlocked;
    if (provider !== "anthropic") {
      return json({ error: { message: 'Paid tier currently supports Anthropic only. To use OpenAI or Google, switch to "My API key".' } }, 400);
    }
    const account = await supabaseGetAccount(env, claims.sub);
    if (!account) return json({ error: { message: "Account not found. This is a server-side issue; please contact support." } }, 500);
    if (!env.ANTHROPIC_API_KEY) return json({ error: { message: "Worker not configured — ANTHROPIC_API_KEY missing" } }, 500);
    return { authMode: "paid", apiKey: env.ANTHROPIC_API_KEY, userId: claims.sub, account };
  }
  const password = body && body.password;
  const userApiKey = body && body.user_api_key;
  if (password) {
    if (provider !== "anthropic") {
      return json({ error: { message: 'The demo password only works with Anthropic. To use OpenAI or Google, switch to "My API key".' } }, 400);
    }
    const demoPw = env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
    if (!constantTimeEqual(password, demoPw)) return json({ error: { message: "Invalid demo password" } }, 401);
    if (!env.ANTHROPIC_API_KEY) return json({ error: { message: "Worker not configured — ANTHROPIC_API_KEY missing" } }, 500);
    return { authMode: "demo", apiKey: env.ANTHROPIC_API_KEY, userId: null, account: null };
  }
  if (userApiKey) {
    return { authMode: "byok", apiKey: userApiKey, userId: null, account: null };
  }
  return json({ error: { message: "No credentials provided (need Authorization header, password, or user_api_key)" } }, 401);
}

// One billed model call. Reuses the same per-call checks + debit askHandler does
// (demo daily quota, paid estMaxCents pre-check + balance debit). Throws an Error
// with .status / .code on failure; returns { text, costCents, balanceCents }.
async function corpusModelCall(env, ctx, auth, params) {
  const { provider, model, system, messages, max_tokens } = params;
  const fail = (msg, status, code) => { const e = new Error(msg); e.status = status; if (code) e.code = code; return e; };

  if (auth.authMode === "demo") {
    const dayKey = `quota:demo:${yyyymmdd(new Date())}`;
    const dayCount = parseInt((await env.QUOTA.get(dayKey)) || "0", 10);
    if (dayCount >= DAILY_QUOTA) throw fail("Daily demo quota exhausted (500 requests). Try again tomorrow, or supply your own API key.", 429);
    ctx.waitUntil(env.QUOTA.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }));
  }
  let rates = null;
  if (auth.authMode === "paid") {
    rates = lookupAnthropicRates(model);
    if (!rates) throw fail('No price configured for model "' + model + '". Contact support.', 400);
    const floor = parseInt(env.BALANCE_FLOOR_CENTS || DEFAULT_BALANCE_FLOOR_CENTS, 10);
    const estMaxCents = computeCostCents({
      inputTokens: estimateInputTokens(system, messages),
      outputTokens: max_tokens || 4000,
      rates,
      markup: parseFloat(env.MARKUP || DEFAULT_MARKUP)
    });
    const budget = checkPaidBudget({
      balanceCents: auth.account.balance_cents,
      floorCents: floor,
      estMaxCents,
    });
    if (!budget.ok) throw fail(budget.message, 402, budget.code);
  }
  // Strip lone UTF-16 surrogates before sending to the provider. The client used
  // to do this (sanitizeForAnthropic) before /ask; now corpus row text reaches
  // the model inside the Worker (synthesis), so the Worker must sanitize.
  const cleanSystem = stripLoneSurrogates(system);
  const cleanMessages = messages.map((m) => ({ role: m.role, content: stripLoneSurrogates(m.content) }));
  const built = PROVIDERS[provider].buildRequest({ apiKey: auth.apiKey, model, system: cleanSystem, messages: cleanMessages, max_tokens: max_tokens || 4000 });
  let upstream;
  try { upstream = await fetch(built.url, built.init); }
  catch (err) { throw fail("Upstream fetch failed: " + err.message, 502); }
  let data;
  if (provider === "anthropic" && upstream.ok) {
    data = await assembleAnthropicStream(upstream);
  } else {
    const raw = await upstream.text();
    try { data = JSON.parse(raw); }
    catch { throw fail("Provider returned non-JSON (HTTP " + upstream.status + "): " + raw.slice(0, 300), 502); }
  }
  if (!upstream.ok) throw fail(extractErrorMessage(provider, data) || `Provider error ${upstream.status}`, upstream.status);
  const normalized = PROVIDERS[provider].parseResponse(data, model);
  let costCents = 0;
  if (auth.authMode === "paid") {
    const inputTokens = (normalized.usage && normalized.usage.input_tokens) || 0;
    const outputTokens = (normalized.usage && normalized.usage.output_tokens) || 0;
    const markup = parseFloat(env.MARKUP || DEFAULT_MARKUP);
    costCents = computeCostCents({ inputTokens, outputTokens, rates, markup });
    ctx.waitUntil(supabaseDebitBalance(env, auth.userId, costCents, {
      model, input_tokens: inputTokens, output_tokens: outputTokens, markup, provider, feature: "corpus_ama"
    }));
    auth.account.balance_cents -= costCents;
  }
  const text = (normalized.content && normalized.content[0] && normalized.content[0].text) || "";
  return { text, costCents, balanceCents: auth.authMode === "paid" ? auth.account.balance_cents : null };
}

function fmtIntJs(n) { return Number(n || 0).toLocaleString("en-US"); }

function stripLoneSurrogates(s) {
  return String(s == null ? "" : s)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")     // high surrogate w/o following low
    .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, "$1"); // low surrogate w/o preceding high
}

function normalizeScope(s) {
  s = s || {};
  let clIds = Array.isArray(s.cl_ids) ? s.cl_ids.map(Number).filter(Number.isFinite) : null;
  if (clIds && clIds.length === 0) clIds = null;
  const scopeSql = (typeof s.scope_sql === "string" && s.scope_sql.trim()) ? s.scope_sql.trim() : null;
  return {
    cl_ids: clIds,
    scope_sql: scopeSql,
    is_full_db: !clIds && !scopeSql,
    count: Number(s.count) || (clIds ? clIds.length : 0),
    description: typeof s.description === "string" && s.description.trim() ? s.description.trim() : ""
  };
}

// ── Ported AMA pure functions (faithful from index.html v9.x) ────────────────
var AMA_SCHEMA_DOC = [
  'TABLE: cases — one row per federal court case.',
  '  cl_id (bigint, PK)            — CourtListener case id; use this to identify a case in your output.',
  '  case_name (text)              — e.g. "United States v. Smith"; FTS-indexed in column "fts" via to_tsvector.',
  '  docket_number (text)          — e.g. "1:25-cv-00123".',
  '  court (text)                  — court code, e.g. dcd, nyed, txsd, ca9.',
  '  date_filed (date)             — case filing date.',
  '  date_terminated (date)        — null if open.',
  '  judge (text)                  — judge name; may be empty.',
  '  cause (text)                  — statutory cause / FRCP basis.',
  '  nature_of_suit (text)         — federal NOS code/label, e.g. "440 Civil Rights".',
  '  jurisdiction_type (text)      — e.g. "Federal Question".',
  '  plaintiff (text)              — plaintiff name(s).',
  '  defendant (text)              — defendant name(s).',
  '  fts (tsvector, generated)     — to_tsvector("english", case_name) — use for case-name FTS.',
  '',
  'TABLE: docket_entries — many rows per case.',
  '  cl_id (bigint, FK→cases.cl_id)',
  '  entry_number (bigint)         — sequential within a case.',
  '  entry_date (text)             — ISO date string.',
  '  description (text)            — entry text.',
  '  court (text)',
  '  fts (tsvector, generated)     — to_tsvector("english", description).',
  '',
  'NOTES:',
  '- Case-level FTS: WHERE cases.fts @@ websearch_to_tsquery(\'english\', \'your search\').',
  '- Entry-level FTS: WHERE docket_entries.fts @@ websearch_to_tsquery(\'english\', \'your search\').',
  '- Use websearch_to_tsquery for natural-language input; supports quotes and OR.',
  '- "Trump II" / current administration: filter by date_filed >= \'2025-01-20\'.',
  '- "Federal agency defendant": defendant ILIKE \'%United States%\' OR defendant ILIKE \'%Department of%\' OR defendant ILIKE \'%Agency%\' (varies — sample first if uncertain).',
  '- Read-only: only SELECT statements are accepted; LIMIT yourself to ≤ 10000 rows per query.'
].join('\n');

function buildPlanningSystem() {
  return [
    'You are the planner for an agentic "ask me anything" tool over a federal litigation database. Your job is to look at a user question and the current scope, then return a JSON plan describing how you would answer it.',
    '',
    'You have access to a Postgres database (read-only) via SELECT queries. Schema:',
    '',
    AMA_SCHEMA_DOC,
    '',
    'Output a single JSON object with these keys (no prose, no code fences):',
    '{',
    '  "output_mode": "list" | "narrative" | "hybrid",',
    '       // list = the question wants a refined set of cases (the field will be narrowed).',
    '       // narrative = the question wants an analytical answer; the field is unchanged.',
    '       // hybrid = both — narrative summary plus a refined list (most aggregate-with-examples questions).',
    '  "approach_summary": "2-4 sentence plan, plain prose, no markdown headers",',
    '  "candor_notes": ["caveats the user should see — e.g. fuzzy semantic categories you defined, sampling, fields you wished existed but don\'t"],',
    '  "queries": [',
    '    {"label": "what this query gathers", "sql": "SELECT ... FROM cases WHERE ... LIMIT 500"},',
    '    ...',
    '  ],',
    '  "estimated_cost_cents": <integer>,',
    '       // your estimate of the synthesis call cost in cents (the planning call is already paid).',
    '       // Synthesis input ≈ all query results in JSON (be honest about size); output ≈ 800-2000 tokens.',
    '       // Anthropic Sonnet pricing × 1.35 markup is roughly: input 0.4¢/1K tokens, output 2¢/1K tokens.',
    '  "wants_synthesis": true',
    '}',
    '',
    'Rules:',
    '- Be ruthlessly economical with queries. Aggregate where possible (COUNT, AVG, group-by) rather than pulling raw rows. Only pull case rows when the user wants a list, and cap to 500 rows in that query unless the user explicitly asked for more.',
    '- For trend questions, prefer one query that groups by year (or month) over many narrow queries.',
    '- For "are X up or down" questions, compare two periods in one query.',
    '- Do NOT plan to read docket-entry text in v9; if a question really needs it, say so in candor_notes ("would benefit from reading entries — not done in v9; consider Read mode after narrowing"). FTS over docket_entries.description is fine for identifying cases by topic.',
    '- PERFORMANCE for narrowed scopes (esp. > 100K cases): FTS-first patterns are dramatically faster. To find docket entries matching some text WITHIN a scope, write "SELECT cl_id FROM scoped_docket_entries WHERE fts @@ ..." rather than joining scoped_cases × scoped_docket_entries first. Postgres can use the FTS GIN index on docket_entries.fts directly; the scope filter then narrows the much smaller FTS result set. Avoid heavy joins of scoped_cases × scoped_docket_entries with an FTS predicate at the join level — those reliably hit the statement timeout on six-figure scopes.',
    '- WHEN THE CURRENT SCOPE IS NARROWED (cl_ids list provided): use the names "scoped_cases" instead of "cases" and "scoped_docket_entries" instead of "docket_entries". The runner substitutes these names with inline subqueries already filtered to the scope. CRITICAL: reference these names ONLY after FROM or JOIN keywords, and DO NOT alias them — write "FROM scoped_cases WHERE cause LIKE ..." (good), not "FROM scoped_cases sc WHERE sc.cause LIKE ..." (will break). To qualify a column, use the unaliased name: "scoped_cases.cl_id" works. WHEN SCOPE IS THE FULL DATABASE: use the regular table names "cases" and "docket_entries" (and you may alias them freely).',
    '- For sampling at top-of-stack, you can use "ORDER BY random()" but be aware that\'s expensive on huge tables; prefer "ORDER BY date_filed DESC" with a LIMIT if you want a recency-biased sample.',
    '- Output strict JSON only. No markdown. No code fences. No prose outside the object.'
  ].join('\n');
}

function buildPlanningUser(question, scope) {
  return [
    'USER QUESTION:',
    question,
    '',
    'CURRENT SCOPE:',
    scope.description || (scope.is_full_db
      ? 'The full database — all federal court cases.'
      : fmtIntJs(scope.count) + ' cases (narrowed).'),
    scope.is_full_db
      ? '(no cl_id constraint — your queries run against the full database; use table names "cases" and "docket_entries")'
      : '(narrowed to ' + fmtIntJs(scope.count) + ' cl_ids; the runner will pre-define CTEs named scoped_cases and scoped_docket_entries — use THOSE names in your queries)',
    '',
    'Return the JSON plan now.'
  ].join('\n');
}

function extractFirstJsonObject(s) {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

function parsePlan(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) {
      try { v = JSON.parse(firstObj); }
      catch (pe2) { throw new Error('JSON.parse error: ' + pe2.message); }
    } else {
      throw new Error('could not find a JSON object in the response.');
    }
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('top-level value is not an object.');
  if (['list', 'narrative', 'hybrid'].indexOf(v.output_mode) < 0) throw new Error('output_mode must be list, narrative, or hybrid.');
  if (!Array.isArray(v.queries)) throw new Error('queries must be an array.');
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  v.estimated_cost_cents = Math.max(0, Math.round(Number(v.estimated_cost_cents) || 0));
  v.approach_summary = String(v.approach_summary || '').trim();
  return v;
}

var SQL_FOLLOW_KEYWORDS = 'WHERE|ON|USING|JOIN|LEFT|RIGHT|FULL|INNER|CROSS|OUTER|NATURAL|LATERAL|ORDER|GROUP|HAVING|LIMIT|OFFSET|FETCH|FOR|UNION|INTERSECT|EXCEPT|AND|OR|WINDOW|RETURNING';
function substituteScoped(sqlIn, name, body) {
  const pattern = new RegExp(
    '(\\b(?:FROM|JOIN)\\s+)' + name + '\\b' +
      '(?:\\s+AS\\s+(\\w+)|\\s+(?!(?:' + SQL_FOLLOW_KEYWORDS + ')\\b)(\\w+))?',
    'gi'
  );
  return sqlIn.replace(pattern, function (match, fromOrJoin, asAlias, bareAlias) {
    const alias = asAlias || bareAlias || name;
    return fromOrJoin + body + ' AS ' + alias;
  });
}

// Run the stored plan's SQL against the corpus, substituting scoped_* table
// names with inline scope-filtered subqueries. Faithful port of executeAmaPlan.
async function executeCorpusPlan(env, plan, scope) {
  const SCOPE_LITERAL_LIMIT = 25000;
  let scopeIdsSubquery = '';
  if (scope.cl_ids && scope.cl_ids.length > 0 && scope.cl_ids.length <= SCOPE_LITERAL_LIMIT) {
    // Small narrowed scope: inline the cl_id list as an array literal.
    scopeIdsSubquery = "SELECT unnest('{" + scope.cl_ids.join(',') + "}'::bigint[]) AS cl_id";
  } else if (scope.scope_sql) {
    // Large narrowed scope: the client sends the source page's SQL instead of
    // tens of thousands of ids. Strip ORDER BY / LIMIT (useless for an IN check).
    scopeIdsSubquery = String(scope.scope_sql)
      .replace(/\s+ORDER\s+BY[\s\S]*?(?=(?:\s+LIMIT|\s*$))/i, '')
      .replace(/\s+LIMIT\s+\d+\s*$/i, '')
      .trim();
  } else if (scope.cl_ids && scope.cl_ids.length > SCOPE_LITERAL_LIMIT) {
    throw new Error('Scope is ' + fmtIntJs(scope.cl_ids.length) + ' cases — too large to inline and no scope_sql provided. Narrow further or rerun the source filter.');
  }
  // else: full database — no scoping applied.
  const scopedCasesBody = scopeIdsSubquery
    ? '(SELECT c.* FROM cases c WHERE c.cl_id IN (' + scopeIdsSubquery + '))'
    : null;
  const scopedEntriesBody = scopeIdsSubquery
    ? '(SELECT d.* FROM docket_entries d WHERE d.cl_id IN (' + scopeIdsSubquery + '))'
    : null;

  const results = [];
  for (let i = 0; i < plan.queries.length; i++) {
    const q = plan.queries[i];
    let sql = String(q.sql || '').trim().replace(/;\s*$/, '').trim();
    if (!sql) continue;
    let execSql = sql;
    if (scopedCasesBody) {
      execSql = substituteScoped(execSql, 'scoped_cases', scopedCasesBody);
      execSql = substituteScoped(execSql, 'scoped_docket_entries', scopedEntriesBody);
    }
    if (!/^\s*SELECT\b/i.test(execSql)) execSql = 'SELECT * FROM (' + execSql + ') AS ama_q';
    let rows;
    // One auto-retry on 57014 — AMA SQL is LLM-generated against the same
    // cold-cache-prone FTS surface as Claude SQL. See withStatementTimeoutRetry.
    try { rows = await withStatementTimeoutRetry(() => corpusRunQuery(env, execSql)); }
    catch (err) { throw new Error('Query "' + (q.label || ('query ' + (i + 1))) + '" failed: ' + err.message); }
    const truncated = (rows.length > 500) ? rows.slice(0, 500) : rows;
    results.push({ label: q.label || ('query ' + (i + 1)), sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 500 });
  }
  return results;
}

function buildSynthesisSystem(outputMode) {
  const listClause = (outputMode === 'list' || outputMode === 'hybrid')
    ? '"cl_ids": [<bigint>, ...]   // the cl_ids the user should see; pulled from your query results.'
    : '"cl_ids": null';
  return [
    'You are the synthesis step for an agentic AMA over a federal litigation database. The planner has already run the SQL queries you proposed; you now have the question, the plan, and the query results. Write the user-facing answer.',
    '',
    'Output a single JSON object (no prose, no code fences) with these keys:',
    '{',
    '  "answer_markdown": "...",  // markdown narrative; embed [case-ref:CL_ID] tokens to cite specific cases.',
    '  ' + listClause + ',',
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    '}',
    '',
    'Rules:',
    '- LEAD with caveats when your confidence is materially lower than the user might assume. “Of a sample of 500...” is a different sentence from “All cases in the system show...”',
    '- For list and hybrid output_modes, cl_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable cases, downgrade to narrative mode and explain.',
    '- When citing a case, use the form [case-ref:12345] inline in the markdown — the UI replaces it with a clickable link.',
    '- Be tight. The user wants an answer, not a methodology essay. Keep candor_notes for caveats.',
    '- Output strict JSON only. No markdown outside answer_markdown. No code fences.',
    '- CRITICAL: inside answer_markdown, do NOT use straight double quotes (") — they break JSON parsing when not escaped. Use curly quotes (“”) for direct quotation, or single quotes (‘’ or \') for short inline quotation. Apostrophes (\') are fine. If you absolutely must use a straight double quote, escape it as \\".'
  ].join('\n');
}

function buildSynthesisUser(question, plan, results) {
  const resultsForModel = results.map(function (r) {
    return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated, rows: r.rows };
  });
  return [
    'USER QUESTION:',
    question,
    '',
    'YOUR PLAN (from the planning step):',
    plan.approach_summary,
    '',
    'PLANNED OUTPUT MODE: ' + plan.output_mode,
    '',
    'CANDOR NOTES FROM PLANNING:',
    (plan.candor_notes && plan.candor_notes.length) ? plan.candor_notes.map(function (n) { return '- ' + n; }).join('\n') : '(none)',
    '',
    'QUERY RESULTS (JSON):',
    JSON.stringify(resultsForModel, null, 2),
    '',
    'Return the synthesis JSON now.'
  ].join('\n');
}

function repairAnswerMarkdownQuotes(raw) {
  const s = String(raw);
  const startMatch = s.match(/"answer_markdown"\s*:\s*"/);
  if (!startMatch) return s;
  const startIdx = startMatch.index + startMatch[0].length;
  const tail = s.slice(startIdx);
  let lastIdx = -1;
  const probe = /"(\s*,\s*"(?:cl_ids|candor_notes)"|\s*\})/g;
  let m;
  while ((m = probe.exec(tail)) !== null) lastIdx = m.index;
  if (lastIdx < 0) return s;
  const content = tail.slice(0, lastIdx);
  const repaired = content.replace(/(?<!\\)"/g, '\\"');
  return s.slice(0, startIdx) + repaired + tail.slice(lastIdx);
}

function parseSynthesis(raw, outputMode) {
  const cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    try {
      const repaired = repairAnswerMarkdownQuotes(cleaned);
      if (repaired !== cleaned) { v = JSON.parse(repaired); }
      else { throw pe; }
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) {
          try { v = JSON.parse(repairAnswerMarkdownQuotes(firstObj)); }
          catch (pe4) { throw new Error('JSON.parse error: ' + pe4.message); }
        }
      } else {
        throw new Error('could not find a JSON object.');
      }
    }
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('top-level value is not an object.');
  if (typeof v.answer_markdown !== 'string' || !v.answer_markdown.trim()) throw new Error('answer_markdown is empty.');
  if (outputMode === 'list' || outputMode === 'hybrid') {
    if (!Array.isArray(v.cl_ids) || v.cl_ids.length === 0) {
      v.cl_ids = [];
      v.candor_notes = (v.candor_notes || []).concat(['Output mode requested a case list but synthesis returned none — showing narrative only.']);
    } else {
      v.cl_ids = v.cl_ids.map(function (x) { return Number(x); }).filter(function (x) { return Number.isFinite(x); });
    }
  } else {
    v.cl_ids = null;
  }
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

// Phase 1: plan. Charges one model call; stores the full plan in KV under an
// opaque token; returns a display copy + the cost estimate for the preflight.
async function corpusPlanHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const question = String((body && body.question) || "").trim();
  if (!question) return json({ error: { message: "Missing question" } }, 400);
  const scope = normalizeScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildPlanningSystem(),
      messages: [{ role: "user", content: buildPlanningUser(question, scope) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Planning step: " + e.message, code: e.code } }, e.status || 502);
  }
  let plan;
  try { plan = parsePlan(res.text); }
  catch (e) { return json({ error: { message: "Could not parse plan: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const token = crypto.randomUUID();
  await env.QUOTA.put("plan:" + token, JSON.stringify({
    plan, scope, question, provider, model, userId: auth.userId, authMode: auth.authMode
  }), { expirationTtl: 900 });

  return json({
    token,
    output_mode: plan.output_mode,
    approach_summary: plan.approach_summary,
    candor_notes: plan.candor_notes,
    // Display copy only — /corpus/execute runs the SERVER-STORED plan, so a
    // tampered client SQL payload has no effect.
    queries: plan.queries.map(function (q) { return { label: q.label, sql: q.sql }; }),
    estimated_cost_cents: plan.estimated_cost_cents,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// Phase 2: execute. Loads the stored plan, runs its SQL against the corpus, and
// charges one synthesis call. One-shot: the token is consumed (delete) to
// prevent replay/double-charge.
async function corpusExecuteHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const token = body && body.token;
  if (!token || typeof token !== "string") return json({ error: { message: "Missing plan token" } }, 400);
  const stored = await env.QUOTA.get("plan:" + token);
  if (!stored) return json({ error: { message: "Plan expired or not found — re-run the question.", code: "plan_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored plan is corrupt — re-run the question." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider, body);
  if (auth instanceof Response) return auth;
  // A paid plan may only be executed by the same account that planned it.
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This plan belongs to a different session. Re-run the question." } }, 403);
  }
  // Consume the token now (one-shot) to prevent replay / double-charge.
  ctx.waitUntil(env.QUOTA.delete("plan:" + token));

  let results;
  try { results = await executeCorpusPlan(env, blob.plan, blob.scope); }
  catch (e) { return json({ error: { message: e.message, code: "execute_failed" } }, 400); }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 4000 : 6000
    });
  } catch (e) {
    return json({ error: { message: "Synthesis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let synth;
  try { synth = parseSynthesis(res.text, blob.plan.output_mode); }
  catch (e) { return json({ error: { message: "Could not parse synthesis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    answer_markdown: synth.answer_markdown,
    cl_ids: synth.cl_ids,
    candor_notes: synth.candor_notes,
    output_mode: blob.plan.output_mode,
    query_summary: results.map(function (r) { return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated }; }),
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── Slice 2: AI-writes-SQL ("AI writes SQL" button) ─────────────────────────
// Single LLM call that turns a natural-language request into ONE SELECT
// returning cl_ids; the Worker runs it against the corpus, applies the scope,
// and returns the matched ids + a display page. Faithful port of the client
// applyClaudeSql; scope is now applied in SQL (server-side) rather than via a
// client-side JS intersection. CLAUDE_MAX_RAW_ROWS cap preserved.
var CLAUDE_MAX_RAW_ROWS = 200000;
var SQL_DISPLAY_COLS = "cl_id, docket_number, case_name, date_filed, date_terminated, judge, cause, nature_of_suit, plaintiff, defendant, entry_count, cl_url, court";

function stripOrderLimit(sql) {
  return String(sql)
    .replace(/\s+ORDER\s+BY[\s\S]*?(?=(?:\s+LIMIT|\s*$))/i, '')
    .replace(/\s+LIMIT\s+\d+\s*$/i, '')
    .trim();
}

function buildSqlGenSystem(scope) {
  var scopeDesc = scope.is_full_db
    ? 'ALL ' + fmtIntJs(scope.count) + ' cases in the database (no pre-filter applied).'
    : 'a pre-filtered set of ' + fmtIntJs(scope.count) + ' cases'
      + (scope.description ? ' (' + scope.description + ')' : '')
      + '. Your query runs WITHIN this scope — the application restricts cl_id to this set '
      + 'automatically before executing your SQL. Write your query as if it ran across the '
      + 'full database; the scope filter is applied for you.';

  var schema = [
    "DATABASE: PostgreSQL. Queries run read-only.",
    "USE PostgreSQL syntax: ILIKE for case-insensitive matching, || for concat.",
    "",
    "CURRENT SCOPE: " + scopeDesc,
    "",
    "TABLE cases (",
    "  cl_id BIGINT PRIMARY KEY,",
    "  docket_number TEXT,         -- e.g. '1:25-cv-12345'; civil=-cv-, criminal=-cr-, magistrate=-mj-, misc=-mc-",
    "  case_name TEXT,             -- short caption like 'Smith v. Garland'; usually NOT a good place to search for topics",
    "  date_filed DATE,",
    "  court TEXT,                 -- lowercase codes like 'dcd' (DC District), 'ca9' (9th Circuit), 'cadc' (DC Circuit)",
    "  judge TEXT,",
    "  cause TEXT,                 -- statutory cause of action, e.g. '5 U.S.C. § 702 Administrative Procedure Act', '28:2241 Habeas Corpus'",
    "  nature_of_suit TEXT,        -- NOS code/description, e.g. '530 Habeas Corpus (General)', '463 Habeas Corpus - Alien Detainee'",
    "  -- NOTE: plaintiff and defendant exist on this table but are NULL for ~99.5% of cases.",
    "  -- DO NOT write SQL against them. Use case_name (caption) for party-name searches and",
    "  -- the FTS index on docket_entries.fts for agency/official queries.",
    "  entry_count INT,",
    "  cl_url TEXT",
    ")",
    "",
    "TABLE docket_entries (",
    "  id BIGSERIAL PRIMARY KEY,",
    "  cl_id BIGINT REFERENCES cases,",
    "  entry_number INT,",
    "  entry_date TEXT,",
    "  description TEXT,           -- text of motions, orders, opinions, complaints — the substantive content",
    "  court TEXT,",
    "  fts TSVECTOR                -- precomputed full-text index on description (use this for topical search)",
    ")",
    "",
    "TABLE documents (",
    "  id BIGSERIAL PRIMARY KEY,",
    "  cl_id BIGINT REFERENCES cases,",
    "  entry_number INT,",
    "  doc_number INT,",
    "  text_content TEXT,          -- extracted document text (large; use sparingly)",
    "  text_length INT",
    ")"
  ].join("\n");

  return "You are a SQL query generator for a federal litigation research tool. Given a natural-language description of cases the user wants to find, produce ONE PostgreSQL query that returns the cl_id values of matching cases.\n\n" +
    "CRITICAL OUTPUT RULES:\n" +
    "- Return JSON only: {\"sql\": \"...\", \"label\": \"a short 5-10 word description of what this query finds\"}\n" +
    "- No markdown, no code fences, no explanation outside the JSON.\n" +
    "- The query MUST be a single SELECT.\n" +
    "- The query MUST return cl_id (other columns are fine, but cl_id is required).\n" +
    "- Do NOT include LIMIT or OFFSET — the application handles pagination.\n" +
    "- Do NOT add a scope constraint (e.g. cl_id IN (...)) — scope is applied automatically.\n\n" +
    "FUNDAMENTAL RULES (read these FIRST — most failures come from violating them):\n" +
    "1. RECALL OVER PRECISION. The user can always narrow further with a follow-up operation; they cannot un-miss a case the query excluded. When in doubt, return more, not less.\n" +
    "2. NEVER 'AND' a metadata filter with an FTS filter. Combine them with OR. Example of the failure:\n" +
    "     BAD:  WHERE (case_name ILIKE '%immigration%') AND (cl_id IN (SELECT cl_id FROM docket_entries WHERE fts @@ ...))\n" +
    "     GOOD: WHERE (case_name ILIKE '%immigration%') OR (cl_id IN (SELECT cl_id FROM docket_entries WHERE fts @@ ...))\n" +
    "   Reason: case_name is a short caption like 'Doe v. Garland'; topical words rarely appear there. ANDing kills recall.\n" +
    "3. FOR ANY TOPICAL OR CONCEPTUAL QUERY, FTS IS REQUIRED. If the user asks about a topic, agency, concept, or substance ('immigration detention', 'TROs', 'DHS challenges', 'APA suits'), your query MUST contain at least one FTS branch on docket_entries. Metadata-only queries on case_name/cause/NOS will under-match by an order of magnitude.\n" +
    "4. AVOID SHORT-ACRONYM ILIKE PATTERNS. '%ICE%' matches notice/service/voice/evidence/police/officer/justice. '%DHS%' is safer but still risky. Use FTS for acronyms — it does whole-token matching.\n" +
    "5. Reserve ILIKE for unambiguous full phrases ('%Department of Homeland Security%') or proper names ('%Mayorkas%', '%Noem%').\n" +
    "6. case_name is rarely informative for topical queries. It's a caption like 'Doe v. Garland', not a description of what the case is about. Don't lean on it.\n" +
    "7. cause and nature_of_suit are coded fields. A habeas immigration case has cause '28:2241 Habeas Corpus' and NOS '530 Habeas Corpus' or '463 Habeas - Alien Detainee' — NOT 'immigration'. Don't filter on metadata words that won't be there.\n" +
    "8. AGENCY AND OFFICIAL QUERIES GO THROUGH FTS, NOT METADATA. The plaintiff and defendant columns are NULL for ~99.5% of cases — do not use them. For agency/official queries, use FTS on docket_entries (which catches both agency-as-defendant cases and cases where the agency or official is mentioned in motion text), and optionally OR with case_name ILIKE for proper-name captions like 'Mayorkas' or 'Noem'.\n" +
    "9. SCOPE-AWARE ENRICHMENT — CHECK BEFORE OR-ING METADATA. Look at the CURRENT SCOPE description above. Before adding any `OR <metadata-condition>` branch, ask: would this condition match every case in the current scope? If yes, DO NOT add it. An OR branch that's true for the whole scope is a tautology — it makes your FTS branch irrelevant and your query returns the entire scope. Common traps:\n" +
    "   - Scope is 'habeas cases', and you add `OR nature_of_suit ILIKE '%habeas%'` → returns ALL habeas cases (the whole scope).\n" +
    "   - Scope is 'immigration cases', and you add `OR cause ILIKE '%immigration%'` → returns the whole immigration scope.\n" +
    "   - Scope is 'cases in DCD', and you add `OR court = 'dcd'` → returns the whole DCD scope.\n" +
    "   When the scope already constrains a field, that field cannot be used for enrichment. Use FTS only, OR enrich via fields the scope hasn't constrained.\n\n" +
    "QUERY-DESIGN PATTERNS:\n" +
    "- FTS syntax: cl_id IN (SELECT DISTINCT cl_id FROM docket_entries WHERE fts @@ websearch_to_tsquery('english', 'TERMS'))\n" +
    "  websearch_to_tsquery supports 'OR', quoted phrases, and 'and'. Example: 'detention OR removal OR \"final order of removal\"'.\n" +
    "- For agency/official queries, OR-combine: (case_name ILIKE proper-names) OR (FTS for acronyms and concepts on docket_entries).\n" +
    "- For topical queries, FTS is the workhorse; metadata filters are optional ENRICHMENT (added with OR), never RESTRICTION (added with AND).\n" +
    "- Use websearch_to_tsquery's 'OR' operator generously. 'detention OR custody OR confined OR removal OR deportation' will catch many phrasings of the same idea.\n\n" +
    "WORKED EXAMPLE 1 — agency/official query:\n" +
    "User: 'cases challenging DHS or ICE actions'\n" +
    "Good SQL:\n" +
    "  SELECT cl_id FROM cases WHERE\n" +
    "      case_name ILIKE '%Mayorkas%'\n" +
    "      OR case_name ILIKE '%Noem%'\n" +
    "      OR cl_id IN (SELECT DISTINCT cl_id FROM docket_entries\n" +
    "                   WHERE fts @@ websearch_to_tsquery('english',\n" +
    "                       'DHS OR ICE OR \"Department of Homeland Security\" OR \"Immigration and Customs Enforcement\" OR \"Homeland Security\" OR Mayorkas OR Noem'))\n" +
    "Why it works: FTS on docket_entries is the workhorse — it catches the agency name, acronyms, and official names wherever they appear in motion or order text. The case_name OR-branches add proper-name captions on top. Note: we do NOT touch plaintiff/defendant — they're empty for ~99.5% of cases.\n\n" +
    "WORKED EXAMPLE 2 — topical/conceptual query:\n" +
    "User: 'cases involving immigration detention'\n" +
    "Good SQL:\n" +
    "  SELECT cl_id FROM cases WHERE\n" +
    "      cl_id IN (SELECT DISTINCT cl_id FROM docket_entries\n" +
    "                WHERE fts @@ websearch_to_tsquery('english',\n" +
    "                    '\"immigration detention\" OR \"removal proceedings\" OR \"final order of removal\" OR \"ICE custody\" OR \"asylum\" OR \"deportation\"'))\n" +
    "      OR nature_of_suit ILIKE '%alien detainee%'\n" +
    "Why it works: Leads with FTS (the workhorse for topical queries). Metadata branch is OR'd, not AND'd — it ENRICHES rather than RESTRICTS.\n\n" +
    "ANTI-EXAMPLE (DO NOT DO THIS):\n" +
    "User: 'immigration detention cases'\n" +
    "BAD SQL:\n" +
    "  SELECT cl_id FROM cases WHERE\n" +
    "      (case_name ILIKE '%immigration%' OR cause ILIKE '%immigration%' OR nature_of_suit ILIKE '%immigration%')\n" +
    "      AND cl_id IN (SELECT cl_id FROM docket_entries WHERE fts @@ websearch_to_tsquery('english', 'immigration detention'))\n" +
    "Why it fails: ANDing a fragile metadata filter with FTS wipes out the FTS recall. Returns near-zero rows.\n\n" + schema;
}

function parseSqlGen(raw) {
  var cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  var v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    var firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) v = JSON.parse(firstObj);
    else throw new Error('did not return valid JSON (response may have been truncated).');
  }
  if (typeof v !== 'object' || v === null) throw new Error('top-level value is not an object.');
  return v;
}

async function corpusSqlHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const prompt = String((body && body.prompt) || "").trim();
  if (!prompt) return json({ error: { message: "Missing prompt" } }, 400);
  const scope = normalizeScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  // 1) LLM generates {sql, label}
  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildSqlGenSystem(scope),
      messages: [{ role: "user", content: "USER REQUEST:\n" + prompt + "\n\nReturn ONLY the JSON object." }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Query design step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseSqlGen(res.text); }
  catch (e) { return json({ error: { message: "Could not parse the generated query: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }
  const generatedSql = String(parsed.sql || "").trim();
  const label = String(parsed.label || prompt.slice(0, 50)).trim();
  if (!generatedSql) return json({ error: { message: "The model did not return a SQL query." } }, 502);

  // 2) Sanitize (strip trailing ;, LIMIT, OFFSET) and apply scope in SQL.
  const sanitized = generatedSql.replace(/;\s*$/g, "").replace(/\bLIMIT\s+\d+\b/gi, "").replace(/\bOFFSET\s+\d+\b/gi, "").trim();
  let scopeClause = "";
  if (scope.scope_sql) {
    scopeClause = " WHERE sub.cl_id IN (" + stripOrderLimit(scope.scope_sql) + ")";
  } else if (scope.cl_ids && scope.cl_ids.length > 0) {
    scopeClause = " WHERE sub.cl_id IN (SELECT unnest('{" + scope.cl_ids.join(",") + "}'::bigint[]))";
  }
  const idsSql = "SELECT DISTINCT sub.cl_id FROM (" + sanitized + ") AS sub" + scopeClause;

  // 3) Run it against the corpus; cap the result set. One auto-retry on
  // statement_timeout (57014) — see withStatementTimeoutRetry for rationale.
  let idRows;
  try { idRows = await withStatementTimeoutRetry(() => corpusRunQuery(env, idsSql)); }
  catch (e) { return json({ error: { message: "The generated query failed: " + e.message, code: "query_failed", generated_sql: generatedSql } }, 400); }
  if (idRows.length > CLAUDE_MAX_RAW_ROWS) {
    return json({ error: { message: "The query matched " + idRows.length.toLocaleString("en-US") + " cases (cap is " + CLAUDE_MAX_RAW_ROWS.toLocaleString("en-US") + "). Try a more specific prompt.", code: "too_many_rows" } }, 400);
  }
  const matched = idRows.map((r) => r.cl_id).filter((x) => x != null);

  // 4) Fetch display rows for the first 10k by date (from the live corpus).
  let displayRows = [];
  if (matched.length > 0) {
    const displaySql = "SELECT " + SQL_DISPLAY_COLS + " FROM cases WHERE cl_id IN (" + matched.join(",") + ") ORDER BY date_filed DESC NULLS LAST LIMIT 10000";
    try { displayRows = await corpusRunQuery(env, displaySql); }
    catch (e) { return json({ error: { message: "Fetching display rows failed: " + e.message } }, 502); }
  }

  return json({
    generated_sql: generatedSql,
    label,
    cl_ids: matched,
    count: matched.length,
    display_rows: displayRows,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── Slice 3: parameterized fetch + Read ("Read cases" button) ───────────────
// "Read cases" reviews each case's docket entries against a criterion (keep/drop
// + reason). The long batched/parallel orchestration stays in the browser (it's
// pure coordination, no SQL, and a minutes-long single Worker request would hit
// Cloudflare's ~100s edge timeout). What moves server-side: the data fetches
// (no client run_query) and the per-batch LLM call + prompt (the domain logic).
var CLAUDE_READ_MAX_ENTRIES_PER_CASE = 30;
var CLAUDE_READ_MAX_ENTRY_CHARS = 600;

function extractFirstJsonArray(s) {
  const start = s.indexOf("[");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
    else if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

// Parameterized display-row fetch by cl_id. Public corpus data (no creds), so
// just IP-rate-limited. Reusable: Read's result page, the AMA display-row fetch,
// Analyze. The Worker builds the SQL — the client only sends ids.
async function corpusCasesHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const ids = Array.isArray(body && body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  if (ids.length === 0) return json({ rows: [] }, 200);
  if (ids.length > 30000) return json({ error: { message: "Too many ids (max 30000)" } }, 400);
  const sql = "SELECT " + SQL_DISPLAY_COLS + " FROM cases WHERE cl_id IN (" + ids.join(",") +
              ") ORDER BY date_filed DESC NULLS LAST LIMIT 30000";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Fetch failed: " + e.message } }, 502); }
  return json({ rows }, 200);
}

function buildReadBlock(caseRow, entries) {
  const meta = [
    'cl_id: ' + caseRow.cl_id,
    'case_name: ' + (caseRow.case_name || ''),
    'court: ' + (caseRow.court || '') + ' · judge: ' + (caseRow.judge || '—') +
      ' · cause: ' + (caseRow.cause || '—') + ' · NOS: ' + (caseRow.nature_of_suit || '—') +
      ' · filed: ' + (caseRow.date_filed || '—')
  ].join('\n');
  const entryLines = entries.map((e) => {
    let desc = String(e.description || '').replace(/\s+/g, ' ').trim();
    if (desc.length > CLAUDE_READ_MAX_ENTRY_CHARS) desc = desc.slice(0, CLAUDE_READ_MAX_ENTRY_CHARS) + '…';
    return '#' + (e.entry_number != null ? e.entry_number : '?') + ' (' + (e.entry_date || '?') + '): ' + desc;
  });
  const entriesBlock = entryLines.length > 0
    ? 'DOCKET ENTRIES (' + entryLines.length + ', newest first):\n' + entryLines.join('\n')
    : 'DOCKET ENTRIES: (none available)';
  return meta + '\n' + entriesBlock;
}

function buildReadSystem(n) {
  return "You are reviewing federal court cases against a user-supplied criterion. " +
    "For each case, decide keep/drop based ONLY on the docket entries shown.\n\n" +
    "OUTPUT: a JSON array. One element per case, in input order. Each element has shape:\n" +
    '  {"cl_id": <int>, "keep": <true|false>, "reason": "<= 25 word explanation>"}\n\n' +
    "RULES:\n" +
    "- Be conservative. If the entries do not clearly support keeping the case under the criterion, drop it with a reason explaining what's missing or insufficient.\n" +
    "- The 'reason' field must be 25 words or fewer.\n" +
    "- 'keep' is a literal boolean (true/false), not a string.\n" +
    "- Output the JSON array only. No markdown, no code fences, no prose outside the array.\n" +
    "- Return exactly " + n + " elements, one per case.";
}

function buildReadUser(criterion, queue) {
  const parts = ['USER CRITERION:\n' + criterion + '\n\nCASES (n=' + queue.length + '):\n'];
  queue.forEach((item, i) => parts.push('--- CASE ' + (i + 1) + ' ---\n' + item.block));
  parts.push('\nReturn the JSON array now.');
  return parts.join('\n\n');
}

function parseReadBatch(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let arr;
  try { arr = JSON.parse(cleaned); }
  catch (pe) {
    const firstArr = extractFirstJsonArray(cleaned);
    if (firstArr) arr = JSON.parse(firstArr);
    else throw new Error('did not return a valid JSON array (may be truncated).');
  }
  if (!Array.isArray(arr)) throw new Error('response was not a JSON array.');
  const out = {};
  arr.forEach((item) => {
    if (item && item.cl_id != null) out[item.cl_id] = { keep: !!item.keep, reason: String(item.reason || '').slice(0, 300) };
  });
  return out;
}

// One Read batch: fetch the batch's case metadata + top-N entries, auto-drop
// cases with no entries, run ONE LLM keep/drop call on the rest, and return a
// verdict for every requested cl_id. The browser drives the batching loop.
async function corpusReadBatchHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const criterion = String((body && body.criterion) || "").trim();
  if (!criterion) return json({ error: { message: "Missing criterion" } }, 400);
  const clIds = Array.isArray(body && body.cl_ids) ? body.cl_ids.map(Number).filter(Number.isFinite) : [];
  if (clIds.length === 0) return json({ verdicts: [], _cost_cents: 0 }, 200);
  if (clIds.length > 100) return json({ error: { message: "Batch too large (max 100 cl_ids)" } }, 400);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let caseRows, entryRows;
  try {
    caseRows = await corpusRunQuery(env, "SELECT cl_id, case_name, court, judge, cause, nature_of_suit, date_filed FROM cases WHERE cl_id IN (" + clIds.join(",") + ")");
    entryRows = await corpusRunQuery(env,
      "SELECT cl_id, entry_number, entry_date, description FROM (" +
      "  SELECT cl_id, entry_number, entry_date, description, ROW_NUMBER() OVER (PARTITION BY cl_id ORDER BY entry_number DESC) AS rn" +
      "  FROM docket_entries WHERE cl_id IN (" + clIds.join(",") + ")" +
      ") sub WHERE rn <= " + CLAUDE_READ_MAX_ENTRIES_PER_CASE);
  } catch (e) {
    return json({ error: { message: "Fetching case data failed: " + e.message } }, 502);
  }
  const caseById = {};
  caseRows.forEach((r) => { caseById[r.cl_id] = r; });
  const entriesById = {};
  entryRows.forEach((r) => { (entriesById[r.cl_id] = entriesById[r.cl_id] || []).push(r); });

  const verdicts = {};
  const queue = [];
  for (const id of clIds) {
    const caseRow = caseById[id];
    if (!caseRow) { verdicts[id] = { keep: false, reason: "case row not found in database" }; continue; }
    const entries = (entriesById[id] || []).sort((a, b) => (b.entry_number || 0) - (a.entry_number || 0));
    if (entries.length === 0) { verdicts[id] = { keep: false, reason: "no docket entries available to analyze" }; continue; }
    queue.push({ cl_id: id, block: buildReadBlock(caseRow, entries) });
  }

  let cost = 0, bal = (auth.account ? auth.account.balance_cents : null);
  if (queue.length > 0) {
    let res;
    try {
      res = await corpusModelCall(env, ctx, auth, {
        provider, model,
        system: buildReadSystem(queue.length),
        messages: [{ role: "user", content: buildReadUser(criterion, queue) }],
        max_tokens: 4000
      });
    } catch (e) {
      return json({ error: { message: "Read step: " + e.message, code: e.code } }, e.status || 502);
    }
    let parsed;
    try { parsed = parseReadBatch(res.text); }
    catch (e) { return json({ error: { message: "Could not parse read verdicts: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }
    for (const item of queue) {
      verdicts[item.cl_id] = parsed[item.cl_id] || { keep: false, reason: "no judgment returned" };
    }
    cost = res.costCents; bal = res.balanceCents;
  }

  return json({
    verdicts: clIds.map((id) => ({ cl_id: id, keep: verdicts[id].keep, reason: verdicts[id].reason })),
    _cost_cents: cost,
    _balance_cents: bal
  }, 200);
}

// ── Slice 4: Analyze ("Analyze" button) ─────────────────────────────────────
// One-shot analysis over the whole field (≤ a sane cap): read all cases in one
// LLM call and produce a markdown narrative + optional per-case annotations
// (rank/score/category/label). Fully server-side — it's a single call, so there's
// no client orchestration. corpusModelCall streams Worker→Anthropic (same 524
// avoidance /ask uses for the long 32k-token output). Does NOT narrow the field.
var CLAUDE_ANALYSIS_MAX_ENTRIES_PER_CASE = 15;
var CLAUDE_ANALYSIS_MAX_ENTRY_CHARS = 400;
var CLAUDE_ANALYSIS_OUTPUT_TOKENS = 32000;
var CLAUDE_ANALYSIS_HARD_CAP = 2000; // server guard; beyond this the context won't fit anyway

function buildAnalysisBlock(caseRow, entries) {
  const meta = [
    'cl_id: ' + caseRow.cl_id,
    'case_name: ' + (caseRow.case_name || ''),
    'docket: ' + (caseRow.docket_number || '') + ' · court: ' + (caseRow.court || '') +
      ' · judge: ' + (caseRow.judge || '—') + ' · cause: ' + (caseRow.cause || '—') +
      ' · NOS: ' + (caseRow.nature_of_suit || '—') + ' · filed: ' + (caseRow.date_filed || '—')
  ].join('\n');
  const entryLines = entries.map((e) => {
    let desc = String(e.description || '').replace(/\s+/g, ' ').trim();
    if (desc.length > CLAUDE_ANALYSIS_MAX_ENTRY_CHARS) desc = desc.slice(0, CLAUDE_ANALYSIS_MAX_ENTRY_CHARS) + '…';
    return '#' + (e.entry_number != null ? e.entry_number : '?') + ' (' + (e.entry_date || '?') + '): ' + desc;
  });
  const entriesBlock = entryLines.length > 0
    ? 'DOCKET ENTRIES (' + entryLines.length + '):\n' + entryLines.join('\n')
    : 'DOCKET ENTRIES: (none available)';
  return meta + '\n' + entriesBlock;
}

function buildAnalysisSystem() {
  return "You are an analyst reviewing a set of federal court cases. The user has a question or analytical task. Read the cases and produce:\n" +
    "1. A markdown document presenting your analysis.\n" +
    "2. Optional per-case annotations as a JSON array.\n\n" +
    "OUTPUT FORMAT — JSON OBJECT ONLY. No markdown fences, no prose outside the JSON.\n" +
    '{\n' +
    '  "markdown": "<your analysis as a markdown document>",\n' +
    '  "annotations": [ { "cl_id": <int>, "rank"?: <int>, "score"?: <number>, "category"?: <string>, "label"?: <string> }, ... ]\n' +
    '}\n\n' +
    "MARKDOWN AUTHORING RULES:\n" +
    "- Reference cases using the exact syntax: [Case Name (docket)](#case-<cl_id>).\n" +
    "  Example: [Doe v. Garland (1:25-cv-12345)](#case-67890123). The link target MUST be #case- followed by the cl_id.\n" +
    "- Use ## for major section headers, ### for subsections.\n" +
    "- Be concrete. Cite specific cases when making points; abstract generalities without case references are weak.\n" +
    "- Don't list every case — that's what the table below your analysis already does. Use case references to highlight examples.\n" +
    "- Write in plain analytical prose. No throat-clearing, no \"in this analysis I will…\" — start with the substance.\n\n" +
    "ANNOTATIONS RULES:\n" +
    "- Include annotations only if the user's prompt calls for ranking, scoring, classifying, or labeling individual cases.\n" +
    "- 'rank' is 1-indexed; 1 = highest/most. If you rank, every case gets a unique rank.\n" +
    "- 'score' is a numeric value (any range; the user defines its meaning).\n" +
    "- 'category' is a short label (≤80 chars). 'label' is a one-line characterization (≤120 chars).\n" +
    "- Include annotations only for cases you actually rank/categorize. Don't pad.\n" +
    "- If the user's prompt is purely descriptive ('what patterns do you see'), you may omit annotations entirely (annotations: []).";
}

function buildAnalysisUser(prompt, blocks) {
  const parts = ['ANALYTICAL PROMPT:\n' + prompt + '\n\nCASES (n=' + blocks.length + '):\n'];
  blocks.forEach((item, i) => parts.push('--- CASE ' + (i + 1) + ' ---\n' + item.block));
  parts.push('\nReturn the JSON object now.');
  return parts.join('\n\n');
}

function parseAnalysis(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) parsed = JSON.parse(firstObj);
    else throw new Error('did not return valid JSON (may be truncated).');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('response was not an object.');
  const markdown = String(parsed.markdown || '').trim();
  const annotationsArr = Array.isArray(parsed.annotations) ? parsed.annotations : [];
  const annotations = {};
  annotationsArr.forEach((a) => {
    if (a && a.cl_id != null) {
      const entry = {};
      if (a.rank != null) entry.rank = Number(a.rank);
      if (a.score != null) entry.score = Number(a.score);
      if (a.category != null) entry.category = String(a.category).slice(0, 80);
      if (a.label != null) entry.label = String(a.label).slice(0, 120);
      annotations[a.cl_id] = entry;
    }
  });
  return { markdown, annotations };
}

async function corpusAnalyzeHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const prompt = String((body && body.prompt) || "").trim();
  if (!prompt) return json({ error: { message: "Missing prompt" } }, 400);
  const clIds = Array.isArray(body && body.cl_ids) ? body.cl_ids.map(Number).filter(Number.isFinite) : [];
  if (clIds.length === 0) return json({ error: { message: "No cases in scope" } }, 400);
  if (clIds.length > CLAUDE_ANALYSIS_HARD_CAP) {
    return json({ error: { message: "Too many cases for one-shot analysis (" + clIds.length.toLocaleString("en-US") + "; cap " + CLAUDE_ANALYSIS_HARD_CAP.toLocaleString("en-US") + "). Narrow the field first.", code: "too_many_cases" } }, 400);
  }

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  // Fetch display rows (also used for the context) + top-N entries per case.
  let caseRows, entryRows;
  try {
    caseRows = await corpusRunQuery(env, "SELECT " + SQL_DISPLAY_COLS + " FROM cases WHERE cl_id IN (" + clIds.join(",") + ") ORDER BY date_filed DESC NULLS LAST");
    entryRows = await corpusRunQuery(env,
      "SELECT cl_id, entry_number, entry_date, description FROM (" +
      "  SELECT cl_id, entry_number, entry_date, description, ROW_NUMBER() OVER (PARTITION BY cl_id ORDER BY entry_number DESC) AS rn" +
      "  FROM docket_entries WHERE cl_id IN (" + clIds.join(",") + ")" +
      ") sub WHERE rn <= " + CLAUDE_ANALYSIS_MAX_ENTRIES_PER_CASE);
  } catch (e) {
    return json({ error: { message: "Fetching case data failed: " + e.message } }, 502);
  }
  const entriesById = {};
  entryRows.forEach((r) => { (entriesById[r.cl_id] = entriesById[r.cl_id] || []).push(r); });
  Object.keys(entriesById).forEach((k) => entriesById[k].sort((a, b) => (b.entry_number || 0) - (a.entry_number || 0)));

  const blocks = caseRows.map((r) => ({ block: buildAnalysisBlock(r, entriesById[r.cl_id] || []) }));

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildAnalysisSystem(),
      messages: [{ role: "user", content: buildAnalysisUser(prompt, blocks) }],
      max_tokens: CLAUDE_ANALYSIS_OUTPUT_TOKENS
    });
  } catch (e) {
    return json({ error: { message: "Analysis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseAnalysis(res.text); }
  catch (e) { return json({ error: { message: "Could not parse analysis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }
  if (!parsed.markdown) return json({ error: { message: "The model returned no narrative analysis." } }, 502);

  return json({
    markdown: parsed.markdown,
    annotations: parsed.annotations,
    cases: caseRows,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── #12: manual filter ("Filter manually" button) ──────────────────────────
// The browser used to build this SQL and run it via run_query against the frozen
// app project — and a broad filter (e.g. Civil ≈ 485k rows) blew the 60s
// statement_timeout. Now the browser sends structured filter FIELDS; the Worker
// builds the WHERE (escaped/validated, using the indexed case-type expression)
// and queries the corpus. Public (free local search uses this) → IP-rate-limited.
// Returns count + cl_ids + a display page + the executed SQL (the latter is the
// scope source the LLM flows already use for >25k scopes). Option A: still
// materializes the id set (corpus + index keeps the worst case under 60s); the
// scope-as-SQL page-model rework is a separate, larger follow-on.
function escSqlLit(s) { return String(s == null ? "" : s).replace(/'/g, "''"); }

function buildFilterWhere(fields, scope) {
  const parts = [];
  if (scope) {
    if (scope.cl_ids && scope.cl_ids.length > 0) {
      parts.push("cl_id IN (SELECT unnest('{" + scope.cl_ids.join(",") + "}'::bigint[]))");
    } else if (scope.scope_sql) {
      parts.push("cl_id IN (" + stripOrderLimit(scope.scope_sql) + ")");
    }
  }
  if (fields.search) {
    parts.push("cl_id IN (SELECT DISTINCT cl_id FROM docket_entries WHERE fts @@ websearch_to_tsquery('english', '" + escSqlLit(fields.search) + "'))");
  }
  if (fields.collection) {
    parts.push("cl_id IN (SELECT cc.cl_id FROM collection_cases cc JOIN collections c ON c.id = cc.collection_id WHERE c.slug = '" + escSqlLit(fields.collection) + "')");
  }
  if (fields.name) parts.push("case_name ILIKE '%" + escSqlLit(fields.name) + "%'");
  if (!fields.allCourts) {
    const courts = Array.isArray(fields.courts) ? fields.courts : [];
    if (courts.length === 0) parts.push("1=0");
    else parts.push("court IN (" + courts.map((c) => "'" + escSqlLit(c) + "'").join(",") + ")");
  }
  if (fields.judge) parts.push("judge = '" + escSqlLit(fields.judge) + "'");
  if (fields.caseType && ["cv", "cr", "mj", "mc"].includes(String(fields.caseType))) {
    // Indexed expression (idx_cases_casetype_date) — replaces the old
    // leading-wildcard LIKE that forced a full scan.
    parts.push("substring(docket_number from '-(cv|cr|mj|mc)-') = '" + String(fields.caseType) + "'");
  }
  if (fields.cause) parts.push("(cause ILIKE '%" + escSqlLit(fields.cause) + "%' OR nature_of_suit ILIKE '%" + escSqlLit(fields.cause) + "%')");
  if (fields.from && /^\d{4}-\d{2}-\d{2}$/.test(fields.from)) parts.push("date_filed >= '" + fields.from + "'");
  if (fields.to && /^\d{4}-\d{2}-\d{2}$/.test(fields.to)) parts.push("date_filed <= '" + fields.to + "'");
  return parts.length > 0 ? " WHERE " + parts.join(" AND ") : "";
}

async function corpusFilterHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const fields = (body && body.fields) || {};
  const scope = normalizeScope(body && body.scope);
  const where = buildFilterWhere(fields, scope.is_full_db ? null : scope);
  // No ORDER BY on the id-set query — ordering a set is pointless and forces a
  // sort of the whole match set. The display query keeps it (for the paged view).
  const idsSql = "SELECT cl_id FROM cases" + where;
  const rowsSql = "SELECT " + SQL_DISPLAY_COLS + " FROM cases" + where + " ORDER BY date_filed DESC NULLS LAST LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "Filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const clIds = idRows.map((r) => r.cl_id).filter((x) => x != null);
  return json({
    cl_ids: clIds,
    display_rows: rows,
    count: clIds.length,
    generated_sql: rowsSql,
    executed_sql: idsSql
  }, 200);
}

// ── #13 fetch-cleanup: the last fixed-shape corpus reads, off the client ─────
// These move the remaining client run_query calls (page-load facets, the
// case-detail entries view) onto the corpus via the Worker. Public, IP-rate-
// limited. With these + /corpus/cases, index.html no longer issues any
// run_query (the corpus sbClient drops to auth-only).

// Page-load facets: counts + the court/judge/collection dropdowns, in one call.
// Counts use pg_class.reltuples (instant) instead of COUNT(*) — the live COUNT(*)
// over ~6.7M docket_entries was the worst page-load timeout offender.
// Loose index scan (recursive CTE) for DISTINCT <col> over cases — jumps between
// distinct values via the btree index instead of a full-table scan (a plain
// DISTINCT cold-reads all ~1M rows: ~11s; this is ~30ms). Wrapped in
// SELECT * FROM (...) so run_query's SELECT-only guard accepts the WITH RECURSIVE.
function distinctViaIndex(col) {
  return "SELECT v FROM (WITH RECURSIVE t AS (" +
    "(SELECT " + col + " AS v FROM cases WHERE " + col + " IS NOT NULL AND " + col + " <> '' ORDER BY " + col + " LIMIT 1) " +
    "UNION ALL SELECT (SELECT " + col + " FROM cases WHERE " + col + " > t.v AND " + col + " IS NOT NULL AND " + col + " <> '' ORDER BY " + col + " LIMIT 1) " +
    "FROM t WHERE t.v IS NOT NULL) SELECT v FROM t WHERE v IS NOT NULL) z ORDER BY v";
}

async function corpusFacetsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  try {
    const stats = await corpusRunQuery(env,
      "SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.cases'::regclass) AS case_count, " +
      "(SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.docket_entries'::regclass) AS entry_count, " +
      "(SELECT MAX(last_synced_at)::date::text FROM cases) AS last_synced");
    const courts = await corpusRunQuery(env, distinctViaIndex("court"));
    const judges = await corpusRunQuery(env, distinctViaIndex("judge"));
    const collections = await corpusRunQuery(env, "SELECT slug, name FROM collections ORDER BY name");
    const s = stats[0] || {};
    return json({
      case_count: s.case_count, entry_count: s.entry_count,
      court_count: courts.length, last_synced: s.last_synced,
      courts: courts.map((r) => r.v),
      judges: judges.map((r) => r.v),
      collections: collections.map((r) => ({ slug: r.slug, name: r.name }))
    }, 200);
  } catch (e) {
    return json({ error: { message: "Facets fetch failed: " + e.message } }, 502);
  }
}

// Docket entries for one case (the case-detail view).
async function corpusEntriesHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const clId = Number(body && body.cl_id);
  if (!Number.isFinite(clId)) return json({ error: { message: "Missing or invalid cl_id" } }, 400);
  try {
    const rows = await corpusRunQuery(env,
      "SELECT entry_number, entry_date, description FROM docket_entries WHERE cl_id = " + clId +
      " ORDER BY entry_number LIMIT 10000");
    return json({ entries: rows }, 200);
  } catch (e) {
    return json({ error: { message: "Entries fetch failed: " + e.message } }, 502);
  }
}

async function checkoutHandler(request, env) {
  const userId = await requireAuth(request, env);
  if (userId instanceof Response) return userId;
  // Soft-launch gate: only allowed users can buy credit during beta.
  const betaBlocked = await betaGate(env, userId);
  if (betaBlocked) return betaBlocked;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const block = String((body && body.block) || "").trim();
  const priceId = {
    "5": env.STRIPE_PRICE_5_USD,
    "20": env.STRIPE_PRICE_20_USD,
    "50": env.STRIPE_PRICE_50_USD
  }[block];
  if (!priceId) {
    return json({ error: { message: "Invalid block size. Choose 5, 20, or 50." } }, 400);
  }
  let account = await supabaseGetAccount(env, userId);
  if (!account) {
    return json({ error: { message: "Account not found." } }, 500);
  }
  let customerId = account.stripe_customer_id;
  if (!customerId) {
    const email = await supabaseGetUserEmail(env, userId);
    const cust = await stripeApi(env, "POST", "/v1/customers", {
      email,
      "metadata[supabase_user_id]": userId
    });
    if (cust.error) {
      return json({ error: { message: "Stripe customer creation failed: " + cust.error.message } }, 502);
    }
    customerId = cust.id;
    await supabaseUpdateAccount(env, userId, { stripe_customer_id: customerId });
  }
  // Pick the return-origin for the Stripe redirect. Default is APP_BASE_URL
  // (production), but the client can request a different origin via
  // `return_origin` — useful for the React dev server. We only honor values
  // that match a known allowlist so a tampered request can't redirect the
  // user to an attacker-controlled site post-checkout.
  const baseUrl = pickCheckoutReturnOrigin(body && body.return_origin, env);
  const session = await stripeApi(env, "POST", "/v1/checkout/sessions", {
    mode: "payment",
    customer: customerId,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[user_id]": userId,
    "metadata[block]": block,
    success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?checkout=cancel`
  });
  if (session.error) {
    return json({ error: { message: "Stripe checkout creation failed: " + session.error.message } }, 502);
  }
  return json({ checkout_url: session.url, session_id: session.id });
}

// Best-effort ops alert to Slack (incoming-webhook URL in SLACK_ALERT_WEBHOOK_URL).
// Never throws and no-ops when the secret is unset, so it can't affect request
// handling or break before the secret is configured.
async function notify(env, text) {
  const url = env.SLACK_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: RAGtime alert — ${text}` })
    });
  } catch (e) {
    console.error("notify (Slack) failed:", e && e.message);
  }
}

// Weekly billing reconciliation (Cron Trigger → scheduled()). Calls the
// reconcile_balances() RPC; if any account's balance_cents disagrees with the
// sum of its ledger rows, Slack-alerts with the drift. Also alerts on run
// errors. No "all clear" heartbeat (keeps noise down — Cloudflare's cron logs
// confirm it executed); add one here if you want a weekly positive confirmation.
async function runReconciliation(env) {
  try {
    const r = await supabaseFetch(env, `/rest/v1/rpc/reconcile_balances`, {
      method: "POST",
      body: JSON.stringify({})
    });
    if (!r.ok) {
      await notify(env, `reconciliation cron FAILED to run: ${r.status} ${String(await r.text()).slice(0, 200)}`);
      return;
    }
    const drift = await r.json();
    if (Array.isArray(drift) && drift.length > 0) {
      const lines = drift.slice(0, 20).map(
        (d) => `• user=${d.user_id} balance=${d.balance_cents}c ledger=${d.ledger_sum}c diff=${d.diff}c`
      ).join("\n");
      const more = drift.length > 20 ? `\n…and ${drift.length - 20} more` : "";
      await notify(env,
        `balance reconciliation DRIFT — ${drift.length} account(s) where balance != sum(ledger):\n${lines}${more}`
      );
    }
  } catch (e) {
    await notify(env, `reconciliation cron error: ${e && e.message}`);
  }
}

// Off-box pipeline liveness (frequent Cron Trigger → scheduled()). The data
// pipeline + its watchdog run ON Mac2, so they can't detect Mac2 itself dying.
// This check runs on Cloudflare — fully off-box — and Slack-alerts if the corpus
// has stopped receiving new documents, which is the externally-visible symptom
// of the fleet/harvester (or the whole box) being down. Pure decision logic is
// factored into pipelineStaleness() so it's unit-testable without network.
function pipelineStaleness(latestIso, nowMs, staleMinutes) {
  if (!latestIso) return { stale: true, ageMinutes: null };
  const t = new Date(latestIso).getTime();
  if (!Number.isFinite(t)) return { stale: true, ageMinutes: null };
  const ageMinutes = Math.floor((nowMs - t) / 60000);
  return { stale: ageMinutes > staleMinutes, ageMinutes };
}

async function runPipelineLivenessCheck(env) {
  const staleMinutes = parseInt(env.PIPELINE_STALE_MINUTES || DEFAULT_PIPELINE_STALE_MINUTES, 10);
  let rows;
  try {
    // documents.created_at is the most active ingest heartbeat (the harvest lane
    // writes continuously for weeks of backlog; Pass-2 also writes here).
    // Read it via PostgREST, NOT run_query: that RPC's guard rejects any query
    // text containing "create" as a substring, which "created_at" trips — a probe
    // that can't run its own query is useless as a liveness check.
    const r = await corpusFetch(env, "/rest/v1/documents?select=created_at&order=created_at.desc&limit=1");
    if (!r.ok) {
      throw new Error(`documents read ${r.status}: ${String(await r.text()).slice(0, 300)}`);
    }
    rows = await r.json();
  } catch (e) {
    await notify(env, `pipeline liveness: could not query the corpus (${e && e.message}). Worker→corpus path or the corpus DB may be down.`);
    return;
  }
  const latestIso = Array.isArray(rows) && rows[0] ? rows[0].created_at : null;
  const { stale, ageMinutes } = pipelineStaleness(latestIso, Date.now(), staleMinutes);
  if (stale) {
    const age = ageMinutes == null ? "unknown (no documents found)" : `${ageMinutes} min ago`;
    await notify(env,
      `pipeline liveness: newest corpus document is ${age} (alert threshold ${staleMinutes} min). ` +
      `Ingestion may be down — check the api/pass2 fleet + free-text harvester on Mac2.`
    );
  }
}

async function webhookHandler(request, env) {
  const sig = request.headers.get("Stripe-Signature") || "";
  const rawBody = await request.text();
  const valid = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response("Invalid signature", { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const seen = await supabaseHasProcessedEvent(env, event.id);
  if (seen) {
    return new Response("Already processed", { status: 200 });
  }
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = (session.metadata && session.metadata.user_id) || null;
      const amountTotal = session.amount_total;
      if (!userId) {
        await supabaseRecordProcessedEvent(env, event.id, event.type);
        return new Response("Missing user_id metadata; ignored", { status: 200 });
      }
      await supabaseCreditBalance(env, userId, amountTotal, {
        stripe_session_id: session.id,
        payment_intent_id: session.payment_intent,
        block: session.metadata && session.metadata.block
      });
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const refunded = charge.amount_refunded;
      const userId = await supabaseFindUserByPaymentIntent(env, charge.payment_intent);
      if (userId) {
        await supabaseRefundBalance(env, userId, refunded, {
          stripe_charge_id: charge.id,
          payment_intent_id: charge.payment_intent
        });
      }
    } else if (event.type === "charge.dispute.created") {
      // Chargeback: the cardholder disputed a charge. Per the payment spec,
      // debit the disputed amount immediately and alert Ben. This is the
      // conservative choice (remove credit while the dispute is open); if the
      // dispute is later WON, Ben re-credits manually (he's alerted). A future
      // refinement could auto-handle charge.dispute.closed (re-credit on won).
      const dispute = event.data.object;
      const amount = dispute.amount; // disputed amount, cents
      const paymentIntent = dispute.payment_intent;
      const userId = await supabaseFindUserByPaymentIntent(env, paymentIntent);
      if (userId) {
        await supabaseChargebackDebit(env, userId, amount, {
          stripe_dispute_id: dispute.id,
          stripe_charge_id: dispute.charge,
          payment_intent_id: paymentIntent,
          reason: dispute.reason
        });
        console.error(
          `ALERT chargeback: dispute=${dispute.id} user=${userId} ` +
          `amount_cents=${amount} reason=${dispute.reason} status=${dispute.status} ` +
          `— balance debited; re-credit manually if won`
        );
        await notify(env,
          `chargeback: user=${userId} amount=$${(amount / 100).toFixed(2)} ` +
          `reason=${dispute.reason} — balance debited; re-credit manually if you win the dispute`
        );
      } else {
        // Couldn't tie the dispute to a user (e.g., charge predates the ledger).
        // Don't fail the webhook — log loudly for manual handling.
        console.error(
          `ALERT chargeback: dispute=${dispute.id} payment_intent=${paymentIntent} ` +
          `amount_cents=${amount} — NO matching user found; manual review needed`
        );
        await notify(env,
          `chargeback with NO matching user: dispute=${dispute.id} amount=$${(amount / 100).toFixed(2)} ` +
          `— needs manual review`
        );
      }
    }
    await supabaseRecordProcessedEvent(env, event.id, event.type);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook handler error:", err);
    await notify(env, `webhook handler error: ${err && err.message} — payment event not recorded (Stripe will retry)`);
    return new Response("Handler error: " + err.message, { status: 500 });
  }
}

async function balanceHandler(request, env) {
  const userId = await requireAuth(request, env);
  if (userId instanceof Response) return userId;
  const account = await supabaseGetAccount(env, userId);
  if (!account) {
    return json({ error: { message: "Account not found." } }, 500);
  }
  const ledger = await supabaseGetRecentLedger(env, userId, 50);
  return json({
    balance_cents: account.balance_cents,
    per_query_cap_cents: account.per_query_cap_cents,
    ledger
  });
}

async function updateAccountHandler(request, env) {
  const userId = await requireAuth(request, env);
  if (userId instanceof Response) return userId;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const update = {};
  if (typeof body.per_query_cap_cents === "number") {
    if (body.per_query_cap_cents < 50 || body.per_query_cap_cents > 50000) {
      return json({ error: { message: "per_query_cap_cents must be between 50 ($0.50) and 50000 ($500)." } }, 400);
    }
    update.per_query_cap_cents = body.per_query_cap_cents;
  }
  if (Object.keys(update).length === 0) {
    return json({ error: { message: "No valid fields to update." } }, 400);
  }
  await supabaseUpdateAccount(env, userId, update);
  return json({ updated: update });
}

async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return json({ error: { message: "Missing Authorization header." } }, 401);
  }
  const claims = await verifyJwt(match[1], env);
  if (!claims) {
    return json({ error: { message: "Invalid or expired session token." } }, 401);
  }
  return claims.sub;
}

// ---------------- JWT verification (v3.1: ES256 + HS256 fallback) ----------------

async function verifyJwt(token, env) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64UrlDecodeToString(headerB64));
    payload = JSON.parse(b64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }

  // Common claim sanity checks (alg-independent).
  if (!payload.sub) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigBytes = b64UrlDecodeToBytes(sigB64);

  // ES256 ONLY. Supabase signs session JWTs with its asymmetric (ES256) key
  // since the 2026-05-16 cutover; the legacy HS256 path (verified with a shared
  // SUPABASE_JWT_SECRET) has been inert ever since (the secret is unset, so it
  // already returned null) and is removed here to keep the verifier to a single
  // accepted algorithm. Any other alg — including "none" and HS*, the classic
  // algorithm-confusion bypasses — falls through to the reject below.
  let ok = false;
  try {
    if (header.alg === "ES256") {
      const jwk = await getSupabaseJwk(env, header.kid);
      if (!jwk) {
        console.error("verifyJwt: no JWK matched kid", header.kid);
        return null;
      }
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      ok = await crypto.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        key,
        sigBytes,
        signingInput
      );
    } else {
      console.error("verifyJwt: unsupported alg", header.alg);
      return null;
    }
  } catch (err) {
    console.error("verifyJwt: crypto error", err && err.message);
    return null;
  }

  if (!ok) return null;
  return payload;
}

async function getSupabaseJwk(env, kid) {
  if (!kid) return null;
  const supabaseUrl = (env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) {
    console.error("getSupabaseJwk: SUPABASE_URL not set");
    return null;
  }
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;

  // Cache hit?
  if (jwksCache && jwksCache.url === jwksUrl && jwksCache.expiresAt > Date.now()) {
    const hit = jwksCache.keys.find((k) => k.kid === kid);
    if (hit) return hit;
    // kid not in cache — could be a fresh rotation; fall through and refresh.
  }

  let resp;
  try {
    resp = await fetch(jwksUrl, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("getSupabaseJwk: fetch failed", err && err.message);
    return null;
  }
  if (!resp.ok) {
    console.error("getSupabaseJwk: HTTP", resp.status);
    return null;
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    console.error("getSupabaseJwk: non-JSON response");
    return null;
  }
  const keys = data && Array.isArray(data.keys) ? data.keys : [];
  jwksCache = {
    url: jwksUrl,
    keys,
    expiresAt: Date.now() + JWKS_CACHE_TTL_MS
  };
  return keys.find((k) => k.kid === kid) || null;
}

// ---------------- Stripe helpers ----------------

async function verifyStripeSignature(body, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(",").reduce((acc, p) => {
    const idx = p.indexOf("=");
    if (idx > 0) acc[p.slice(0, idx)] = p.slice(idx + 1);
    return acc;
  }, {});
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = new TextEncoder().encode(`${t}.${body}`);
  const sigBuf = await crypto.subtle.sign("HMAC", key, data);
  const expected = bufToHex(sigBuf);
  return constantTimeEqual(expected, v1);
}

async function stripeApi(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  const url = `https://api.stripe.com${path}`;
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
  };
  let bodyStr = null;
  if (params) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    bodyStr = new URLSearchParams(params).toString();
  }
  const resp = await fetch(url, { method, headers, body: bodyStr });
  const data = await resp.json();
  if (!resp.ok) {
    return { error: { message: (data.error && data.error.message) || `HTTP ${resp.status}` }, raw: data };
  }
  return data;
}

// ---------------- Supabase helpers ----------------

async function supabaseFetch(env, path, init = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env not configured");
  }
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}${path}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers || {})
  };
  return fetch(url, { ...init, headers });
}

async function supabaseGetAccount(env, userId) {
  const r = await supabaseFetch(
    env,
    `/rest/v1/accounts?user_id=eq.${encodeURIComponent(userId)}&select=user_id,stripe_customer_id,balance_cents,per_query_cap_cents`
  );
  if (!r.ok) throw new Error(`Supabase getAccount failed: ${r.status}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function supabaseGetUserEmail(env, userId) {
  const r = await supabaseFetch(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`);
  if (!r.ok) return null;
  const u = await r.json();
  return u.email || null;
}

// ---------------- Beta access gate (soft launch) ----------------
// During the limited beta, the PAID tier is restricted: a user is allowed if
// their email is on an allowed domain (BETA_ALLOW_DOMAINS, default
// "lawfaremedia.org") OR listed in public.beta_allowlist (which Ben edits via
// the Supabase dashboard Table Editor). The free demo-password and BYO-key
// paths are NOT gated. Enforced in askHandler (paid branch) and checkoutHandler.

async function resolveUserEmail(env, claims) {
  // Prefer the email claim (no extra request); fall back to the admin API.
  if (claims && claims.email) return String(claims.email).toLowerCase();
  if (claims && claims.sub) {
    const e = await supabaseGetUserEmail(env, claims.sub);
    return e ? e.toLowerCase() : null;
  }
  return null;
}

function emailDomainAllowed(env, email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  const allowed = (env.BETA_ALLOW_DOMAINS || "lawfaremedia.org")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(domain);
}

async function emailInAllowlist(env, email) {
  const r = await supabaseFetch(
    env,
    `/rest/v1/beta_allowlist?email=eq.${encodeURIComponent(email)}&select=email&limit=1`
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Returns null when the user is allowed, or a 403 Response when not.
// Accepts either the verified JWT claims (preferred — carries `email`) or a
// bare userId string (falls back to an admin email lookup).
async function betaGate(env, claimsOrUserId) {
  const claims =
    typeof claimsOrUserId === "string" ? { sub: claimsOrUserId } : claimsOrUserId;
  const email = await resolveUserEmail(env, claims);
  if (email && (emailDomainAllowed(env, email) || (await emailInAllowlist(env, email)))) {
    return null;
  }
  return json(
    {
      error: {
        message:
          "RAGtime is in limited beta and your account isn't on the access list yet. If you think this is a mistake, contact the Lawfare team.",
        code: "not_in_beta"
      }
    },
    403
  );
}

async function supabaseUpdateAccount(env, userId, patch) {
  const r = await supabaseFetch(env, `/rest/v1/accounts?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error(`Supabase updateAccount failed: ${r.status} ${await r.text()}`);
}

async function supabaseGetRecentLedger(env, userId, limit) {
  const r = await supabaseFetch(
    env,
    `/rest/v1/ledger?user_id=eq.${encodeURIComponent(userId)}&select=id,amount_cents,kind,metadata,created_at&order=created_at.desc&limit=${limit}`
  );
  if (!r.ok) throw new Error(`Supabase getRecentLedger failed: ${r.status}`);
  return await r.json();
}

async function supabaseCreditBalance(env, userId, amountCents, metadata) {
  const r = await supabaseFetch(env, `/rest/v1/rpc/apply_balance_change`, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_amount_cents: amountCents,
      p_kind: "purchase",
      p_metadata: metadata
    })
  });
  if (!r.ok) throw new Error(`creditBalance failed: ${r.status} ${await r.text()}`);
}

async function supabaseRefundBalance(env, userId, amountCents, metadata) {
  const r = await supabaseFetch(env, `/rest/v1/rpc/apply_balance_change`, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_amount_cents: -Math.abs(amountCents),
      p_kind: "refund",
      p_metadata: metadata
    })
  });
  if (!r.ok) throw new Error(`refundBalance failed: ${r.status} ${await r.text()}`);
}

// Chargeback debit. Recorded as kind 'adjustment' (distinct from a voluntary
// 'refund') with a chargeback marker, so the ledger keeps a clean audit trail.
async function supabaseChargebackDebit(env, userId, amountCents, metadata) {
  const r = await supabaseFetch(env, `/rest/v1/rpc/apply_balance_change`, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_amount_cents: -Math.abs(amountCents),
      p_kind: "adjustment",
      p_metadata: { ...metadata, kind_detail: "chargeback" }
    })
  });
  if (!r.ok) throw new Error(`chargebackDebit failed: ${r.status} ${await r.text()}`);
}

async function supabaseDebitBalance(env, userId, amountCents, metadata) {
  const r = await supabaseFetch(env, `/rest/v1/rpc/apply_balance_change`, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_amount_cents: -Math.abs(amountCents),
      p_kind: "query",
      p_metadata: metadata
    })
  });
  if (!r.ok) {
    const detail = await r.text();
    console.error("debitBalance failed:", r.status, detail);
    await notify(env,
      `apply_balance_change (query debit) FAILED for user=${userId} ` +
      `amount_cents=${amountCents} status=${r.status} — query ran but wasn't charged: ` +
      String(detail).slice(0, 200)
    );
  }
}

async function supabaseHasProcessedEvent(env, eventId) {
  const r = await supabaseFetch(
    env,
    `/rest/v1/processed_stripe_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id`
  );
  if (!r.ok) throw new Error(`hasProcessedEvent failed: ${r.status}`);
  const rows = await r.json();
  return rows.length > 0;
}

async function supabaseRecordProcessedEvent(env, eventId, eventType) {
  const r = await supabaseFetch(env, `/rest/v1/processed_stripe_events`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ event_id: eventId, event_type: eventType })
  });
  if (!r.ok && r.status !== 409) {
    throw new Error(`recordProcessedEvent failed: ${r.status} ${await r.text()}`);
  }
}

async function supabaseFindUserByPaymentIntent(env, paymentIntentId) {
  if (!paymentIntentId) return null;
  const r = await supabaseFetch(
    env,
    `/rest/v1/ledger?metadata->>payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&kind=eq.purchase&select=user_id&limit=1`
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? rows[0].user_id : null;
}

// ---------------- Cost / token helpers ----------------

function computeCostCents({ inputTokens, outputTokens, rates, markup }) {
  const rawDollars = (inputTokens * rates.input + outputTokens * rates.output) / 1e6;
  // Collapse IEEE-754 noise before the ceil. Without this, e.g. 3 * 1.35 ===
  // 4.050000000000001, so Math.ceil(405.0000…) returns 406 — a 1-cent
  // overcharge on amounts that land exactly on a cent boundary. Rounding to 6
  // decimal places kills the ~1e-13 FP error while preserving any genuine
  // sub-cent fraction (which still rounds up, so we never undercharge).
  const cents = rawDollars * markup * 100;
  return Math.ceil(Number(cents.toFixed(6)));
}

function estimateInputTokens(system, messages) {
  let chars = 0;
  if (system) chars += String(system).length;
  for (const m of messages) {
    chars += String(m.content || "").length;
    chars += 8;
  }
  return Math.ceil(chars / 3.5);
}

// ---------------- Anthropic SSE assembler (v3.2) ----------------

// Consume an Anthropic streaming response and return a value with the
// same shape v3.1 returned from the non-streaming endpoint:
//
//   {
//     id, type: "message", role: "assistant",
//     content: [{ type: "text", text: <accumulated text> }],
//     model, stop_reason,
//     usage: { input_tokens, output_tokens },
//     _streamed: true
//   }
//
// We read the body as a ReadableStream, decode SSE frames separated by
// "\n\n", and dispatch on `data.type`:
//   - message_start         → capture id, model, initial usage
//   - content_block_delta   → append delta.text when delta.type === "text_delta"
//   - message_delta         → update stop_reason and final output_tokens
//   - error                 → throw, so askHandler returns 502
//
// Multi-line `data:` payloads are joined with "\n" per the SSE spec.
// Anything else (ping, content_block_start/stop, unknown event types)
// is intentionally ignored — we only care about the assistant text and
// the usage/stop accounting that the existing cost code reads.
async function assembleAnthropicStream(upstream) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const out = {
    id: null,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "" }],
    model: null,
    stop_reason: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    _streamed: true
  };

  function processEventBlock(block) {
    let dataStr = null;
    const lines = block.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const payload = line.slice(6);
        dataStr = (dataStr === null) ? payload : dataStr + "\n" + payload;
      } else if (line.startsWith("data:")) {
        // Tolerate the no-space variant some servers emit.
        const payload = line.slice(5);
        dataStr = (dataStr === null) ? payload : dataStr + "\n" + payload;
      }
    }
    if (dataStr === null || dataStr === "") return;
    let evt;
    try {
      evt = JSON.parse(dataStr);
    } catch {
      return; // Heartbeat / partial / non-JSON frame; ignore.
    }
    if (!evt || typeof evt !== "object") return;
    if (evt.type === "message_start" && evt.message) {
      if (evt.message.id) out.id = evt.message.id;
      if (evt.message.model) out.model = evt.message.model;
      if (evt.message.usage) {
        if (typeof evt.message.usage.input_tokens === "number") {
          out.usage.input_tokens = evt.message.usage.input_tokens;
        }
        if (typeof evt.message.usage.output_tokens === "number") {
          out.usage.output_tokens = evt.message.usage.output_tokens;
        }
      }
    } else if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
      out.content[0].text += (evt.delta.text || "");
    } else if (evt.type === "message_delta") {
      if (evt.delta && evt.delta.stop_reason) out.stop_reason = evt.delta.stop_reason;
      if (evt.usage && typeof evt.usage.output_tokens === "number") {
        // Final authoritative output_tokens count.
        out.usage.output_tokens = evt.usage.output_tokens;
      }
    } else if (evt.type === "error") {
      const inner = (evt.error && evt.error.message) || JSON.stringify(evt.error || evt);
      throw new Error("Anthropic streamed error: " + inner);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIndex;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      processEventBlock(block);
    }
  }
  // Flush any trailing partial frame (servers may not always emit the
  // final "\n\n" before closing the stream).
  if (buffer.length > 0) {
    processEventBlock(buffer);
  }
  return out;
}

// ---------------- Provider adapters ----------------

var PROVIDERS = {
  anthropic: {
    buildRequest: ({ apiKey, model, system, messages, max_tokens }) => ({
      url: ENDPOINTS.anthropic,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION
        },
        // v3.2: stream:true so Cloudflare's edge in front of
        // api.anthropic.com starts emitting bytes within a couple
        // seconds and the 100s idle timer never trips.
        // assembleAnthropicStream re-aggregates the SSE chunks into
        // a v3.1-shaped JSON response, so parseResponse below stays
        // a pass-through and downstream cost/usage code is unchanged.
        body: JSON.stringify({ model, max_tokens, system, messages, stream: true })
      }
    }),
    parseResponse: (data) => data
  },
  openai: {
    buildRequest: ({ apiKey, model, system, messages, max_tokens }) => {
      const fullMessages = system ? [{ role: "system", content: system }, ...messages] : messages;
      const isReasoning = /^(o\d|gpt-5)/i.test(model);
      const tokenField = isReasoning ? "max_completion_tokens" : "max_tokens";
      return {
        url: ENDPOINTS.openai,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: fullMessages,
            [tokenField]: max_tokens
          })
        }
      };
    },
    parseResponse: (data) => {
      const choice = (data.choices && data.choices[0]) || {};
      const text = (choice.message && choice.message.content) || "";
      return {
        content: [{ type: "text", text }],
        usage: {
          input_tokens: (data.usage && data.usage.prompt_tokens) || 0,
          output_tokens: (data.usage && data.usage.completion_tokens) || 0
        },
        stop_reason: choice.finish_reason || null,
        model: data.model || null,
        id: data.id || null,
        _raw_provider: "openai"
      };
    }
  },
  google: {
    buildRequest: ({ apiKey, model, system, messages, max_tokens }) => {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: stringifyContent(m.content) }]
      }));
      const reqBody = {
        contents,
        generationConfig: { maxOutputTokens: max_tokens }
      };
      if (system) {
        reqBody.system_instruction = { parts: [{ text: system }] };
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      return {
        url,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(reqBody)
        }
      };
    },
    parseResponse: (data, model) => {
      const cand = (data.candidates && data.candidates[0]) || {};
      const parts = (cand.content && cand.content.parts) || [];
      const text = parts.map((p) => p.text || "").join("");
      const usage = data.usageMetadata || {};
      return {
        content: [{ type: "text", text }],
        usage: {
          input_tokens: usage.promptTokenCount || 0,
          output_tokens: usage.candidatesTokenCount || 0
        },
        stop_reason: cand.finishReason || null,
        model,
        id: data.responseId || null,
        _raw_provider: "google"
      };
    }
  }
};

function stringifyContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "string" ? p : p.text || "")).join("\n");
  }
  return String(content || "");
}

function extractErrorMessage(provider, data) {
  if (!data) return null;
  if (data.error && data.error.message) return data.error.message;
  return null;
}

// ---------------- HTTP / encoding helpers ----------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function yyyymmdd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function yyyymmddhhmm(d) {
  const iso = d.toISOString();
  return iso.slice(0, 10).replace(/-/g, "") + iso.slice(11, 16).replace(":", "");
}

function b64UrlDecodeToString(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

function b64UrlDecodeToBytes(s) {
  const str = b64UrlDecodeToString(s);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------- Test-only named exports ----------------
// The deployed Worker runs ONLY the `export default {...}` above (Cloudflare
// invokes default.fetch / default.scheduled). These extra named exports exist
// so the vitest suite (worker/index.test.js) can unit-test the money-path
// internals directly; they're inert in production and don't change the bundle's
// runtime behavior. Keep this list narrow — export only what tests assert on.
export {
  lookupAnthropicRates,
  computeCostCents,
  estimateInputTokens,
  checkPaidBudget,
  pickCheckoutReturnOrigin,
  constantTimeEqual,
  bufToHex,
  b64UrlDecodeToString,
  verifyStripeSignature,
  emailDomainAllowed,
  betaGate,
  webhookHandler,
  checkIpRateLimit,
  checkUserRateLimit,
  withStatementTimeoutRetry,
  supabaseGetAccount,
  verifyJwt,
  pipelineStaleness
};
