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
  const fallback = env.APP_BASE_URL || "https://ragtime.lawfaremedia.org";
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
  // (e.g. https://ragtime.lawfaremedia.org/), but trim any trailing
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

// ---------------- Edge cache for read-only corpus queries ----------------
// These endpoints are PUBLIC and their response depends ONLY on the request
// body (query / fields / scope), never on the user — so a body-keyed edge
// cache is correct and shared across all users. A cache HIT costs ZERO DB
// connections, which is the highest-leverage fix for the concurrency collapse
// the load test found (the DB saturates at a few dozen concurrent queries).
// Per-colo (Cloudflare Cache API); short TTLs because the corpus is updated by
// the pipeline (static corpora get longer TTLs). Only 200s are cached.
const CORPUS_CACHE_TTL = {
  "/corpus/hub/keyword": 300,
  "/corpus/filter": 120,
  "/corpus/cases": 120,
  "/corpus/entries": 300,
  "/corpus/facets": 300,
  "/corpus/usc/filter": 1800, "/corpus/usc/facets": 1800,
  "/corpus/cfr/filter": 1800, "/corpus/cfr/facets": 1800,
  "/corpus/olc/filter": 1800, "/corpus/olc/facets": 1800,
  "/corpus/frus/filter": 1800, "/corpus/frus/facets": 1800,
  "/corpus/lawfare/filter": 1800, "/corpus/lawfare/facets": 1800,
};

// path -> handler for the cacheable corpus endpoints (functions are hoisted).
const CORPUS_CACHE_HANDLERS = {
  "/corpus/hub/keyword": (req, env, ctx) => corpusHubKeywordHandler(req, env, ctx),
  "/corpus/filter": (req, env, ctx) => corpusFilterHandler(req, env, ctx),
  "/corpus/cases": (req, env, ctx) => corpusCasesHandler(req, env, ctx),
  "/corpus/entries": (req, env, ctx) => corpusEntriesHandler(req, env, ctx),
  "/corpus/facets": (req, env, ctx) => corpusFacetsHandler(req, env, ctx),
  "/corpus/usc/filter": (req, env, ctx) => corpusUscFilterHandler(req, env, ctx),
  "/corpus/usc/facets": (req, env, ctx) => corpusUscFacetsHandler(req, env, ctx),
  "/corpus/cfr/filter": (req, env, ctx) => corpusCfrFilterHandler(req, env, ctx),
  "/corpus/cfr/facets": (req, env, ctx) => corpusCfrFacetsHandler(req, env, ctx),
  "/corpus/olc/filter": (req, env, ctx) => corpusOlcFilterHandler(req, env, ctx),
  "/corpus/olc/facets": (req, env, ctx) => corpusOlcFacetsHandler(req, env, ctx),
  "/corpus/frus/filter": (req, env, ctx) => corpusFrusFilterHandler(req, env, ctx),
  "/corpus/frus/facets": (req, env, ctx) => corpusFrusFacetsHandler(req, env, ctx),
  "/corpus/lawfare/filter": (req, env, ctx) => corpusLawfareFilterHandler(req, env, ctx),
  "/corpus/lawfare/facets": (req, env, ctx) => corpusLawfareFacetsHandler(req, env, ctx),
};

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable cache key for (path, body). Uses a synthetic GET URL so the Cache API
// (which keys on GET requests) can store POST responses.
async function corpusCacheKeyUrl(path, bodyText) {
  return "https://corpus-cache.ragtime/" + encodeURIComponent(path) + "?h=" + (await sha256Hex(path + "\n" + bodyText));
}

// Wrap a cacheable corpus handler with the edge cache. Reads the body once,
// keys on its hash, and on a miss reconstructs the request so the downstream
// handler can read the body again. Never caches non-200 (errors / 429) so a
// transient failure can't be pinned in cache.
async function withCorpusCache(request, env, ctx, path, ttl, handler) {
  let bodyText = "";
  try { bodyText = await request.text(); } catch { bodyText = ""; }
  const cache = caches.default;
  const cacheKey = new Request(await corpusCacheKeyUrl(path, bodyText), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) {
    const h = new Headers(hit.headers); h.set("X-RT-Cache", "HIT");
    return new Response(hit.body, { status: hit.status, headers: h });
  }
  const req2 = new Request(request.url, { method: "POST", headers: request.headers, body: bodyText });
  const resp = await handler(req2, env, ctx);
  if (resp.status === 200) {
    const text = await resp.clone().text();
    const h = new Headers(resp.headers);
    h.set("Cache-Control", "public, max-age=" + ttl);
    h.set("X-RT-Cache", "MISS");
    const toCache = new Response(text, { status: 200, headers: h });
    ctx.waitUntil(cache.put(cacheKey, toCache.clone()));
    return toCache;
  }
  return resp;
}

// Route + handle one request. Extracted from default.fetch so (a) the fetch
// wrapper below can time and log every request uniformly, and (b) the service-
// health probes in the 30-min cron can exercise a real endpoint path in-process
// (a Worker can't reliably fetch its own URL — self-requests trip recursion
// protection).
async function routeRequest(request, env, ctx) {
    if (request.method === "OPTIONS") return corsResponse();
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      // Edge-cache read-only corpus queries before dispatch (see above). The
      // matching handler below is the cache miss path.
      if (request.method === "POST" && CORPUS_CACHE_TTL[path] && CORPUS_CACHE_HANDLERS[path]) {
        return await withCorpusCache(request, env, ctx, path, CORPUS_CACHE_TTL[path], CORPUS_CACHE_HANDLERS[path]);
      }
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
      if (path === "/corpus/hub/keyword" && request.method === "POST") {
        return await corpusHubKeywordHandler(request, env, ctx);
      }
      if (path === "/corpus/feedback/log" && request.method === "POST") {
        return await corpusFeedbackLogHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/facets" && request.method === "POST") {
        return await corpusUscFacetsHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/filter" && request.method === "POST") {
        return await corpusUscFilterHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/section" && request.method === "POST") {
        return await corpusUscSectionHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/plan" && request.method === "POST") {
        return await corpusUscPlanHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/execute" && request.method === "POST") {
        return await corpusUscExecuteHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/summarize-section" && request.method === "POST") {
        return await corpusUscSummarizeHandler(request, env, ctx);
      }
      if (path === "/corpus/usc/items-by-ids" && request.method === "POST") {
        return await corpusUscItemsByIdsHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/facets" && request.method === "POST") {
        return await corpusCfrFacetsHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/filter" && request.method === "POST") {
        return await corpusCfrFilterHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/section" && request.method === "POST") {
        return await corpusCfrSectionHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/plan" && request.method === "POST") {
        return await corpusCfrPlanHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/execute" && request.method === "POST") {
        return await corpusCfrExecuteHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/summarize-section" && request.method === "POST") {
        return await corpusCfrSummarizeHandler(request, env, ctx);
      }
      if (path === "/corpus/cfr/items-by-ids" && request.method === "POST") {
        return await corpusCfrItemsByIdsHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/facets" && request.method === "POST") {
        return await corpusOlcFacetsHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/filter" && request.method === "POST") {
        return await corpusOlcFilterHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/opinion" && request.method === "POST") {
        return await corpusOlcOpinionHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/plan" && request.method === "POST") {
        return await corpusOlcPlanHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/execute" && request.method === "POST") {
        return await corpusOlcExecuteHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/summarize-opinion" && request.method === "POST") {
        return await corpusOlcSummarizeHandler(request, env, ctx);
      }
      if (path === "/corpus/olc/items-by-ids" && request.method === "POST") {
        return await corpusOlcItemsByIdsHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/facets" && request.method === "POST") {
        return await corpusFrusFacetsHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/filter" && request.method === "POST") {
        return await corpusFrusFilterHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/document" && request.method === "POST") {
        return await corpusFrusDocumentHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/plan" && request.method === "POST") {
        return await corpusFrusPlanHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/execute" && request.method === "POST") {
        return await corpusFrusExecuteHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/summarize-document" && request.method === "POST") {
        return await corpusFrusSummarizeHandler(request, env, ctx);
      }
      if (path === "/corpus/frus/items-by-ids" && request.method === "POST") {
        return await corpusFrusItemsByIdsHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/facets" && request.method === "POST") {
        return await corpusLawfareFacetsHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/filter" && request.method === "POST") {
        return await corpusLawfareFilterHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/article" && request.method === "POST") {
        return await corpusLawfareArticleHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/plan" && request.method === "POST") {
        return await corpusLawfarePlanHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/execute" && request.method === "POST") {
        return await corpusLawfareExecuteHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/summarize-article" && request.method === "POST") {
        return await corpusLawfareSummarizeHandler(request, env, ctx);
      }
      if (path === "/corpus/lawfare/items-by-ids" && request.method === "POST") {
        return await corpusLawfareItemsByIdsHandler(request, env, ctx);
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
}

// Content-free per-request log line ({ev:"req"}). One line per request in
// Workers Logs (observability is enabled in wrangler.toml) gives per-endpoint
// latency / error-rate / cache-hit series with no new infrastructure — the
// service-health signal the ops floor was missing. NO query text and NO user
// identifiers, matching the hub_fanout log's posture. OPTIONS preflights are
// skipped as noise; the path is length-capped so scanner junk on 404s can't
// bloat log lines.
function logRequest(request, resp, ms) {
  try {
    if (request.method === "OPTIONS") return;
    const line = {
      ev: "req",
      path: new URL(request.url).pathname.slice(0, 80),
      method: request.method,
      status: resp.status,
      ms
    };
    const cache = resp.headers.get("X-RT-Cache");
    if (cache) line.cache = cache;
    (resp.status >= 500 ? console.error : console.log)(JSON.stringify(line));
  } catch { /* logging must never break the response */ }
}

export default {
  async fetch(request, env, ctx) {
    const t0 = Date.now();
    const resp = await routeRequest(request, env, ctx);
    logRequest(request, resp, Date.now() - t0);
    return resp;
  },

  // Cron triggers (see wrangler.toml [triggers]). Two schedules:
  //   "0 13 * * 1"    weekly  → billing reconciliation
  //   anything else   frequent→ off-box pipeline liveness check (data
  //                   freshness) + service-health probes (user-facing
  //                   latency/errors)
  async scheduled(event, env, ctx) {
    if (event.cron === "0 13 * * 1") {
      ctx.waitUntil(runReconciliation(env));
    } else {
      ctx.waitUntil(runPipelineLivenessCheck(env));
      ctx.waitUntil(runServiceHealthCheck(env, ctx));
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
    // Internal/demo (Lawfare-password) usage bills the dedicated demo key so
    // Anthropic's per-key dashboard separates internal spend from external paid
    // spend. Falls back to the main key if the demo key isn't set yet.
    apiKey = env.ANTHROPIC_API_KEY_DEMO || env.ANTHROPIC_API_KEY;
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
      if (!is57014(e)) throw e;
    }
  }
  throw lastErr;
}

// True when an error carries Postgres 57014 (statement_timeout). The corpus
// surfaces it inside the run_query RPC's error body, so a substring check is the
// reliable signal across both run_query and run_query_heavy.
function is57014(e) { return String(e && e.message).includes("57014"); }

// User-facing copy for a query that exceeded the time limit. Actionable, not a
// raw Postgres dump (the old behavior — "run_query 500: {code:57014,...}").
var TOO_COMPLEX_MSG = "This search was too broad to finish in the time limit. Try narrowing the scope (add a court or a tighter date range) or using fewer, more specific terms.";

// Heavy-path runner: 90s ceiling (vs run_query's 60s), via the run_query_heavy
// RPC. Used ONLY after the EXPLAIN guard flags a query expensive AND an authed
// user opts into "run anyway" (Claude SQL), or for AMA queries the guard flags
// heavy. Keeps the "run_query " error prefix so is57014() still matches.
async function corpusRunQueryHeavy(env, sql) {
  const r = await corpusFetch(env, `/rest/v1/rpc/run_query_heavy`, {
    method: "POST",
    body: JSON.stringify({ query_text: sql })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`run_query ${r.status}: ${String(t).slice(0, 300)}`);
  }
  return await r.json();
}

// Pre-flight cost guard. EXPLAIN (FORMAT JSON) the final query (PLANS, never
// executes) and return the root node's estimated Total Cost — or null if it
// can't be obtained (invalid SQL, explain error), in which case callers treat it
// as "not flagged" and fall through to normal execution where the real error (if
// any) surfaces. Empirically (2026-06): the reported timeout query ~157K; a
// narrow FTS ~600; a full-corpus metadata seq scan ~58K (cost-inflated but fast).
function parseExplainTotalCost(planJson) {
  try {
    const root = Array.isArray(planJson) ? planJson[0] : planJson;
    const cost = root && root.Plan && root.Plan["Total Cost"];
    return (typeof cost === "number" && isFinite(cost)) ? cost : null;
  } catch { return null; }
}
async function corpusExplainCost(env, sql) {
  try {
    const r = await corpusFetch(env, `/rest/v1/rpc/explain_cost`, {
      method: "POST",
      body: JSON.stringify({ query_text: sql })
    });
    if (!r.ok) return null;
    return parseExplainTotalCost(await r.json());
  } catch { return null; }
}
// Threshold above which a query is "heavy" (offer run-anyway instead of running
// at the 60s ceiling). Default 100K — above the metadata seq-scan false-positive
// ceiling (~58K), below the timeout class (~157K). Tunable via env without deploy.
function heavyCostThreshold(env) {
  const v = parseInt(env.HEAVY_COST_THRESHOLD || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 100000;
}

// Approximate back-pressure on heavy (90s) queries: cap how many may START per
// minute globally so a burst of broad searches can't pile up and thrash the
// shared corpus instance's cache for everyone. Minute-bucketed KV counter with a
// short TTL — self-healing, and the same get/put pattern as checkIpRateLimit
// (approximate under races, which is fine for back-pressure). Returns true if a
// slot was reserved, false if over the cap. Tunable via HEAVY_QUERY_PER_MIN.
async function reserveHeavySlot(env, ctx) {
  const cap = parseInt(env.HEAVY_QUERY_PER_MIN || "6", 10);
  const key = `heavy:${yyyymmddhhmm(new Date())}`;
  const n = parseInt((await env.QUOTA.get(key)) || "0", 10);
  if (n >= cap) return false;
  ctx.waitUntil(env.QUOTA.put(key, String(n + 1), { expirationTtl: 120 }));
  return true;
}

// Usage logging is an INTERNAL tuning tool, never a public feature. The public
// service ships with NO logging: the public frontend bundle omits the logging
// code entirely (build flag), and BOTH server-side logging paths below require
// a shared secret carried only by the internal build. With no USAGE_LOG_TOKEN
// configured, or no matching X-Usage-Log-Token header, nothing is ever logged —
// so the privacy policy's "our code does not log them" holds for every public
// user. Only Ben's internal build (which sends the token) writes to usage_log.
function timingSafeStrEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function usageLogAuthorized(request, env) {
  const tok = env && env.USAGE_LOG_TOKEN;
  if (!tok) return false; // unconfigured ⇒ logging fully off (public default)
  const got = request.headers.get("X-Usage-Log-Token");
  return !!got && timingSafeStrEqual(got, tok);
}

// Usage logging is gated to INTERNAL use. The primary gate is DEMO mode — the
// Lawfare shared demo password, held by internal staff only; the public beta
// uses the access code + paid/BYOK and never the demo password, so paid / BYOK /
// free sessions are NOT logged and the privacy policy's "our code does not log
// them" holds for the public. (The shared-secret token path is retained as an
// alternative for an internal dev build that isn't using demo mode.)
function usageLoggingAllowed(authMode, request, env) {
  return authMode === "demo" || usageLogAuthorized(request, env);
}

// Best-effort server-side failure log. Failed AI runs otherwise escape the
// usage_log entirely — it is client-driven and the client only logs SUCCESSFUL
// traces, so the exact queries we most need to triage are invisible. Fire-and-
// forget; never throws into the user path. (v1 marks failures via a note prefix;
// no APP-project schema change.) Gated to the internal build (token) — public
// failures are NOT logged, consistent with the no-logging public posture.
function logCorpusFailure(request, env, ctx, fields) {
  try {
    if (!usageLoggingAllowed(fields.authMode, request, env)) return;
    const row = {
      interaction_id: crypto.randomUUID(),
      client_ts: new Date().toISOString(),
      auth_mode: fields.authMode || null,
      user_id: fields.userId || null,
      surface: fields.surface || null,
      mode: fields.mode || null,
      question: fields.question ? String(fields.question).slice(0, 8000) : null,
      note: ("[server-logged failure] " + String(fields.error || "unknown")).slice(0, 8000),
      annotated_at: new Date().toISOString()
    };
    ctx.waitUntil(
      supabaseFetch(env, "/rest/v1/usage_log?on_conflict=interaction_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row)
      }).catch(() => {})
    );
  } catch { /* never break the user path */ }
}

// Build the usage_log row for a SUCCESSFUL AMA trace, logged server-side. This
// is the authoritative trace capture: it lands even when the client never logs
// (logging toggle off, or a client-side failure), so the queries we most want
// to triage aren't lost. Keyed on the CLIENT's interaction_id so it merge-
// upserts onto the same row the client's inline ★/note annotation targets.
// CRITICAL: omit rating / note / annotated_at entirely — PostgREST merge-
// duplicates only updates columns present in the payload, so leaving them out
// means a server-side trace write can never clobber a user's annotation,
// regardless of which write lands first.
function buildUsageLogSuccessRow(fields) {
  return {
    interaction_id: fields.interaction_id,
    client_ts: new Date().toISOString(),
    auth_mode: fields.authMode || null,
    user_id: fields.userId || null,
    user_email: fields.userEmail || null,
    surface: fields.surface || null,
    mode: fields.mode || null,
    question: fields.question ? String(fields.question).slice(0, 8000) : null,
    output_mode: fields.output_mode || null,
    plan: (fields.plan && typeof fields.plan === "object") ? fields.plan : null,
    query_summary: Array.isArray(fields.query_summary) ? fields.query_summary : null,
    answer_markdown: fields.answer_markdown ? String(fields.answer_markdown).slice(0, 100000) : null,
    cited_ids: Array.isArray(fields.cited_ids) ? fields.cited_ids : null,
    candor_notes: Array.isArray(fields.candor_notes) ? fields.candor_notes : null,
    cost_cents: (typeof fields.cost_cents === "number" && isFinite(fields.cost_cents)) ? fields.cost_cents : null,
    provider: fields.provider || null,
    model: fields.model || null
    // NB: rating / note / annotated_at deliberately absent — see comment above.
  };
}

// Best-effort server-side SUCCESS log (companion to logCorpusFailure). Fire-and-
// forget; never throws into the user path. No-ops unless logging is allowed for
// this session AND a valid client interaction_id is present (without one we
// could not join to the annotation row and would risk orphan/duplicate rows).
function logCorpusSuccess(request, env, ctx, fields) {
  try {
    if (!usageLoggingAllowed(fields.authMode, request, env)) return;
    if (!fields.interaction_id || !UUID_RE.test(fields.interaction_id)) return;
    ctx.waitUntil(
      supabaseFetch(env, "/rest/v1/usage_log?on_conflict=interaction_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(buildUsageLogSuccessRow(fields))
      }).catch(() => {})
    );
  } catch { /* never break the user path */ }
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
    // Internal/demo usage bills the dedicated demo key (falls back to the main
    // key when unset) so internal vs external spend separate on Anthropic's side.
    return { authMode: "demo", apiKey: env.ANTHROPIC_API_KEY_DEMO || env.ANTHROPIC_API_KEY, userId: null, account: null };
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

// ── Usage + annotation log (feature: ragtime-usage-log-feedback) ────────────
// Client-side capture: the app already holds the full plan→execute→synthesize
// trace, so it assembles the record + the logger's inline rating/note and
// upserts it here (keyed by a client-generated interaction_id). v1 gate = a
// private client toggle; this endpoint requires valid corpus credentials (any
// auth mode) so it can't be spammed anonymously and records whatever identity
// exists. Writes to the APP-project usage_log table via the service role.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUsageLogRequest(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "missing body" };
  const id = String(body.interaction_id || "").trim();
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid interaction_id (uuid required)" };
  const str = (v, cap) => (typeof v === "string" && v.trim() ? v.slice(0, cap) : null);
  const rating = (Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5) ? body.rating : null;
  return {
    ok: true,
    value: {
      interaction_id: id,
      client_ts: str(body.client_ts, 40),
      surface: str(body.surface, 80),
      mode: str(body.mode, 40),
      question: str(body.question, 8000),
      output_mode: str(body.output_mode, 40),
      plan: (body.plan && typeof body.plan === "object") ? body.plan : null,
      query_summary: Array.isArray(body.query_summary) ? body.query_summary : null,
      answer_markdown: str(body.answer_markdown, 100000),
      cited_ids: Array.isArray(body.cited_ids) ? body.cited_ids : null,
      candor_notes: Array.isArray(body.candor_notes) ? body.candor_notes : null,
      cost_cents: (typeof body.cost_cents === "number" && isFinite(body.cost_cents)) ? body.cost_cents : null,
      provider: str(body.provider, 40),
      model: str(body.model, 80),
      logger_label: str(body.logger_label, 80),
      rating,
      note: str(body.note, 8000)
    }
  };
}

async function corpusFeedbackLogHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  // Require valid corpus credentials (paid JWT / demo password / BYOK key) —
  // spam protection + server-trusted identity. Same gate as any /corpus call.
  const auth = await resolveCorpusAuth(request, env, ctx, "anthropic", body);
  if (auth instanceof Response) return auth;
  // Internal-only: only DEMO sessions (or an internal dev build carrying the
  // shared token) are logged. A public paid/BYOK caller gets a benign no-op so
  // nothing in the UI ever depends on logging.
  if (!usageLoggingAllowed(auth.authMode, request, env)) return json({ ok: true, logged: false });
  const parsed = parseUsageLogRequest(body);
  if (!parsed.ok) return json({ error: { message: "Usage log: " + parsed.error } }, 400);
  const v = parsed.value;

  // Server-trusted email from the JWT (paid sessions); never trust a client claim.
  let userEmail = null;
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (m) { const c = await verifyJwt(m[1], env); if (c && c.email) userEmail = String(c.email).toLowerCase(); }

  const row = {
    interaction_id: v.interaction_id,
    client_ts: v.client_ts,
    auth_mode: auth.authMode,
    user_id: auth.userId,
    user_email: userEmail,
    logger_label: v.logger_label,
    surface: v.surface,
    mode: v.mode,
    question: v.question,
    output_mode: v.output_mode,
    plan: v.plan,
    query_summary: v.query_summary,
    answer_markdown: v.answer_markdown,
    cited_ids: v.cited_ids,
    candor_notes: v.candor_notes,
    cost_cents: v.cost_cents,
    provider: v.provider,
    model: v.model,
    rating: v.rating,
    note: v.note,
    annotated_at: (v.rating != null || v.note != null) ? new Date().toISOString() : null
  };
  try {
    const r = await supabaseFetch(env, "/rest/v1/usage_log?on_conflict=interaction_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: { message: "usage_log write failed: " + r.status + " " + t.slice(0, 200) } }, 502);
    }
  } catch (e) {
    return json({ error: { message: "usage_log write error: " + e.message } }, 502);
  }
  return json({ ok: true, interaction_id: v.interaction_id }, 200);
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

// Operationalizes ToS §3 ("Not professional advice") at query time. Shared
// verbatim across all six AMA planners (litigation, USC, CFR, OLC, Lawfare,
// FRUS): when — and only when — a question reads like a request for legal
// advice about whether some conduct is lawful or what someone should do in
// their own situation, the planner appends this exact note to candor_notes.
// Calibrated to UNDER-fire so it never becomes wallpaper; neutral research
// framing stays silent. The note text is Ben/Scott-approved and ties back to
// the ToS; keep it verbatim (a unit test asserts the exact string).
const LEGAL_ADVICE_CANDOR_NOTE = "As stated in RAGtime's Terms of Service, this service does not provide legal advice. This output is research. Nothing here creates an attorney-client relationship, or provides legal representation or advice to any person. It is not a substitute for a qualified attorney's judgment on any person's specific situation.";
const LEGAL_ADVICE_PLANNER_RULE = [
  '- NOT-LEGAL-ADVICE NOTE. If — and ONLY if — the question reads like a request for legal advice about whether some conduct is lawful, or what a person should do in their own situation — however phrased: (a) first/second person ("can I/we do X", "am I liable", "do I have a case", "what are my options", "how do I…"); (b) impersonal legality-of-conduct ("is it legal to X", "is it legal for a person to X", "is X allowed", "would someone be breaking the law if…"); OR (c) a stated intent to PERFORM some real-world act paired with asking what law/regulation/penalty applies to or would limit it ("I want to / I am planning to / I intend to [DO some act]… are there rules that would limit me?", "what regulations restrict my ability to do X", "would I be allowed to…") — you MUST include this EXACT string, verbatim and unaltered, as one of the candor_notes:',
  '    ' + JSON.stringify(LEGAL_ADVICE_CANDOR_NOTE),
  '  Shape (c) DOES fire even when the verb is "are there regulations…" rather than "is it legal…": a person describing their OWN planned conduct and asking what law constrains it is seeking legal advice. Example that MUST fire: "I want to project slogans on the Washington Monument — are there regulations, enforceable by criminal law, that would limit my ability to do so?"',
  '  Otherwise calibrate to UNDER-fire. Neutral RESEARCH framing must NOT trigger it: "what cases involve X", "what does this section/statute say", "how have courts treated X", "what is the penalty for X under the statute", "list regulations about Y", and intent-to-RESEARCH ("I want to understand/find/research X") are RESEARCH — stay silent. When genuinely on the line, fire only when the query is about the user\'s OWN situation or planned conduct.'
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
    '- KEYWORD UNDERPERFORMS — FAN OUT WITH OR GENEROUSLY. The user\'s phrasing is rarely the way the docket entry phrases things. Single-term ANDed queries will under-recall. Specific failure modes you must guard against:',
    '    * **Agency vs caption.** User says "ICE detention cases"; case captions typically name a person ("Doe v. Garland"), not the agency. ALWAYS search docket_entries.fts for agency questions, never cases.case_name. And fan agency names: "ICE" OR "Immigration and Customs Enforcement" OR "DHS" OR "Homeland Security" OR "Secretary of Homeland Security". Same pattern for any agency: include the umbrella department, the parent agency, the official position, and common shorthands.',
    '    * **Doctrinal/procedural phrasings.** Court filings use formal terms. "TRO" → also "temporary restraining order"; "PI" → "preliminary injunction"; "stay" → "stay pending appeal" / "interim relief" / "emergency stay"; "habeas" → "section 2241" / "writ of habeas corpus"; "EO" → "executive order" / "Proclamation". Fan to common alternations.',
    '    * **Conceptual / doctrinal queries.** "Standing", "preemption", "due process", "ripeness" — these doctrines may not appear as keyword phrases in dockets even when central to the case. Fan to common formulations + add a candor_note that keyword search may under-recall conceptual questions; semantic retrieval (pgvector) is Phase 2.',
    '    * **Defense-motion vocabulary mismatch (CRITICAL — drives the largest recall failures in criminal cases).** Researchers think in policy-language ("prosecutorial misconduct", "disclosure of grand jury materials", "Rule 6(e)"); defense counsel writes motion captions in doctrinal-language that\'s adjacent but distinct. The litigation corpus indexes the motion captions in docket_entries.description. Specific alternations you MUST fan when the question is about a defense motion:',
    '        — "prosecutorial misconduct" → also "Vindictive and Selective Prosecution", "Vindictive Prosecution", "Outrageous Government Conduct", "Grand Jury Violations", "Brady violations", "Giglio violations", "selective enforcement".',
    '        — "grand jury materials" / "grand jury disclosure" → also "Grand Jury Records", "Grand Jury Transcripts", "Grand Jury Minutes", "in camera review", "Rule 6" (NOT just "Rule 6(e)" — counsel often cites Rule 6 broadly), "Grand Jury Violations", "indictment signer\'s participation in the grand jury".',
    '        — "speedy trial" → also "Speedy Trial Act", "18 U.S.C. § 3161", "STA violations".',
    '        — "suppression" → also "Motion to Suppress", "Fourth Amendment violation", "fruits of the poisonous tree", "exclusionary rule".',
    '      WORKED EXAMPLE — *"all criminal cases in which defendants sought disclosure of grand jury materials because of alleged prosecutorial misconduct"*: known ground truth includes United States v. Comey (E.D. Va. 1:25-cr-00272 — caption "MOTION to Dismiss Indictment based on Fifth Amendment, Rule 6, and Grand Jury Violations"), United States v. James (E.D. Va. 2:25-cr-00122 — caption "MOTION for Disclosure of Certain Grand Jury Records"), United States v. Rabbitt et al. (N.D. Ill. 1:25-cr-00693 — captions reference "Grand Jury Transcripts for in Camera Review"). A good FTS plan: case_type=cr AND cl_id IN (SELECT cl_id FROM docket_entries WHERE fts @@ websearch_to_tsquery(\'english\', \'("grand jury" AND ("Rule 6" OR "Grand Jury Violations" OR "Grand Jury Records" OR "Grand Jury Transcripts" OR "Grand Jury Minutes" OR "in camera review")) OR ("disclosure of" AND "grand jury") OR ("Outrageous Government Conduct") OR ("Vindictive Prosecution" AND "grand jury")\')). A BAD plan: case_type=cr AND fts @@ websearch_to_tsquery(\'english\', \'"prosecutorial misconduct" AND "grand jury materials"\') — both phrases are researcher-language; "prosecutorial misconduct" rarely appears in motion captions and "grand jury materials" almost never does.',
    '- COURT-ACTION-ON-MOTION QUERIES (a within-case chain pattern). When the question is shaped *"judges granted/denied defense motion X"* or *"cases where the court ordered Y in response to motion Z"*, a single-entry FTS CANNOT answer it. The defense motion\'s text lives in one docket entry; the court\'s response (granting / denying / ordering in camera review / scheduling further briefing) lives in a LATER entry in the same case. Worse: the order entry frequently references the motion only by entry number ("ORDER on 211 MOTION to Dismiss") without repeating the motion\'s subject — so the keyword search that catches the order won\'t catch the motion, and vice versa.',
    '  The fix is a within-case motion→order CHAIN query (CTE pair, JOIN on cl_id, ORDER entry > MOTION entry). Template:',
    '      WITH gjmotions AS (',
    '        SELECT cl_id, entry_number AS motion_entry, description AS motion_text',
    '        FROM scoped_docket_entries  -- (or docket_entries if scope is the full DB)',
    '        WHERE fts @@ websearch_to_tsquery(\'english\',',
    '              \'("Motion to Dismiss" OR "Motion for Disclosure" OR "Motion to Inspect" OR',
    '                "Motion to Produce" OR "Motion to Compel") AND',
    '               ("grand jury" OR "Rule 6" OR "Grand Jury Violations")\')',
    '      ), gjorders AS (',
    '        SELECT cl_id, entry_number AS order_entry, description AS order_text',
    '        FROM scoped_docket_entries',
    '        WHERE fts @@ websearch_to_tsquery(\'english\',',
    '              \'("ORDER" OR "GRANTED" OR "DENIED" OR "in camera review" OR "directed to submit") AND',
    '               "grand jury"\')',
    '      )',
    '      SELECT m.cl_id, m.motion_entry, m.motion_text, o.order_entry, o.order_text',
    '      FROM gjmotions m JOIN gjorders o USING (cl_id)',
    '      WHERE o.order_entry > m.motion_entry',
    '      ORDER BY m.cl_id, m.motion_entry, o.order_entry',
    '      LIMIT 500;',
    '  This pairs each defense MOTION with all subsequent ORDERS in the same case, leaving synthesis to classify each pair by what the court actually did (granted in full / granted for in camera review only / denied / scheduling extension / order on a related but distinct motion).',
    '  Performance is fine inside narrowed scopes (~thousands of cases): the FTS predicates prune both sides BEFORE the join, and cl_id is indexed. Avoid this pattern over the FULL 1.09M-case corpus without scope pre-narrowing — the motion-side CTE alone could return ~100k rows before the join.',
    '  CHAIN-PATTERN WORKED EXAMPLE — *"cases in which judges granted defense motions to release grand jury transcripts, minutes, or materials on grounds of prosecutorial misconduct"*: this is COURT-ACTION-ON-MOTION shape (the user wants the court\'s response, not just the motion). The single-FTS plan from the worked example above finds the MOTIONS but the synthesis then has nothing to say about what the court DID — it can only honestly report "no GRANT order matched literally," even when in fact the same case has a later ORDER entry directing in camera review on the motion. Run the chain query instead. Against the live corpus this surfaces ~350 criminal cases with the chain (including Comey 27×77, James 26×59, Rabbitt 3×9 motion-order pairs), each with the motion and the responsive court action paired in one row so synthesis can classify each pair on its merits.',
    '- NARRATIVE DISCIPLINE. For output_mode="narrative" or "hybrid", prefer 2–4 queries, NOT 6+. Synthesis has a finite output-token budget (currently 8000 for narrative); too many queries inflate the synthesis input and risk truncation mid-answer. A single well-fanned FTS query with strong OR coverage is better than five literal-term queries.',
    '- PERFORMANCE for narrowed scopes (esp. > 100K cases): FTS-first patterns are dramatically faster. To find docket entries matching some text WITHIN a scope, write "SELECT cl_id FROM scoped_docket_entries WHERE fts @@ ..." rather than joining scoped_cases × scoped_docket_entries first. Postgres can use the FTS GIN index on docket_entries.fts directly; the scope filter then narrows the much smaller FTS result set. Avoid heavy joins of scoped_cases × scoped_docket_entries with an FTS predicate at the join level — those reliably hit the statement timeout on six-figure scopes.',
    '- WHEN THE CURRENT SCOPE IS NARROWED (cl_ids list provided): use the names "scoped_cases" instead of "cases" and "scoped_docket_entries" instead of "docket_entries". The runner substitutes these names with inline subqueries already filtered to the scope. CRITICAL: reference these names ONLY after FROM or JOIN keywords, and DO NOT alias them — write "FROM scoped_cases WHERE cause LIKE ..." (good), not "FROM scoped_cases sc WHERE sc.cause LIKE ..." (will break). To qualify a column, use the unaliased name: "scoped_cases.cl_id" works. WHEN SCOPE IS THE FULL DATABASE: use the regular table names "cases" and "docket_entries" (and you may alias them freely).',
    '- For sampling at top-of-stack, you can use "ORDER BY random()" but be aware that\'s expensive on huge tables; prefer "ORDER BY date_filed DESC" with a LIMIT if you want a recency-biased sample.',
    LEGAL_ADVICE_PLANNER_RULE,
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
async function executeCorpusPlan(env, ctx, plan, scope) {
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

  // Prepare each query (scope substitution) and EXPLAIN-cost it up front, so we
  // can pick the runner per query AND reserve a SINGLE heavy slot for the whole
  // execute if any query is flagged heavy (rather than one slot per query).
  const prepared = [];
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
    const cost = await corpusExplainCost(env, execSql);
    prepared.push({ q, i, sql, execSql, heavy: cost != null && cost > heavyCostThreshold(env) });
  }
  // If any query is heavy, take one heavy slot for the run (90s ceiling on the
  // heavy ones). Over the cap → bubble a busy error the handler maps to 503.
  if (prepared.some((p) => p.heavy) && !(await reserveHeavySlot(env, ctx))) {
    const busy = new Error("The system is busy with other large searches right now. Try again in a moment, or narrow your question.");
    busy.code = "heavy_busy";
    throw busy;
  }

  const results = [];
  for (const p of prepared) {
    let rows;
    // Heavy (guard-flagged) → 90s ceiling. Else 60s with one cold-cache retry —
    // AMA SQL hits the same cold-cache-prone FTS surface as Claude SQL.
    try {
      rows = p.heavy
        ? await corpusRunQueryHeavy(env, p.execSql)
        : await withStatementTimeoutRetry(() => corpusRunQuery(env, p.execSql));
    } catch (err) {
      if (is57014(err)) {
        const tooComplex = new Error(TOO_COMPLEX_MSG);
        tooComplex.code = "too_complex";
        throw tooComplex;
      }
      throw new Error('Query "' + (p.q.label || ('query ' + (p.i + 1))) + '" failed: ' + err.message);
    }
    const truncated = (rows.length > 500) ? rows.slice(0, 500) : rows;
    results.push({ label: p.q.label || ('query ' + (p.i + 1)), sql: p.sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 500 });
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
    '  "answer_markdown": "...",  // markdown narrative.',
    '  ' + listClause + ',',
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    '}',
    '',
    'Rules:',
    '- LEAD with caveats when your confidence is materially lower than the user might assume. “Of a sample of 500...” is a different sentence from “All cases in the system show...”',
    '- For list and hybrid output_modes, cl_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable cases, downgrade to narrative mode and explain.',
    '- DO NOT embed inline citation tokens (no [case-ref:N], no [text](#case-N)). The UI renders the cited cases as a separate clickable rows panel below the narrative — write prose that reads naturally and let the panel do the citation work. If you need to refer to a specific case in prose, name it by short caption ("Doe v. Garland") not by id.',
    '- ZERO-RESULT HONESTY. When the query results are empty (or near-empty) for what should be a non-trivial question, the answer_markdown MUST: (1) name the FTS terms tried in prose ("I searched docket entries for the phrases ..."), (2) acknowledge this may be a keyword recall failure — explain that case captions name people, not agencies, and docket text uses formal procedural language that may not match the question\'s phrasing, and (3) suggest one or two reformulations the user could try (different agency names, the umbrella department, procedural posture instead of topic). DO NOT just say "no cases found" — that\'s opaque about whether the corpus is genuinely silent or the keyword search missed. Also note that the corpus floor is 2025-01-20 if the question may be about earlier events.',
    '- MOTION→ORDER CHAIN CLASSIFICATION. If the planner ran a within-case chain query (motion CTE × order CTE, JOINed on cl_id with order_entry > motion_entry — see the planner\'s court-action-on-motion guidance), the result rows pair a defense motion with each subsequent court order in the same case. Classify each pair on its substance, not its caption alone. Don\'t over-narrow on the literal word "GRANTED": the court\'s response can take several forms, each responsive to the user\'s question in a different way. Recognize at least these patterns:',
    '    * **Granted in full** — order explicitly grants the motion ("GRANTED", "Motion is GRANTED", "ORDERED that the motion is granted"). Surface as responsive.',
    '    * **Granted for in camera review only** — court directs the government to produce materials to the COURT for in camera review (e.g., "Government is directed to submit ... for in camera review", "shall produce grand jury transcripts for in camera inspection"). This IS a form of grant of the defense motion (the court overcame the presumption of grand jury secrecy enough to look at the materials) even though the materials don\'t reach the defense. Surface as responsive, with a candor_note flagging that the relief is in camera only, not disclosure to defense.',
    '    * **Granted in part / denied in part** — partial grant. Surface as responsive with the candor note about the partial scope.',
    '    * **Denied** — court rejected the motion. Surface as responsive — the user asked about cases where motions were filed and *court ruled*; a substantive denial is still a court action on the motion. Tag clearly as denial in the synthesis prose.',
    '    * **Scheduling / extension / briefing order** — order is procedural (extension of time, briefing schedule, hearing date). NOT responsive on its own — don\'t pad the cited list with these. If a case has BOTH a scheduling order AND a substantive order, classify it by the substantive one.',
    '    * **Order on a different motion in the same case** — the chain query can pair an unrelated motion with an order that happens to come later. Read the motion_text and order_text carefully to confirm the order is responding to that specific motion (entries usually cite "ECF No. X" or "Motion at ECF X"). If unclear, exclude.',
    '  Output structure: cited cl_ids should include every case with at least one substantive (granted/granted-in-camera/denied/partial) motion→order pair. The answer_markdown should give the user a sense of the distribution — how many full grants, how many in-camera-only, how many denials, what the courts cited as their grounds. Use the in-camera-only count specifically: that\'s usually the largest bucket for grand-jury-disclosure motions and the most easily mis-classified.',
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

/** Shape salvaged content into a spoke's synthesis schema (PR 4w). The
 *  idsField name differs per spoke (opinion_ids / document_ids /
 *  section_ids); list-mode is forced empty so the UI doesn't try to render
 *  partial cited rows. */
function buildSalvagedSynthesis(salvaged, outputMode, idsField) {
  const out = {
    answer_markdown: salvaged.answer_markdown,
    candor_notes: [salvaged.candor_note],
  };
  out[idsField] = outputMode === "narrative" ? null : [];
  return out;
}

/**
 * Salvage path for truncated synthesis output (PR 4w; addresses Note 4 from
 * Ben's first testing pass — "Could not parse synthesis: could not find a
 * JSON object"). When the model's response gets cut off mid-JSON before the
 * closing brace, our brace-balance parser returns null and the synthesis
 * call's spend is invisible from the user's perspective.
 *
 * Heuristic: find the `"answer_markdown":` key. If the tail past it lacks
 * the closing structure (`","candor_notes":` / `","<doc>_ids":` / `"}`), we
 * treat it as truncated and recover whatever markdown the model managed to
 * emit. Returns null when the response isn't truncated (let the normal
 * parser handle it) or when there's too little recoverable content to be
 * useful.
 *
 * Each `parse<Spoke>Synthesis` calls this as a last resort in its catch
 * chain, then shapes the salvage into the spoke-specific synthesis schema
 * (with the spoke's <doc>_ids field forced empty so the UI doesn't try to
 * render partial cited results).
 */
function salvageTruncatedSynthesis(raw) {
  const s = String(raw);
  const startMatch = s.match(/"answer_markdown"\s*:\s*"/);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const tail = s.slice(startIdx);
  // If the tail contains any of the closing structures, this isn't a
  // truncation — the issue is elsewhere; let the normal parser handle it.
  if (/"(\s*,\s*"(?:cl_ids|opinion_ids|section_ids|document_ids|candor_notes)"|\s*\})/.test(tail)) {
    return null;
  }
  // Undo JSON string-escape sequences in the salvaged markdown.
  let markdown = tail
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    // Drop a trailing partial escape character if the model was cut off
    // mid-escape.
    .replace(/\\$/, "")
    .trimEnd();
  // Too little content to be useful as a degraded answer.
  if (markdown.length < 50) return null;
  return {
    answer_markdown: markdown +
      "\n\n*[Output was truncated — the model ran out of tokens before completing the answer. Try re-running the question, or narrow it (smaller date range, single agency, single administration) to bring the synthesis output under the token cap.]*",
    candor_note:
      "Synthesis output was truncated mid-generation (token limit reached). The answer above is the partial markdown the model managed to emit before the cutoff; the remainder (additional cited sources, closing analysis) was not generated.",
  };
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

// Analyze-path analogues of repairAnswerMarkdownQuotes / salvageTruncatedSynthesis
// (Punchlist #6). The Analyze schema is { "markdown": "...", "annotations": [...] }
// rather than the synthesis schema's { "answer_markdown", "cl_ids", "candor_notes" },
// so these are keyed to the "markdown" field and its sole sibling "annotations".
// Without them, an unescaped quote in (or a truncated tail of) the multi-thousand-
// char analysis blew JSON.parse → a 502 with no salvage. Now parseAnalysis runs the
// same five-layer recovery chain parseSynthesis uses.
function repairAnalysisMarkdownQuotes(raw) {
  const s = String(raw);
  const startMatch = s.match(/"markdown"\s*:\s*"/);
  if (!startMatch) return s;
  const startIdx = startMatch.index + startMatch[0].length;
  const tail = s.slice(startIdx);
  // "markdown" is the FIRST field, so the real closer is the first separator to
  // the next field ("annotations"); fall back to the last "} only if absent.
  let boundary = tail.search(/"\s*,\s*"annotations"/);
  if (boundary < 0) {
    const endProbe = /"\s*\}/g;
    let m;
    while ((m = endProbe.exec(tail)) !== null) boundary = m.index;
  }
  if (boundary < 0) return s;
  const content = tail.slice(0, boundary);
  const repaired = content.replace(/(?<!\\)"/g, '\\"');
  return s.slice(0, startIdx) + repaired + tail.slice(boundary);
}

function salvageTruncatedAnalysis(raw) {
  const s = String(raw);
  const startMatch = s.match(/"markdown"\s*:\s*"/);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const tail = s.slice(startIdx);
  // If the tail still contains the closing structure, it isn't truncated —
  // let the normal parser handle whatever the real problem is.
  if (/"(\s*,\s*"annotations"|\s*\})/.test(tail)) return null;
  let markdown = tail
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\$/, "")
    .trimEnd();
  if (markdown.length < 50) return null;
  return {
    markdown: markdown +
      "\n\n*[Output was truncated — the model ran out of tokens before completing the analysis. Try re-running, or narrow the field (fewer cases) to bring the output under the token cap.]*",
    annotations: {},
  };
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
          catch (pe4) {
            // PR 4y: salvage truncated-mid-narrative synthesis (parity with
            // the four spokes). Returns a degraded narrative with a candor
            // note instead of a 502.
            const salvaged = salvageTruncatedSynthesis(raw);
            if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, 'cl_ids');
            throw new Error('JSON.parse error: ' + pe4.message);
          }
        }
      } else {
        const salvaged = salvageTruncatedSynthesis(raw);
        if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, 'cl_ids');
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
      v.cl_ids = v.cl_ids
        .filter(function (x) { return x != null; })
        .map(function (x) { return Number(x); })
        .filter(function (x) { return Number.isFinite(x); });
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
  try { results = await executeCorpusPlan(env, ctx, blob.plan, blob.scope); }
  catch (e) {
    if (e && e.code === "too_complex") {
      logCorpusFailure(request, env, ctx, { authMode: auth.authMode, userId: auth.userId, surface: "litigation", mode: "ama", question: blob.question, error: e.message });
      return json({ error: { message: TOO_COMPLEX_MSG, code: "too_complex" } }, 400);
    }
    if (e && e.code === "heavy_busy") return json({ error: { message: e.message, code: "heavy_busy" } }, 503);
    return json({ error: { message: e.message, code: "execute_failed" } }, 400);
  }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 8000 : 6000
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

// Repair unescaped double-quotes inside the "sql" field value (Punchlist #6).
// The model is asked for {"sql":"...","label":"..."}; SQL frequently contains
// double-quoted identifiers ("column"), which — if the model forgets to escape
// them — break JSON.parse. Escape stray quotes between the sql value's opening
// quote and the next closing structure ( ","label"  or  "} ).
function repairSqlGenQuotes(raw) {
  var s = String(raw);
  var startMatch = s.match(/"sql"\s*:\s*"/);
  if (!startMatch) return s;
  var startIdx = startMatch.index + startMatch[0].length;
  var tail = s.slice(startIdx);
  // "sql" is the FIRST field, so the real closer is the first separator to the
  // next field ("label"); fall back to the last "} only if absent.
  var boundary = tail.search(/"\s*,\s*"label"/);
  if (boundary < 0) {
    var endProbe = /"\s*\}/g;
    var m;
    while ((m = endProbe.exec(tail)) !== null) boundary = m.index;
  }
  if (boundary < 0) return s;
  var content = tail.slice(0, boundary);
  var repaired = content.replace(/(?<!\\)"/g, '\\"');
  return s.slice(0, startIdx) + repaired + tail.slice(boundary);
}

function parseSqlGen(raw) {
  var cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  var v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    // Mirror the synthesis recovery chain (Punchlist #6): quote-repair →
    // first-object-extract → repair-that. No truncation-salvage: a partial
    // SQL string must never reach execution.
    try {
      var repaired = repairSqlGenQuotes(cleaned);
      if (repaired !== cleaned) { v = JSON.parse(repaired); }
      else { throw pe; }
    } catch (pe2) {
      var firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) { v = JSON.parse(repairSqlGenQuotes(firstObj)); }
      } else {
        throw new Error('did not return valid JSON (response may have been truncated).');
      }
    }
  }
  if (typeof v !== 'object' || v === null) throw new Error('top-level value is not an object.');
  return v;
}

async function corpusSqlHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }

  // Confirm path: an authed user opted into "run anyway" on a query the guard
  // (or a runtime 60s timeout) flagged heavy. Runs the stored query at 90s; no
  // LLM generation, no prompt/provider validation needed here.
  if (body && typeof body.confirm_token === "string" && body.confirm_token) {
    return await corpusSqlConfirmHandler(request, env, ctx, body);
  }

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

  // 3) Pre-flight cost guard. If the planner estimates this query is expensive,
  // don't burn the protective 60s ceiling on it — offer the authed "run anyway"
  // (90s) path instead. SQL generation is already charged; the built query is
  // stored under a token so confirming doesn't regenerate/recharge it.
  const estCost = await corpusExplainCost(env, idsSql);
  if (estCost != null && estCost > heavyCostThreshold(env)) {
    return await offerRunAnyway(env, {
      idsSql, generatedSql, label, provider, model, auth,
      reason: "estimated_heavy", estCost,
      costCents: res.costCents, balanceCents: res.balanceCents
    });
  }

  // 4) Run at the 60s ceiling (one cold-cache retry). A 57014 timeout here means
  // the planner under-estimated — offer run-anyway rather than dead-ending.
  let idRows;
  try { idRows = await withStatementTimeoutRetry(() => corpusRunQuery(env, idsSql)); }
  catch (e) {
    if (is57014(e)) {
      logCorpusFailure(request, env, ctx, { authMode: auth.authMode, userId: auth.userId, surface: "litigation", mode: "sql", question: prompt, error: e.message });
      return await offerRunAnyway(env, {
        idsSql, generatedSql, label, provider, model, auth,
        reason: "timed_out",
        costCents: res.costCents, balanceCents: res.balanceCents
      });
    }
    return json({ error: { message: "The generated query failed: " + e.message, code: "query_failed", generated_sql: generatedSql } }, 400);
  }
  if (idRows.length > CLAUDE_MAX_RAW_ROWS) {
    return json({ error: { message: "The query matched " + idRows.length.toLocaleString("en-US") + " cases (cap is " + CLAUDE_MAX_RAW_ROWS.toLocaleString("en-US") + "). Try a more specific prompt.", code: "too_many_rows" } }, 400);
  }
  const matched = idRows.map((r) => r.cl_id).filter((x) => x != null);

  // 5) Fetch display rows for the first 10k by date (from the live corpus).
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

// Store the built (scope-applied) id-set query under a one-shot token and return
// a needs_confirmation envelope. The client shows a "this is broad — may take up
// to ~2 min" warning and, on confirm, re-posts the token to corpusSqlConfirmHandler
// which runs it at the 90s ceiling. `reason` distinguishes a proactive guard hit
// ("estimated_heavy", carries an estimate) from a runtime 60s timeout ("timed_out").
async function offerRunAnyway(env, opts) {
  const token = crypto.randomUUID();
  await env.QUOTA.put("sql:" + token, JSON.stringify({
    idsSql: opts.idsSql, generatedSql: opts.generatedSql, label: opts.label,
    provider: opts.provider, model: opts.model,
    userId: opts.auth.userId, authMode: opts.auth.authMode
  }), { expirationTtl: 900 });
  const out = {
    needs_confirmation: true,
    reason: opts.reason,
    token,
    generated_sql: opts.generatedSql,
    label: opts.label,
    _cost_cents: opts.costCents,
    _balance_cents: opts.balanceCents
  };
  if (opts.estCost != null) out.estimate = { cost: Math.round(opts.estCost) };
  return json(out, 200);
}

// Confirm path for Claude SQL: the authed user opted into "run anyway". Skips LLM
// generation (already charged on the original call) — runs the stored query at
// the 90s ceiling (run_query_heavy) under the heavy-query back-pressure cap. No
// model call here, so no further charge.
async function corpusSqlConfirmHandler(request, env, ctx, body) {
  const token = body.confirm_token;
  const stored = await env.QUOTA.get("sql:" + token);
  if (!stored) return json({ error: { message: "This search expired — re-run it.", code: "confirm_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored search is corrupt — re-run it." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider || "anthropic", body);
  if (auth instanceof Response) return auth;
  // A paid plan may only be executed by the same account that planned it.
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This search belongs to a different session. Re-run it." } }, 403);
  }
  // Heavy-query back-pressure: bound how many 90s queries run at once so a burst
  // can't thrash the shared corpus instance for everyone.
  if (!(await reserveHeavySlot(env, ctx))) {
    return json({ error: { message: "The system is busy with other large searches right now. Try again in a moment, or narrow your search.", code: "heavy_busy" } }, 503);
  }
  // One-shot token (consume now).
  ctx.waitUntil(env.QUOTA.delete("sql:" + token));

  let idRows;
  try { idRows = await corpusRunQueryHeavy(env, blob.idsSql); }
  catch (e) {
    if (is57014(e)) {
      logCorpusFailure(request, env, ctx, { authMode: auth.authMode, userId: auth.userId, surface: "litigation", mode: "sql", question: blob.label, error: "heavy/90s: " + e.message });
      return json({ error: { message: TOO_COMPLEX_MSG, code: "too_complex", generated_sql: blob.generatedSql } }, 400);
    }
    return json({ error: { message: "The generated query failed: " + e.message, code: "query_failed", generated_sql: blob.generatedSql } }, 400);
  }
  if (idRows.length > CLAUDE_MAX_RAW_ROWS) {
    return json({ error: { message: "The query matched " + idRows.length.toLocaleString("en-US") + " cases (cap is " + CLAUDE_MAX_RAW_ROWS.toLocaleString("en-US") + "). Try a more specific prompt.", code: "too_many_rows" } }, 400);
  }
  const matched = idRows.map((r) => r.cl_id).filter((x) => x != null);
  let displayRows = [];
  if (matched.length > 0) {
    const displaySql = "SELECT " + SQL_DISPLAY_COLS + " FROM cases WHERE cl_id IN (" + matched.join(",") + ") ORDER BY date_filed DESC NULLS LAST LIMIT 10000";
    try { displayRows = await corpusRunQuery(env, displaySql); }
    catch (e) { return json({ error: { message: "Fetching display rows failed: " + e.message } }, 502); }
  }
  return json({
    generated_sql: blob.generatedSql,
    label: blob.label,
    cl_ids: matched,
    count: matched.length,
    display_rows: displayRows,
    _cost_cents: 0,
    _balance_cents: null
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
    "- MATCH BY FUNCTION, NOT BY LITERAL PHRASE. The criterion is often in researcher-language; the docket is in lawyer-language. They describe the same legal operation with different vocabulary. Treat the criterion as the operation it names, and treat a docket entry as a match if the operation it describes is the same — even when the words differ. Examples:\n" +
    "    * Criterion 'sought disclosure of grand jury materials due to prosecutorial misconduct' MATCHES an entry captioned 'MOTION to Dismiss Indictment based on Fifth Amendment, Rule 6, and Grand Jury Violations' (same operation: defense moving on grand-jury-process grounds).\n" +
    "    * Criterion 'sought disclosure of grand jury materials' MATCHES 'MOTION for Disclosure of Certain Grand Jury Records' (same operation; different noun for the materials).\n" +
    "    * Criterion 'prosecutorial misconduct' MATCHES 'Vindictive and Selective Prosecution', 'Outrageous Government Conduct', 'Brady violations', 'Giglio violations' (umbrella concept vs. specific doctrinal articulations of it).\n" +
    "    * Criterion 'speedy trial issues' MATCHES motions citing 18 U.S.C. § 3161 or 'Speedy Trial Act'.\n" +
    "  When you keep on a functional-equivalence basis, the 'reason' should name the specific docket-language match (e.g., 'Entry 211: Motion to Dismiss for Rule 6 and Grand Jury Violations — same as disclosure-for-misconduct').\n" +
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
    // Mirror parseSynthesis's recovery chain (Punchlist #6): quote-repair →
    // first-object-extract → repair-that → truncation-salvage, before giving up.
    try {
      const repaired = repairAnalysisMarkdownQuotes(cleaned);
      if (repaired !== cleaned) { parsed = JSON.parse(repaired); }
      else { throw pe; }
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { parsed = JSON.parse(firstObj); }
        catch (pe3) {
          try { parsed = JSON.parse(repairAnalysisMarkdownQuotes(firstObj)); }
          catch (pe4) {
            const salvaged = salvageTruncatedAnalysis(raw);
            if (salvaged) return salvaged;
            throw new Error('did not return valid JSON (may be truncated).');
          }
        }
      } else {
        const salvaged = salvageTruncatedAnalysis(raw);
        if (salvaged) return salvaged;
        throw new Error('did not return valid JSON (may be truncated).');
      }
    }
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
  // The full id-set is the scope for downstream AI ops. The frontend inlines it
  // only up to 25k ids (SCOPE_LITERAL_LIMIT) and otherwise sends `scope_sql`
  // (the unbounded query) instead — so materializing every id past the cap is
  // pure waste AND slow (a broad filter hits 91k+ rows → ~30s + the JSON
  // transfer of all those ids). Cap the materialization at 25k+1: ≤25k returns
  // the real set; >25k returns 25001 ids (the length signals "too big" so the
  // frontend switches to scope_sql) plus a truthful count(*) for the breadcrumb.
  // `executed_sql` stays the UNBOUNDED query so scope_sql still covers the set.
  const FILTER_ID_CAP = 25000;
  const scopeSql = "SELECT cl_id FROM cases" + where;
  // No ORDER BY on the id-set query — ordering a set is pointless and forces a
  // sort of the whole match set. The display query keeps it (for the paged view).
  const idsSql = scopeSql + " LIMIT " + (FILTER_ID_CAP + 1);
  const rowsSql = "SELECT " + SQL_DISPLAY_COLS + " FROM cases" + where + " ORDER BY date_filed DESC NULLS LAST LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "Filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const clIds = idRows.map((r) => r.cl_id).filter((x) => x != null);
  let count = clIds.length;
  if (clIds.length > FILTER_ID_CAP) {
    // Capped — get the true count so the displayed total stays truthful (#7).
    try {
      const cnt = await corpusRunQuery(env, "SELECT count(*)::int AS n FROM cases" + where);
      if (cnt && cnt[0] && typeof cnt[0].n === "number") count = cnt[0].n;
    } catch { /* keep the capped length as a floor if the count query fails */ }
  }
  return json({
    cl_ids: clIds,
    display_rows: rows,
    count,
    generated_sql: rowsSql,
    executed_sql: scopeSql
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

// ============================================================================
// USC (United States Code) corpus — v1 alpha (manual filter)
//
// First non-litigation spoke. Different schema (usc_sections), different
// filter axes (title / positive-law / status / FTS / citation), different
// "rows" shape (citation + heading instead of case_name + docket).
//
// Display columns kept minimal: enough for the manual-filter results
// table — `id`, `title_num`, `title_name`, `citation`, `heading`,
// `section_identifier`, `is_positive_law`, `status`, `text_length`. The
// full `text_content` is fetched separately by the section-detail view
// (lands in a follow-up PR).
//
// AI modes for USC need USC-shaped system prompts (the cases schema doc
// doesn't apply) and land in their own PR; v1 alpha is keyword + metadata
// filtering only, per brief #3's free-tier metadata floor principle.
// ============================================================================

var USC_DISPLAY_COLS = "id, title_num, title_name, citation, heading, section_identifier, is_positive_law, status, text_length";

/**
 * Build the WHERE clause for /corpus/usc/filter. Only fields the user
 * explicitly provided land in the SQL — empty / undefined fields are
 * dropped. Inputs that go into the SQL as literals are escaped via the
 * same single-quote-doubling rule the litigation handler uses; integer
 * fields are coerced and rejected if non-finite (preventing injection).
 *
 * Supported axes:
 *   search             FTS over fts (websearch_to_tsquery)
 *   title              integer title number; exact match on title_num
 *   citation           "8 U.S.C. § 1225" — exact match on the canonical
 *                      citation column (the #1 USC entry path per brief
 *                      #3 §1 question #2)
 *   positiveLaw        boolean — true filters to is_positive_law sections
 *   status             active / repealed / etc — exact match on status
 *   heading            substring (ILIKE %heading%) on the section heading
 */
function buildUscFilterWhere(fields) {
  var parts = [];
  if (fields.search && typeof fields.search === 'string' && fields.search.trim()) {
    var q = fields.search.trim().replace(/'/g, "''");
    parts.push("fts @@ websearch_to_tsquery('english', '" + q + "')");
  }
  if (fields.title != null) {
    var t = Number(fields.title);
    if (Number.isFinite(t)) parts.push("title_num = " + Math.floor(t));
  }
  if (fields.citation && typeof fields.citation === 'string' && fields.citation.trim()) {
    var c = fields.citation.trim().replace(/'/g, "''");
    parts.push("citation = '" + c + "'");
  }
  if (fields.heading && typeof fields.heading === 'string' && fields.heading.trim()) {
    var h = fields.heading.trim().replace(/'/g, "''");
    parts.push("heading ILIKE '%" + h + "%'");
  }
  if (fields.positiveLaw === true) parts.push("is_positive_law = true");
  if (fields.positiveLaw === false) parts.push("is_positive_law = false");
  if (fields.status && typeof fields.status === 'string' && fields.status.trim()) {
    var s = fields.status.trim().replace(/'/g, "''");
    parts.push("status = '" + s + "'");
  }
  return parts.length ? " WHERE " + parts.join(" AND ") : "";
}

async function corpusUscFacetsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  try {
    const stats = await corpusRunQuery(env,
      "SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.usc_sections'::regclass) AS section_count, " +
      "(SELECT MAX(release_point) FROM usc_sections) AS release_point");
    // Title list — (title_num, title_name) pairs, distinct, ordered numerically.
    // 53 titles is small enough to ship as a single fetch.
    const titles = await corpusRunQuery(env,
      "SELECT title_num, title_name FROM (" +
      "SELECT DISTINCT title_num, title_name FROM usc_sections WHERE title_num IS NOT NULL" +
      ") z ORDER BY title_num");
    const statuses = await corpusRunQuery(env,
      "SELECT v FROM (" +
      "SELECT DISTINCT status AS v FROM usc_sections WHERE status IS NOT NULL AND status <> ''" +
      ") z ORDER BY v");
    const s = stats[0] || {};
    return json({
      section_count: s.section_count,
      release_point: s.release_point,
      titles: titles.map((r) => ({ num: r.title_num, name: r.title_name })),
      statuses: statuses.map((r) => r.v)
    }, 200);
  } catch (e) {
    return json({ error: { message: "USC facets fetch failed: " + e.message } }, 502);
  }
}

async function corpusUscFilterHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const fields = (body && body.fields) || {};
  const where = buildUscFilterWhere(fields);
  // Match the litigation pattern: id-set query + display query. USC has no
  // scope-stacking yet (v1 alpha has no stack runtime), so no scope param.
  const idsSql = "SELECT id FROM usc_sections" + where;
  const rowsSql = "SELECT " + USC_DISPLAY_COLS + " FROM usc_sections" + where +
    " ORDER BY title_num NULLS LAST, section_num NULLS LAST LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "USC filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const ids = idRows.map((r) => r.id).filter((x) => x != null);
  return json({
    ids,
    display_rows: rows,
    count: ids.length,
    generated_sql: rowsSql,
    executed_sql: idsSql
  }, 200);
}

/**
 * Single-section detail for the USC section panel. Returns the row plus
 * the full text_content (which the list endpoint omits to keep the table
 * payload small). Used by the section detail sheet that opens on row
 * click in the USC manual filter results.
 *
 * Fields returned: id + every column the panel surfaces (citation,
 * heading, hierarchy chain, status, positive-law flag, release point,
 * statutory text, source_credit, notes). text_length is included so the
 * panel can quickly show "this is a 12,478-character section" without
 * scanning the body.
 */
async function corpusUscSectionHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }
  const sql = "SELECT id, title_num, title_name, subtitle, chapter, subchapter, part, " +
    "structure_path, section_identifier, section_num, citation, heading, text_content, " +
    "text_length, source_credit, notes, status, is_positive_law, release_point " +
    "FROM usc_sections WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Section fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Section not found", code: "not_found" } }, 404);
  }
  return json({ section: rows[0] }, 200);
}

// ── USC AI modes (PR 4s) ────────────────────────────────────────────────────
// Brief #3 §3 names three co-equal flagships (A Legality / B Authority /
// C Topical synthesis) plus read-a-section + analytical-with-method, all
// served via ONE claude_ama mode whose planner picks output_mode per
// question shape ("no query-architecture buttons"). Plus a per-section
// summarize action on the detail panel.
//
// v1 ships single-corpus AI. The cross-corpus joins (USC↔CFR/OLC/litigation)
// and the definitional layer per brief #3 §6 are pipeline-side dependencies
// — they need join tables + a parsed usc_definitions table that don't exist
// yet. They land in follow-up PRs.

var USC_SCOPE_LITERAL_LIMIT = 25000;

function normalizeUscScope(s) {
  s = s || {};
  let ids = Array.isArray(s.section_ids)
    ? s.section_ids.filter((x) => x != null).map(Number).filter(Number.isFinite)
    : null;
  if (ids && ids.length === 0) ids = null;
  return {
    section_ids: ids,
    is_full_db: !ids,
    count: Number(s.count) || (ids ? ids.length : 0),
    description: typeof s.description === "string" && s.description.trim() ? s.description.trim() : ""
  };
}

var USC_AMA_SCHEMA_DOC = [
  "TABLE: usc_sections — one row per USC section (60,416 sections; all 53 titles; release point 119-93, single point in time).",
  "  id (bigint, PK)               — section id; use this in citations.",
  "  title_num (smallint)          — Title number (1–54; 53 occupied; missing numbers reserved/repealed at the title level).",
  "  title_name (text)             — Title name (e.g. 'Crimes and Criminal Procedure' for Title 18).",
  "  subtitle (text)               — Subtitle (Title 26 has 'A'..'K', most titles have none).",
  "  chapter (text)                — Chapter identifier within title, stored as a VERBOSE LABEL (e.g. 'CHAPTER 47— UNIFORM CODE OF MILITARY JUSTICE'). Do NOT filter chapter = '47' — it returns zero rows. Use chapter_num for scoping.",
  "  chapter_num (text, generated) — Bare chapter identifier extracted from the chapter label ('47', '1223'). USE THIS to scope by chapter: WHERE title_num=10 AND chapter_num='47'.",
  "  subchapter (text)             — Subchapter (verbose label, same caveat as chapter).",
  "  part (text)                   — Part.",
  "  structure_path (text)         — Slash-delimited hierarchy path (e.g. '18/I/63/1112').",
  "  section_num (text)            — Section number, often complex (e.g. '101', '1010-1', '2000bb-1').",
  "  section_identifier (text)     — Machine-friendly identifier.",
  "  citation (text)               — Canonical citation form (e.g. '18 U.S.C. § 1112').",
  "  heading (text)                — Section heading.",
  "  text_content (text)           — Full section text; LARGE for some long sections — DO NOT pull in planned queries.",
  "  text_length (int)             — Character count.",
  "  is_positive_law (boolean)     — True for positive-law titles (Title 18 etc.); for non-positive titles (Title 26 / Internal Revenue Code, Title 50 / War and National Defense) the codified text is an ORGANIZED RESTATEMENT of the underlying Statutes at Large — surface this when a non-positive-title section drives the answer.",
  "  status (text)                 — Section status ('active', 'repealed', 'omitted', etc.). Repealed sections are INCLUDED in the corpus with a status flag, not filtered out.",
  "  source_credit (text)          — The 'Pub. L. 85-768, § 1, 72 Stat. 921' legislative-history footer.",
  "  notes (text)                  — Editorial notes from the Office of Law Revision Counsel (drafter-curated, not commentary).",
  "  release_point (text)          — Currency marker (currently '119-93' across the corpus). Surface as 'as of [release_point]; changes since not reflected' in every answer.",
  "  fts (tsvector, generated)     — to_tsvector('english', heading || ' ' || text_content) — use for topical search.",
  "",
  "NOTES:",
  "- Topical/conceptual search: WHERE fts @@ websearch_to_tsquery('english', 'your search'). Note: USC is dense legalese; sparse queries underperform. Use OR generously.",
  "- Citation lookup: 'What does 8 U.S.C. § 1225 say?' → WHERE citation = '8 U.S.C. § 1225' (exact match). The defining USC interaction.",
  "- Title scope: 'tax law' → title_num = 26 OR title_num = 11. 'criminal law' → title_num = 18.",
  "- Hierarchy browse: filter by structure_path ILIKE 'TITLE/CHAPTER/%' to scope to a chapter.",
  "- ANALYTICAL COUNTS. Always include the denominator and the matching pattern in candor_notes. Example: 'Pattern-matched on imprison|fine of not more than|punishable by across all 60,416 sections; 12,478 matched. Counts sections containing penalty language, not crimes; some matches are procedural.'",
  "- POSITIVE-LAW CAVEAT. When an answer leans on a NON-positive-law title section (is_positive_law=false), surface this in candor_notes: 'The relevant text is in Title 26, a non-positive-law title — the codified text here is an organized restatement of the underlying Statutes at Large. The Statutes at Large are the legally binding source.'",
  "- RELEASE-POINT CAVEAT. Every answer carries the release-point currency marker; analytical answers and synthesis must both include it.",
  "- CONSTITUTION GAP. When the answer turns substantially on Article II / Bill of Rights, surface this transparently in candor_notes: 'The answer turns substantially on [Article II / Amendment N], which is outside USC's scope. RAGtime does not yet hold the constitutional text; see [pointer in synthesis].'",
  "- Read-only: only SELECT statements; cap planned queries at LIMIT 500."
].join("\n");

function buildUscPlanningSystem() {
  return [
    "You are the planner for an agentic legal-research tool over the United States Code — the codified federal statutes (60,416 sections, all 53 titles, release point 119-93). USC sections are the binding text of federal law; treat with the highest authoritative status of anything in this system.",
    "",
    "You have access to a Postgres database (read-only) via SELECT queries. Schema:",
    "",
    USC_AMA_SCHEMA_DOC,
    "",
    "Output a single JSON object with these keys (no prose, no code fences):",
    "{",
    '  "output_mode": "list" | "narrative" | "hybrid",',
    "       // list = the question wants a refined set of sections (the field will be narrowed).",
    "       // narrative = the question wants a legal-analysis answer; the field is unchanged.",
    "       // hybrid = both — a synthesis + the supporting sections (most flagship questions).",
    '  "approach_summary": "2-4 sentence plan, plain prose, no markdown headers",',
    '  "candor_notes": ["caveats — release-point currency, non-positive-law restatement, constitution gap, denominator for analytical counts, narrowed-keyword recall risk"],',
    '  "queries": [',
    '    {"label": "what this query gathers", "sql": "SELECT ... FROM usc_sections WHERE ... LIMIT 200"},',
    "    ...",
    "  ],",
    '  "estimated_cost_cents": <integer>,',
    "       // your estimate of the synthesis call cost in cents (the planning call is already paid).",
    "       // Synthesis input ≈ all query results in JSON; output ≈ 800-2000 tokens.",
    "       // Anthropic Sonnet pricing × 1.35 markup is roughly: input 0.4¢/1K tokens, output 2¢/1K tokens.",
    '  "wants_synthesis": true',
    "}",
    "",
    "Rules:",
    "- Question shape → output_mode mapping (three flagships recognized internally, no separate UI modes):",
    "    * 'Is it lawful for X to do Y' → output_mode='hybrid' (Flagship A: Legality synthesis). Pull the relevant sections + write the legal analysis.",
    "    * 'Can the President / [agency] do X' → output_mode='hybrid' (Flagship B: Authority synthesis). Pull statutory authorities from USC. Add a candor_note that v1 does not yet cross-reference CFR (implementing regs), OLC (executive interpretation), or litigation (challenges) — those are deferred to a follow-up.",
    "    * 'Summarize federal law on [domain]' / 'What does the UCMJ say about X' → output_mode='hybrid' (Flagship C: Topical synthesis). Scope by title_num (e.g. UCMJ = title_num=10 AND chapter_num='47'). Synthesis writes a structured narrative.",
    "    * 'What does 8 U.S.C. § 1225 say' → output_mode='list' (read-a-section). Citation lookup + synthesis renders the section.",
    "    * 'Show me laws that involve X' / 'Is there any law forbidding X' → output_mode='list' (retrieval/coverage).",
    "    * 'How many laws contain criminal penalties' / 'How many sections do Y' → output_mode='narrative' (analytical) with denominator + methodology in candor_notes.",
    "- PULL METADATA, NOT FULL TEXT. Planned queries should select id, citation, heading, title_num, structure_path, is_positive_law, status — NEVER text_content. Synthesis works from headings + citations; the user reads full text via the detail sheet.",
    "- USE CITATION LOOKUP when the question names a specific citation. WHERE citation = '8 U.S.C. § 1225' is faster + more reliable than FTS.",
    "- USE TITLE SCOPE when the question targets a known title or chapter. 'tax' → title_num IN (26, 11). 'criminal' → title_num=18. 'UCMJ' → title_num=10 AND chapter_num='47' (chapter is a verbose label — scope via chapter_num, never chapter).",
    "- KEYWORD UNDERPERFORMS — FAN OUT WITH OR GENEROUSLY. The user's phrasing is often NOT the statute's phrasing. Single-term ANDed queries will under-recall. Specific failure modes you must guard against:",
    "    * **Agency name vs statutory formulation.** User says 'National Park Service regulations'; the criminal statute says 'rules and regulations prescribed by the Secretary of the Interior governing the use of the National Park System'. Searching just 'National Park Service' will miss it. Always fan: 'National Park Service' OR 'National Park System' OR 'Park Service' OR 'Secretary of the Interior'. Same pattern for any agency: include the parent department, the umbrella system, and the official-position formulation.",
    "    * **Criminal-statute formulation.** User says 'crime to violate'; criminal statutes use generic formulations: 'Whoever violates', 'shall be fined', 'imprisoned not more than', 'punishable by'. Add an FTS branch covering these patterns when the question is about criminal liability: websearch_to_tsquery('english', '\"shall be fined\" OR \"imprisoned\" OR \"Whoever violates\"').",
    "    * **Conceptual / doctrinal queries.** 'Due process', 'commerce clause', 'preemption' — concepts may not appear as keyword phrases in the operative text. Fan to common formulations + add a candor note that keyword search may under-recall conceptual questions and semantic retrieval (pgvector) is Phase 2.",
    "  WORKED EXAMPLE — *'federal criminal statutes that make it a crime to violate National Park Service regulations'*: known ground truth = 18 U.S.C. § 1865, which uses statutory phrasings 'Secretary of the Interior', 'rules and regulations', 'shall be fined or imprisoned'. A good plan combines title_num IN (16, 18, 54) (the conservation + crimes + national-parks-program titles) with FTS that fans: websearch_to_tsquery('english', '(\"National Park Service\" OR \"National Park System\" OR \"Park Service\" OR \"Secretary of the Interior\") AND (\"shall be fined\" OR \"imprisoned\" OR \"Whoever violates\" OR \"rules and regulations\")'). A BAD plan: filter on title_num=18 AND fts ~ 'National Park Service' (will return 0 — the agency name isn't in the statute).",
    "- ANALYTICAL COUNTS. Always surface the denominator and the matching pattern: 'Pattern-matched on [terms] across all 60,416 sections; N matched. Counts X, not Y.'",
    "- NARRATIVE DISCIPLINE. For output_mode='narrative' or 'hybrid', prefer 2–4 queries, NOT 6+. Synthesis has a finite output-token budget (currently 8000 for narrative); too many queries inflate the synthesis input and risk truncation mid-answer. A single well-fanned query with strong OR coverage is better than five literal-term queries.",
    "- CONSTITUTION GAP. When an answer turns substantially on Article II or the Bill of Rights, add a candor_note that RAGtime does not hold the constitutional text yet (post-launch acquisition).",
    "- NEVER editorialize. USC sections are binding text; describe what they say, do not opine on policy or interpretation beyond what's textually grounded.",
    "- WHEN THE CURRENT SCOPE IS NARROWED (section_ids list provided): use the name \"scoped_usc_sections\" instead of \"usc_sections\". The runner substitutes this with an inline subquery filtered to the scope. CRITICAL: reference this name ONLY after FROM or JOIN keywords, and DO NOT alias it. WHEN SCOPE IS THE FULL CORPUS: use \"usc_sections\".",
    LEGAL_ADVICE_PLANNER_RULE,
    "- Output strict JSON only. No markdown. No code fences. No prose outside the object."
  ].join("\n");
}

function buildUscPlanningUser(question, scope) {
  return [
    "USER QUESTION:",
    question,
    "",
    "CURRENT SCOPE:",
    scope.description || (scope.is_full_db
      ? "The full USC corpus — all 60,416 sections across 53 titles, release point 119-93."
      : fmtIntJs(scope.count) + " sections (narrowed)."),
    scope.is_full_db
      ? "(no section_id constraint — your queries run against the full corpus; use the table name \"usc_sections\")"
      : "(narrowed to " + fmtIntJs(scope.count) + " section_ids; the runner will substitute scoped_usc_sections with an inline subquery filtered to the scope — use THAT name in your queries)",
    "",
    "Return the JSON plan now."
  ].join("\n");
}

function parseUscPlan(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) {
      try { v = JSON.parse(firstObj); }
      catch (pe2) { throw new Error("JSON.parse error: " + pe2.message); }
    } else {
      throw new Error("could not find a JSON object in the response.");
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (["list", "narrative", "hybrid"].indexOf(v.output_mode) < 0) throw new Error("output_mode must be list, narrative, or hybrid.");
  if (!Array.isArray(v.queries)) throw new Error("queries must be an array.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  v.estimated_cost_cents = Math.max(0, Math.round(Number(v.estimated_cost_cents) || 0));
  v.approach_summary = String(v.approach_summary || "").trim();
  return v;
}

async function executeUscPlan(env, plan, scope) {
  let scopedBody = null;
  if (scope.section_ids && scope.section_ids.length > 0) {
    if (scope.section_ids.length > USC_SCOPE_LITERAL_LIMIT) {
      throw new Error("Scope is " + fmtIntJs(scope.section_ids.length) + " sections — too large to inline (cap " + fmtIntJs(USC_SCOPE_LITERAL_LIMIT) + "). Narrow further with the filter before running synthesis.");
    }
    const idsSubquery = "SELECT unnest('{" + scope.section_ids.join(",") + "}'::bigint[]) AS id";
    scopedBody = "(SELECT s.* FROM usc_sections s WHERE s.id IN (" + idsSubquery + "))";
  }

  const results = [];
  for (let i = 0; i < plan.queries.length; i++) {
    const q = plan.queries[i];
    let sql = String(q.sql || "").trim().replace(/;\s*$/, "").trim();
    if (!sql) continue;
    let execSql = sql;
    if (scopedBody) {
      execSql = substituteScoped(execSql, "scoped_usc_sections", scopedBody);
    }
    if (!/^\s*SELECT\b/i.test(execSql)) execSql = "SELECT * FROM (" + execSql + ") AS usc_q";
    let rows;
    try { rows = await withStatementTimeoutRetry(() => corpusRunQuery(env, execSql)); }
    catch (err) { throw new Error('Query "' + (q.label || ("query " + (i + 1))) + '" failed: ' + err.message); }
    const truncated = (rows.length > 200) ? rows.slice(0, 200) : rows;
    results.push({ label: q.label || ("query " + (i + 1)), sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 200 });
  }
  return results;
}

function buildUscSynthesisSystem(outputMode) {
  const listClause = (outputMode === "list" || outputMode === "hybrid")
    ? '"section_ids": [<bigint>, ...]   // the section ids the user should see; pulled from your query results.'
    : '"section_ids": null';
  return [
    "You are the synthesis step for an agentic legal-research tool over the United States Code. The planner has run the SQL queries you proposed; you now have the question, the plan, and the query results. Write the user-facing answer.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "answer_markdown": "...",  // markdown narrative; cite specific sections in prose using canonical USC citation form (e.g. "18 U.S.C. § 1112"). DO NOT embed internal id tokens.',
    "  " + listClause + ",",
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    "}",
    "",
    "Rules:",
    "- USC sections are BINDING federal law. Describe what the text says; never opine on policy correctness, never invent interpretation that isn't textually grounded.",
    "- CITE EVERY CLAIM via the canonical USC citation in PROSE — '18 U.S.C. § 1112', '8 U.S.C. § 1225(b)(1)(A)(ii)', etc. The user navigates to each cited section via the Cited Sections list that renders below the narrative; do NOT embed [usc-ref:N] tokens or any other internal id markers. Bad: '...Under 8 U.S.C. § 1225 [usc-ref:12345], an alien...'. Good: '...Under 8 U.S.C. § 1225, an alien...'.",
    "- RELEASE-POINT CURRENCY. Every answer that turns on specific section text must include the currency caveat in candor_notes: 'Current as of release 119-93; changes since not reflected.'",
    "- NON-POSITIVE-LAW. When the answer leans on a non-positive-law title section (is_positive_law=false on that row), surface this in candor_notes: 'The relevant section is in [Title N], a non-positive-law title — the codified text here is an organized restatement of the underlying Statutes at Large.' This is especially load-bearing for Title 26 (Internal Revenue Code) and Title 50 (War and National Defense).",
    "- CONSTITUTION GAP. If the answer turns substantially on Article II / Bill of Rights, lead with that limitation: 'The answer turns substantially on [Article II § N / the Nth Amendment], which is outside USC's scope (RAGtime does not yet hold the constitutional text). Within USC, [the analysis follows].'",
    "- AUTHORITY SYNTHESIS (Flagship B) note. If the question asks 'Can the President / [agency] do X', surface in candor_notes that v1 does not yet cross-reference CFR (implementing regulations), OLC (executive interpretation), or litigation (challenges) — those are deferred. The USC answer is the statutory-authority piece only.",
    "- ANALYTICAL ANSWERS. Surface the denominator and the matching pattern in answer_markdown itself, not just candor_notes: 'Of 60,416 sections, N matched the pattern [pattern].'",
    "- ZERO-RESULT HONESTY. When the query results are empty (or near-empty) for what should be a non-trivial question, the answer_markdown MUST: (1) name the FTS terms tried in prose ('I searched titles 16, 18, and 54 for the phrases ...'), (2) acknowledge this may be a keyword recall failure rather than a true absence of statute on the topic — explain that the statute may use different language than the question's phrasing (a common pattern: questions name agencies; statutes name the umbrella department or the official's title), and (3) suggest one or two reformulations the user could try. DO NOT just say 'no results found' — that's opaque about whether USC is genuinely silent or the keyword search missed.",
    "- For list/hybrid output_modes, section_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable sections, downgrade to narrative and explain.",
    "- Be tight. The user wants the legal answer, not a methodology essay. Keep candor_notes for caveats.",
    "- Output strict JSON only. No markdown outside answer_markdown. No code fences.",
    '- CRITICAL: inside answer_markdown, do NOT use straight double quotes (") — they break JSON parsing when not escaped. Use curly quotes ("") for direct quotation, or single quotes (\'\' or \') for short inline quotation. Apostrophes (\') are fine. If you absolutely must use a straight double quote, escape it as \\".'
  ].join("\n");
}

function buildUscSynthesisUser(question, plan, results) {
  const resultsForModel = results.map(function (r) {
    return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated, rows: r.rows };
  });
  return [
    "USER QUESTION:",
    question,
    "",
    "YOUR PLAN (from the planning step):",
    plan.approach_summary,
    "",
    "PLANNED OUTPUT MODE: " + plan.output_mode,
    "",
    "CANDOR NOTES FROM PLANNING:",
    (plan.candor_notes && plan.candor_notes.length) ? plan.candor_notes.map(function (n) { return "- " + n; }).join("\n") : "(none)",
    "",
    "QUERY RESULTS (JSON):",
    JSON.stringify(resultsForModel, null, 2),
    "",
    "Return the synthesis JSON now."
  ].join("\n");
}

function parseUscSynthesis(raw, outputMode) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
          catch (pe4) {
            const salvaged = salvageTruncatedSynthesis(raw);
            if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "section_ids");
            throw new Error("JSON.parse error: " + pe4.message);
          }
        }
      } else {
        const salvaged = salvageTruncatedSynthesis(raw);
        if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "section_ids");
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.answer_markdown !== "string" || !v.answer_markdown.trim()) throw new Error("answer_markdown is empty.");
  if (outputMode === "list" || outputMode === "hybrid") {
    if (!Array.isArray(v.section_ids) || v.section_ids.length === 0) {
      v.section_ids = [];
      v.candor_notes = (v.candor_notes || []).concat(["Output mode requested a section list but synthesis returned none — showing narrative only."]);
    } else {
      v.section_ids = v.section_ids
        .filter(function (x) { return x != null; })
        .map(function (x) { return Number(x); })
        .filter(function (x) { return Number.isFinite(x); });
    }
  } else {
    v.section_ids = null;
  }
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusUscPlanHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const question = String((body && body.question) || "").trim();
  if (!question) return json({ error: { message: "Missing question" } }, 400);
  const scope = normalizeUscScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildUscPlanningSystem(),
      messages: [{ role: "user", content: buildUscPlanningUser(question, scope) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Planning step: " + e.message, code: e.code } }, e.status || 502);
  }
  let plan;
  try { plan = parseUscPlan(res.text); }
  catch (e) { return json({ error: { message: "Could not parse plan: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const token = crypto.randomUUID();
  await env.QUOTA.put("usc-plan:" + token, JSON.stringify({
    plan, scope, question, provider, model, userId: auth.userId, authMode: auth.authMode
  }), { expirationTtl: 900 });

  return json({
    token,
    output_mode: plan.output_mode,
    approach_summary: plan.approach_summary,
    candor_notes: plan.candor_notes,
    queries: plan.queries.map(function (q) { return { label: q.label, sql: q.sql }; }),
    estimated_cost_cents: plan.estimated_cost_cents,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

async function corpusUscExecuteHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const token = body && body.token;
  if (!token || typeof token !== "string") return json({ error: { message: "Missing plan token" } }, 400);
  const stored = await env.QUOTA.get("usc-plan:" + token);
  if (!stored) return json({ error: { message: "Plan expired or not found — re-run the question.", code: "plan_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored plan is corrupt — re-run the question." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider, body);
  if (auth instanceof Response) return auth;
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This plan belongs to a different session. Re-run the question." } }, 403);
  }
  ctx.waitUntil(env.QUOTA.delete("usc-plan:" + token));

  let results;
  try { results = await executeUscPlan(env, blob.plan, blob.scope); }
  catch (e) { return json({ error: { message: e.message, code: "execute_failed" } }, 400); }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildUscSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildUscSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 8000 : 6000
    });
  } catch (e) {
    return json({ error: { message: "Synthesis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let synth;
  try { synth = parseUscSynthesis(res.text, blob.plan.output_mode); }
  catch (e) { return json({ error: { message: "Could not parse synthesis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    answer_markdown: synth.answer_markdown,
    section_ids: synth.section_ids,
    candor_notes: synth.candor_notes,
    output_mode: blob.plan.output_mode,
    query_summary: results.map(function (r) { return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated }; }),
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── USC: summarize one section ──────────────────────────────────────────────
// Brief #3 §3 "plus" — read-a-section. Single billed call against one
// section's text_content. USC-specific structured headings (What it does /
// Scope / Key terms / Cross-references / Notes on currency).

var USC_SUMMARIZE_TEXT_CAP = 150000;

function buildUscSummarizeSystem() {
  return [
    "You are summarizing one section of the United States Code for a researcher. USC sections are the binding text of federal law; treat with the highest authoritative weight. Your job: a structured, attribution-forward summary, never editorialize.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "summary_markdown": "...",  // markdown summary, 4-8 short paragraphs.',
    '  "candor_notes": ["caveats — release-point currency, non-positive-law restatement, repealed status, truncation"]',
    "}",
    "",
    "Structure the summary_markdown around these headings (omit any that don't apply):",
    "- **What it does** — the operative rule in plain English, 1-3 sentences.",
    "- **Scope** — to whom / what / when it applies; preserving the textual exceptions, definitions, time-bounds the section itself includes.",
    "- **Key terms** — defined terms or terms-of-art the section uses; if the section incorporates a definition by reference (\"as defined in section X\"), note that without inventing the definition.",
    "- **Cross-references** — sections, statutes, and code provisions the text explicitly cites. (Inline-only — do not import related-but-unmentioned sections.)",
    "- **Notes on currency** — surface the release-point caveat; surface non-positive-law status when applicable; surface repealed status when applicable.",
    "",
    "Rules:",
    "- Describe what the section says. Do not opine on policy, do not invent legislative intent beyond what the section itself states.",
    "- Quote sparingly; use curly quotes (“”) for direct quotation. Straight double quotes break JSON parsing.",
    "- If the text was truncated before reaching you, note that in candor_notes (\"Summary based on the first N characters of the section; later subsections not seen.\").",
    "- If this is a non-positive-law title section (is_positive_law=false in the metadata), surface in candor_notes: 'This is a [Title N] section — a non-positive-law title. The codified text is an organized restatement of the underlying Statutes at Large; for binding-text questions, the Statutes at Large are the authoritative source.'",
    "- If the section status is 'repealed' or 'omitted', lead with that.",
    "- Output strict JSON only. No markdown outside summary_markdown. No code fences."
  ].join("\n");
}

function buildUscSummarizeUser(section, wasTruncated) {
  const parts = [
    "SECTION METADATA:",
    "- Citation: " + (section.citation || "(no citation)"),
    "- Title: " + (section.title_num != null ? section.title_num + " — " + (section.title_name || "") : "(no title)"),
    "- Hierarchy path: " + (section.structure_path || "(no path)"),
    "- Heading: " + (section.heading || "(no heading)"),
    "- Status: " + (section.status || "(unknown)"),
    "- Positive law: " + (section.is_positive_law ? "yes" : "no") + (section.is_positive_law ? "" : " (codified text is a restatement of the underlying Statutes at Large)"),
    "- Release point: " + (section.release_point || "(unknown)"),
  ];
  if (section.source_credit) {
    parts.push("- Source credit: " + section.source_credit);
  }
  parts.push("");
  parts.push("SECTION TEXT" + (wasTruncated ? " (TRUNCATED to " + fmtIntJs(USC_SUMMARIZE_TEXT_CAP) + " characters — flag this in candor_notes):" : ":"));
  const text = String(section.text_content || "");
  parts.push(wasTruncated ? text.slice(0, USC_SUMMARIZE_TEXT_CAP) : text);
  if (section.notes) {
    parts.push("");
    parts.push("EDITORIAL NOTES (from the Office of Law Revision Counsel; not commentary):");
    parts.push(String(section.notes).slice(0, 10000));
  }
  parts.push("");
  parts.push("Return the summary JSON now.");
  return parts.join("\n");
}

function parseUscSummary(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    try {
      const repaired = cleaned.replace(/"answer_markdown"/g, '"summary_markdown"');
      const rep2 = repairAnswerMarkdownQuotes(repaired.replace(/"summary_markdown"/g, '"answer_markdown"'))
        .replace(/"answer_markdown"/g, '"summary_markdown"');
      v = JSON.parse(rep2);
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) { throw new Error("JSON.parse error: " + pe3.message); }
      } else {
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.summary_markdown !== "string" || !v.summary_markdown.trim()) throw new Error("summary_markdown is empty.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusUscSummarizeHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  const sql = "SELECT id, title_num, title_name, structure_path, citation, heading, " +
    "text_content, status, is_positive_law, source_credit, notes, release_point " +
    "FROM usc_sections WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Section fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Section not found", code: "not_found" } }, 404);
  }
  const section = rows[0];
  const text = String(section.text_content || "");
  if (!text.trim()) {
    return json({ error: { message: "This section has no text content to summarize.", code: "no_text" } }, 400);
  }
  const wasTruncated = text.length > USC_SUMMARIZE_TEXT_CAP;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildUscSummarizeSystem(),
      messages: [{ role: "user", content: buildUscSummarizeUser(section, wasTruncated) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Summarize step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseUscSummary(res.text); }
  catch (e) { return json({ error: { message: "Could not parse summary: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    summary_markdown: parsed.summary_markdown,
    candor_notes: parsed.candor_notes,
    was_truncated: wasTruncated,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ============================================================================
// CFR (Code of Federal Regulations) corpus — v1 alpha
//
// Second non-litigation spoke. Schema parallels USC closely (id, title_num,
// title_name, hierarchy chain, citation, heading, text_content, fts) but
// regulations have their own concepts: `reserved` placeholder sections (no
// "positive law" idea), `up_to_date_as_of` date currency per section, a
// `latest_amended_on` per-section amendment date, and a shallower hierarchy
// (no subtitle, but a `subpart` between part and section).
//
// Display columns: enough for the filter results table — id, title_num,
// title_name, citation, heading, section_identifier, reserved, source,
// text_length, up_to_date_as_of. Full text_content lands in the section
// detail endpoint, same split as USC.
//
// AI modes (brief #4's three flagships: compliance / authority / framework
// synthesis), the curated scopes library (rule packages + agency-derived),
// the definitional layer, and cross-corpus joins all defer to follow-ups —
// v1 alpha is keyword + metadata filtering plus section view.
// ============================================================================

var CFR_DISPLAY_COLS = "id, title_num, title_name, citation, heading, section_identifier, reserved, source, text_length, up_to_date_as_of::text AS up_to_date_as_of";

/**
 * Build the WHERE clause for /corpus/cfr/filter. Same single-quote escaping
 * + integer coercion conventions as buildUscFilterWhere; specific axes per
 * brief #4's v1 free-tier metadata floor.
 *
 * Supported axes:
 *   search    FTS over fts (text_content + heading)
 *   title     integer title number; exact match
 *   citation  e.g. "45 CFR § 164.502" — exact match on canonical citation
 *   heading   substring (ILIKE %heading%) on the section heading
 *   part      exact match on the `part` field (e.g. "164")
 *   reserved  boolean — true to include only reserved, false to exclude
 *             reserved (the common case — placeholder sections aren't
 *             useful for most queries), undefined to include both
 */
function buildCfrFilterWhere(fields) {
  var parts = [];
  if (fields.search && typeof fields.search === 'string' && fields.search.trim()) {
    var q = fields.search.trim().replace(/'/g, "''");
    parts.push("fts @@ websearch_to_tsquery('english', '" + q + "')");
  }
  if (fields.title != null) {
    var t = Number(fields.title);
    if (Number.isFinite(t)) parts.push("title_num = " + Math.floor(t));
  }
  if (fields.citation && typeof fields.citation === 'string' && fields.citation.trim()) {
    var c = fields.citation.trim().replace(/'/g, "''");
    parts.push("citation = '" + c + "'");
  }
  if (fields.heading && typeof fields.heading === 'string' && fields.heading.trim()) {
    var h = fields.heading.trim().replace(/'/g, "''");
    parts.push("heading ILIKE '%" + h + "%'");
  }
  if (fields.part && typeof fields.part === 'string' && fields.part.trim()) {
    var p = fields.part.trim().replace(/'/g, "''");
    // part is stored as a verbose label ("PART 160—…"); scope via the
    // normalized generated part_num column (punchlist #3 fix).
    parts.push("part_num = '" + p + "'");
  }
  if (fields.reserved === true) parts.push("reserved = true");
  if (fields.reserved === false) parts.push("reserved = false");
  return parts.length ? " WHERE " + parts.join(" AND ") : "";
}

async function corpusCfrFacetsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  try {
    const stats = await corpusRunQuery(env,
      "SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.cfr_sections'::regclass) AS section_count, " +
      "(SELECT MAX(up_to_date_as_of)::text FROM cfr_sections) AS up_to_date_as_of, " +
      "(SELECT count(*) FROM cfr_sections WHERE reserved) AS reserved_count");
    const titles = await corpusRunQuery(env,
      "SELECT title_num, title_name FROM (" +
      "SELECT DISTINCT title_num, title_name FROM cfr_sections WHERE title_num IS NOT NULL" +
      ") z ORDER BY title_num");
    const s = stats[0] || {};
    return json({
      section_count: s.section_count,
      up_to_date_as_of: s.up_to_date_as_of,
      reserved_count: s.reserved_count,
      titles: titles.map((r) => ({ num: r.title_num, name: r.title_name }))
    }, 200);
  } catch (e) {
    return json({ error: { message: "CFR facets fetch failed: " + e.message } }, 502);
  }
}

async function corpusCfrFilterHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const fields = (body && body.fields) || {};
  const where = buildCfrFilterWhere(fields);
  const idsSql = "SELECT id FROM cfr_sections" + where;
  const rowsSql = "SELECT " + CFR_DISPLAY_COLS + " FROM cfr_sections" + where +
    " ORDER BY title_num NULLS LAST, part NULLS LAST, section_identifier NULLS LAST LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "CFR filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const ids = idRows.map((r) => r.id).filter((x) => x != null);
  return json({
    ids,
    display_rows: rows,
    count: ids.length,
    generated_sql: rowsSql,
    executed_sql: idsSql
  }, 200);
}

/**
 * Single-section detail for the CFR section panel. Mirrors the USC
 * pattern — list endpoint omits text_content, this endpoint returns it
 * along with the full hierarchy + currency metadata (latest_amended_on
 * is regulation-specific, absent in USC).
 */
async function corpusCfrSectionHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }
  const sql = "SELECT id, title_num, title_name, chapter, part, subpart, " +
    "structure_path, section_identifier, citation, heading, text_content, " +
    "text_length, reserved, source, up_to_date_as_of::text AS up_to_date_as_of, " +
    "latest_amended_on::text AS latest_amended_on " +
    "FROM cfr_sections WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Section fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Section not found", code: "not_found" } }, 404);
  }
  return json({ section: rows[0] }, 200);
}

// ── CFR AI modes (PR 4t) ────────────────────────────────────────────────────
// Brief #4 §3 names three co-equal flagships (A Compliance / B Authority /
// C Framework synthesis) + read-a-section + analytical-with-method, all
// served via ONE claude_ama mode whose planner picks output_mode per
// question shape ("no query-architecture buttons"). Plus a per-section
// summarize action on the detail panel.
//
// v1 ships single-corpus AI. Cross-corpus joins (USC↔CFR / CFR↔OLC /
// CFR↔litigation / CFR↔FR), the definitional layer, the curated scopes
// library, and the agency-derived browse axis per brief #4 §6 all defer
// to follow-ups — the planner surfaces cross-corpus and definitional-
// layer limitations in candor_notes when the user asks Authority or
// definitional questions.

var CFR_SCOPE_LITERAL_LIMIT = 25000;

function normalizeCfrScope(s) {
  s = s || {};
  let ids = Array.isArray(s.section_ids)
    ? s.section_ids.filter((x) => x != null).map(Number).filter(Number.isFinite)
    : null;
  if (ids && ids.length === 0) ids = null;
  return {
    section_ids: ids,
    is_full_db: !ids,
    count: Number(s.count) || (ids ? ids.length : 0),
    description: typeof s.description === "string" && s.description.trim() ? s.description.trim() : ""
  };
}

var CFR_AMA_SCHEMA_DOC = [
  "TABLE: cfr_sections — one row per CFR section (227,554 sections; all 49 titles; up_to_date_as_of is per-section, not monolithic).",
  "  id (bigint, PK)               — section id; use this in citations.",
  "  title_num (smallint)          — Title number (1–50; 50 occupied; CFR uses 'Title' for the top level, distinct from USC numbering).",
  "  title_name (text)             — Title name (e.g. 'Aeronautics and Space' for Title 14, 'Banks and Banking' for Title 12).",
  "  chapter (text)                — Chapter identifier within title, stored as a VERBOSE LABEL ('CHAPTER II—FEDERAL RESERVE SYSTEM'). In CFR, chapter typically maps to an AGENCY. Do NOT filter chapter = 'II' — it returns zero rows; use chapter_num. Agency derives from (title_name, chapter_num); there is no separate agency column.",
  "  chapter_num (text, generated) — Bare chapter identifier extracted from the chapter label ('II', 'I', 'III'). USE THIS for agency/chapter scoping: WHERE title_num=12 AND chapter_num='II'.",
  "  subchapter (text)             — Subchapter (verbose label, same caveat as chapter).",
  "  part (text)                   — Part, stored as a VERBOSE LABEL ('PART 160—GENERAL ADMINISTRATIVE REQUIREMENTS'). THE KEY REGULATORY GROUPING. Do NOT filter part = '160' — it returns zero rows; use part_num.",
  "  part_num (text, generated)    — Bare part identifier extracted from the part label ('160', '1026'). USE THIS for part scoping: 'HIPAA Privacy Rule' = title_num=45 AND part_num IN ('160','164'); 'Regulation Z' = title_num=12 AND part_num='1026'.",
  "  subpart (text)                — Subpart (between part and section; absent from USC).",
  "  structure_path (text)         — Slash-delimited hierarchy path (e.g. '45/A/164/E/164.502').",
  "  section_identifier (text)     — Machine-friendly identifier ('164.502').",
  "  citation (text)               — Canonical citation form ('45 CFR § 164.502').",
  "  heading (text)                — Section heading.",
  "  text_content (text)           — Full section text; can be very long for complex regs — DO NOT pull in planned queries.",
  "  text_length (int)             — Character count.",
  "  reserved (boolean)            — True for reserved placeholder sections (no operative text). Filter out for most analytical queries: WHERE NOT reserved.",
  "  source (text)                 — Provenance ('eCFR' for the daily-updated view; check during implementation if other values appear).",
  "  up_to_date_as_of (date)       — PER-SECTION currency marker. Different sections refresh on different cadences. Surface this in every answer that turns on specific section text.",
  "  latest_amended_on (date)      — When this section was last amended in the Federal Register.",
  "  fts (tsvector, generated)     — to_tsvector('english', heading || ' ' || text_content) — use for topical search.",
  "",
  "NOTES:",
  "- Topical/conceptual search: WHERE fts @@ websearch_to_tsquery('english', 'your search'). Dense regulatory prose; use OR generously.",
  "- Citation lookup: '45 CFR § 164.502' → WHERE citation = '45 CFR § 164.502' (exact match).",
  "- Agency scope: there is no separate agency column. Derive from (title_num, chapter_num) — NEVER the verbose chapter column. Examples:",
  "    * FDA: title_num=21 (mostly).",
  "    * Federal Reserve: title_num=12 AND chapter_num='II'.",
  "    * EPA: title_num=40.",
  "    * FAA: title_num=14 AND chapter_num='I'.",
  "  When the planner targets a specific agency, prefer a (title_num, chapter_num) filter over an FTS keyword search for the agency name.",
  "- Part scope: rule packages live at the part level. HIPAA Privacy Rule = title_num=45 AND part_num IN ('160', '164'). Reg Z = title_num=12 AND part_num='1026'. (Scope via part_num, never the verbose part column.)",
  "- Reserved sections: WHERE NOT reserved unless the question explicitly asks about placeholders. They have no operative text.",
  "- ANALYTICAL COUNTS. Always include denominator AND matching pattern in candor_notes. Example: 'Across 227,554 sections, pattern-matched on latest_amended_on >= now() - interval \\'30 days\\'; 1,247 matched. Counts amendments in the last 30 days; some are minor technical edits.'",
  "- CROSS-CORPUS LIMITATION (v1). Questions like 'Can agency X do Y' that would benefit from USC (statutory authority) + OLC (executive interpretation) + litigation (challenges) cross-references receive a candor_note: 'v1 does not yet cross-reference USC, OLC, or litigation. The answer is the regulatory-text piece only.'",
  "- DEFINITIONAL LAYER LIMITATION (v1). Questions like 'How does federal regulation define X' work via FTS for v1; the parsed cfr_definitions table (with scope_note) is deferred to a follow-up. Surface this in candor_notes when applicable.",
  "- Read-only: only SELECT statements; cap planned queries at LIMIT 500."
].join("\n");

function buildCfrPlanningSystem() {
  return [
    "You are the planner for an agentic regulatory-research tool over the Code of Federal Regulations — the codified rules issued by federal executive-branch agencies (227,554 sections, all 49 titles). CFR sections are the binding regulatory text, second only to the underlying statutes; treat with very high authoritative weight.",
    "",
    "You have access to a Postgres database (read-only) via SELECT queries. Schema:",
    "",
    CFR_AMA_SCHEMA_DOC,
    "",
    "Output a single JSON object with these keys (no prose, no code fences):",
    "{",
    '  "output_mode": "list" | "narrative" | "hybrid",',
    "       // list = the question wants a refined set of sections.",
    "       // narrative = the question wants a regulatory-analysis answer; the field is unchanged.",
    "       // hybrid = both — a synthesis + the supporting sections (most flagship questions).",
    '  "approach_summary": "2-4 sentence plan, plain prose, no markdown headers",',
    '  "candor_notes": ["caveats — per-section currency, cross-corpus deferral on authority questions, definitional-layer deferral, denominator for analytical counts, reserved-section exclusion"],',
    '  "queries": [',
    '    {"label": "what this query gathers", "sql": "SELECT ... FROM cfr_sections WHERE NOT reserved AND ... LIMIT 200"},',
    "    ...",
    "  ],",
    '  "estimated_cost_cents": <integer>,',
    "       // your estimate of the synthesis call cost in cents (the planning call is already paid).",
    "       // Synthesis input ≈ all query results in JSON; output ≈ 800-2000 tokens.",
    "       // Anthropic Sonnet pricing × 1.35 markup is roughly: input 0.4¢/1K tokens, output 2¢/1K tokens.",
    '  "wants_synthesis": true',
    "}",
    "",
    "Rules:",
    "- Question shape → output_mode mapping (three flagships recognized internally):",
    "    * 'What regs apply to [actor] doing [activity]' → output_mode='hybrid' (Flagship A: Compliance synthesis). State the assumed actor + activity explicitly in the synthesis output.",
    "    * 'What does agency X have authority to regulate' → output_mode='hybrid' (Flagship B: Authority synthesis). Pull issued regs grouped by part. Add a candor_note that v1 does not cross-reference USC (statutory authority), OLC (executive interpretation), or litigation (challenges) — that piece is deferred.",
    "    * 'Describe the regulatory framework for [X]' → output_mode='hybrid' (Flagship C: Framework synthesis). Often scope-routed via title/agency/part.",
    "    * 'What regulations implement [USC citation]' → output_mode='list' or 'hybrid'. v1 limitation: the eCFR authorities join is deferred. Use FTS on the USC citation pattern in text_content as a best-effort proxy; surface this approximation in candor_notes.",
    "    * 'What does 45 CFR § 164.502 say' → output_mode='list' (read-a-section). Citation lookup + synthesis renders the section.",
    "    * 'Is there a regulation forbidding X' / 'Show me regs about X' → output_mode='list'.",
    "    * 'How many CFR sections were amended in the last 30 days' / 'How many regs do Y' → output_mode='narrative' (analytical) with denominator + matching pattern in candor_notes AND the answer itself.",
    "- PULL METADATA, NOT FULL TEXT. Planned queries should select id, citation, heading, title_num, chapter, part, subpart, structure_path, up_to_date_as_of, latest_amended_on — NEVER text_content.",
    "- EXCLUDE RESERVED. Default to WHERE NOT reserved unless the question explicitly asks about reserved/placeholder sections.",
    "- AGENCY ROUTING. When the question targets a specific agency, derive a (title_num, chapter_num) filter rather than FTS-matching on the agency name. FDA → title_num=21. EPA → title_num=40. Fed → title_num=12 AND chapter_num='II'. (chapter is a verbose label — always scope via chapter_num.)",
    "- PART SCOPE for known rule packages. HIPAA Privacy → title_num=45 AND part_num IN ('160','164'). Reg Z → title_num=12 AND part_num='1026'. NEPA EIS → title_num=40 AND part_num BETWEEN '1500' AND '1508'. (part is a verbose label — always scope via part_num.)",
    "- USC↔CFR IMPLEMENTS QUERIES. v1 uses FTS proxy ('5 U.S.C. § 552' citation pattern in text_content). The eCFR-authorities join table is deferred; surface this approximation in candor_notes.",
    "- KEYWORD UNDERPERFORMS — FAN OUT WITH OR GENEROUSLY. The user's phrasing is often NOT the regulation's phrasing. Specific failure modes:",
    "    * **Activity terms vs regulatory formulation.** User says 'commercial drone operations'; the regulation says 'unmanned aircraft systems', 'small unmanned aircraft', 'operations for compensation or hire'. Always fan to the regulatory terms of art: 'commercial drone' OR 'unmanned aircraft' OR 'small unmanned aircraft system' OR 'sUAS'. The CFR's drafting language is technical; consumer phrasing won't match.",
    "    * **Activity verbs.** User says 'rules forbidding X'; regulations use 'prohibited', 'may not', 'shall not', 'unlawful', 'restricted'. Fan: '\"may not\" OR \"shall not\" OR prohibited OR restricted OR unlawful'.",
    "    * **Conceptual queries.** Same pgvector-is-Phase-2 caveat as USC.",
    "  WORKED EXAMPLE — *'regs prohibiting projecting images on federal buildings'*: don't just FTS 'projecting images'. The regulations use 'demonstration', 'display', 'sign', 'use of the property', 'public use'. Fan: title_num=36 (parks) OR title_num=41 (public contracts/property) AND fts ~ '(\"projecting\" OR \"display\" OR \"sign\" OR \"demonstration\") AND (\"federal building\" OR \"public property\" OR \"national park\" OR \"national monument\")'. A BAD plan: FTS '\"projecting images\"' literal — returns 0.",
    "- ANALYTICAL COUNTS. Surface denominator AND pattern: 'Across 227,554 sections, pattern-matched on [pattern]; N matched.'",
    "- NARRATIVE DISCIPLINE. For output_mode='narrative' or 'hybrid', prefer 2–4 queries, NOT 6+. Synthesis has a finite output-token budget (currently 8000 for narrative); too many queries inflate the synthesis input and risk truncation mid-answer. A single well-fanned query with strong OR coverage is better than five literal-term queries.",
    "- WHEN THE CURRENT SCOPE IS NARROWED (section_ids list provided): use the name \"scoped_cfr_sections\" instead of \"cfr_sections\". The runner substitutes this with an inline subquery filtered to the scope. CRITICAL: reference this name ONLY after FROM or JOIN keywords, and DO NOT alias it. WHEN SCOPE IS THE FULL CORPUS: use \"cfr_sections\".",
    "- NEVER editorialize. CFR sections are binding regulatory text; describe what they say, do not opine on compliance burden or regulatory policy.",
    LEGAL_ADVICE_PLANNER_RULE,
    "- Output strict JSON only. No markdown. No code fences. No prose outside the object."
  ].join("\n");
}

function buildCfrPlanningUser(question, scope) {
  return [
    "USER QUESTION:",
    question,
    "",
    "CURRENT SCOPE:",
    scope.description || (scope.is_full_db
      ? "The full CFR corpus — all 227,554 sections across 49 titles, currency varies per section."
      : fmtIntJs(scope.count) + " sections (narrowed)."),
    scope.is_full_db
      ? "(no section_id constraint — your queries run against the full corpus; use the table name \"cfr_sections\")"
      : "(narrowed to " + fmtIntJs(scope.count) + " section_ids; the runner will substitute scoped_cfr_sections with an inline subquery filtered to the scope — use THAT name in your queries)",
    "",
    "Return the JSON plan now."
  ].join("\n");
}

function parseCfrPlan(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) {
      try { v = JSON.parse(firstObj); }
      catch (pe2) { throw new Error("JSON.parse error: " + pe2.message); }
    } else {
      throw new Error("could not find a JSON object in the response.");
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (["list", "narrative", "hybrid"].indexOf(v.output_mode) < 0) throw new Error("output_mode must be list, narrative, or hybrid.");
  if (!Array.isArray(v.queries)) throw new Error("queries must be an array.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  v.estimated_cost_cents = Math.max(0, Math.round(Number(v.estimated_cost_cents) || 0));
  v.approach_summary = String(v.approach_summary || "").trim();
  return v;
}

async function executeCfrPlan(env, plan, scope) {
  let scopedBody = null;
  if (scope.section_ids && scope.section_ids.length > 0) {
    if (scope.section_ids.length > CFR_SCOPE_LITERAL_LIMIT) {
      throw new Error("Scope is " + fmtIntJs(scope.section_ids.length) + " sections — too large to inline (cap " + fmtIntJs(CFR_SCOPE_LITERAL_LIMIT) + "). Narrow further with the filter before running synthesis.");
    }
    const idsSubquery = "SELECT unnest('{" + scope.section_ids.join(",") + "}'::bigint[]) AS id";
    scopedBody = "(SELECT s.* FROM cfr_sections s WHERE s.id IN (" + idsSubquery + "))";
  }

  const results = [];
  for (let i = 0; i < plan.queries.length; i++) {
    const q = plan.queries[i];
    let sql = String(q.sql || "").trim().replace(/;\s*$/, "").trim();
    if (!sql) continue;
    let execSql = sql;
    if (scopedBody) {
      execSql = substituteScoped(execSql, "scoped_cfr_sections", scopedBody);
    }
    if (!/^\s*SELECT\b/i.test(execSql)) execSql = "SELECT * FROM (" + execSql + ") AS cfr_q";
    let rows;
    try { rows = await withStatementTimeoutRetry(() => corpusRunQuery(env, execSql)); }
    catch (err) { throw new Error('Query "' + (q.label || ("query " + (i + 1))) + '" failed: ' + err.message); }
    const truncated = (rows.length > 200) ? rows.slice(0, 200) : rows;
    results.push({ label: q.label || ("query " + (i + 1)), sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 200 });
  }
  return results;
}

function buildCfrSynthesisSystem(outputMode) {
  const listClause = (outputMode === "list" || outputMode === "hybrid")
    ? '"section_ids": [<bigint>, ...]   // the section ids the user should see; pulled from your query results.'
    : '"section_ids": null';
  return [
    "You are the synthesis step for an agentic regulatory-research tool over the Code of Federal Regulations. The planner has run the SQL queries you proposed; you now have the question, the plan, and the query results. Write the user-facing answer.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "answer_markdown": "...",  // markdown narrative; cite specific sections in prose using canonical CFR citation form (e.g. "45 CFR § 164.502"). DO NOT embed internal id tokens.',
    "  " + listClause + ",",
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    "}",
    "",
    "Rules:",
    "- CFR sections are BINDING federal regulatory text. Describe what they say; never opine on compliance burden or policy.",
    "- CITE EVERY CLAIM via the canonical CFR citation in PROSE — '45 CFR § 164.502', '12 CFR § 1026.36(a)', etc. The user navigates to each cited section via the Cited Sections list that renders below the narrative; do NOT embed [cfr-ref:N] tokens or any other internal id markers. Bad: '...45 CFR § 164.502 [cfr-ref:42] permits...'. Good: '...45 CFR § 164.502 permits...'.",
    "- PER-SECTION CURRENCY. CFR currency is per-section, not monolithic. When the answer turns on a specific section, surface its up_to_date_as_of date inline or in candor_notes: 'Current as of [section's up_to_date_as_of]; later amendments not reflected.'",
    "- COMPLIANCE SYNTHESIS (Flagship A). For 'What regs apply to X doing Y' questions, lead with an explicit ASSUMPTIONS block: state the actor type, activity, and any other facts the synthesis assumed. Researchers need to know what scope was modeled.",
    "- AUTHORITY SYNTHESIS (Flagship B). For 'What does agency X have authority to regulate' questions, surface the cross-corpus limitation in candor_notes: 'v1 does not yet cross-reference USC (statutory authority), OLC (executive interpretation), or litigation (challenges to agency authority). The answer is the regulatory-text piece only — to know whether an agency *has* the authority it claims, the statutory and litigation pieces matter.'",
    "- USC↔CFR FTS PROXY. When the question asked 'what regulations implement [USC citation]', surface in candor_notes: 'v1 uses an FTS match on the citation text as a proxy; the structured eCFR-authorities join is deferred to a follow-up. False negatives are possible where the implementing reg cites a parent provision rather than the specific section.'",
    "- DEFINITIONAL LAYER. For 'how do federal regs define X' questions, surface in candor_notes: 'v1 uses FTS to find definitional language; the parsed cfr_definitions table with scope_note is deferred to a follow-up. The same term may be defined differently across subparts.'",
    "- ANALYTICAL ANSWERS. Surface the denominator and matching pattern in answer_markdown itself: 'Across 227,554 sections, N matched [pattern].'",
    "- ZERO-RESULT HONESTY. When the query results are empty (or near-empty) for what should be a non-trivial question, the answer_markdown MUST: (1) name the FTS terms tried in prose ('I searched title 40 and title 36 for the phrases ...'), (2) acknowledge this may be a keyword recall failure — explain that regulations use technical terms of art that the user's phrasing may not match (e.g., 'commercial drone' vs 'unmanned aircraft system'; agency names vs umbrella department), and (3) suggest one or two reformulations. DO NOT just say 'no results found' — that's opaque about whether the CFR is genuinely silent or the keyword search missed.",
    "- For list/hybrid output_modes, section_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable sections, downgrade to narrative and explain.",
    "- Be tight. The user wants the regulatory answer, not a methodology essay. Keep candor_notes for caveats.",
    "- Output strict JSON only. No markdown outside answer_markdown. No code fences.",
    '- CRITICAL: inside answer_markdown, do NOT use straight double quotes (") — they break JSON parsing when not escaped. Use curly quotes ("") for direct quotation, or single quotes (\'\' or \') for short inline quotation. Apostrophes (\') are fine. If you absolutely must use a straight double quote, escape it as \\".'
  ].join("\n");
}

function buildCfrSynthesisUser(question, plan, results) {
  const resultsForModel = results.map(function (r) {
    return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated, rows: r.rows };
  });
  return [
    "USER QUESTION:",
    question,
    "",
    "YOUR PLAN (from the planning step):",
    plan.approach_summary,
    "",
    "PLANNED OUTPUT MODE: " + plan.output_mode,
    "",
    "CANDOR NOTES FROM PLANNING:",
    (plan.candor_notes && plan.candor_notes.length) ? plan.candor_notes.map(function (n) { return "- " + n; }).join("\n") : "(none)",
    "",
    "QUERY RESULTS (JSON):",
    JSON.stringify(resultsForModel, null, 2),
    "",
    "Return the synthesis JSON now."
  ].join("\n");
}

function parseCfrSynthesis(raw, outputMode) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
          catch (pe4) {
            const salvaged = salvageTruncatedSynthesis(raw);
            if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "section_ids");
            throw new Error("JSON.parse error: " + pe4.message);
          }
        }
      } else {
        const salvaged = salvageTruncatedSynthesis(raw);
        if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "section_ids");
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.answer_markdown !== "string" || !v.answer_markdown.trim()) throw new Error("answer_markdown is empty.");
  if (outputMode === "list" || outputMode === "hybrid") {
    if (!Array.isArray(v.section_ids) || v.section_ids.length === 0) {
      v.section_ids = [];
      v.candor_notes = (v.candor_notes || []).concat(["Output mode requested a section list but synthesis returned none — showing narrative only."]);
    } else {
      v.section_ids = v.section_ids
        .filter(function (x) { return x != null; })
        .map(function (x) { return Number(x); })
        .filter(function (x) { return Number.isFinite(x); });
    }
  } else {
    v.section_ids = null;
  }
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusCfrPlanHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const question = String((body && body.question) || "").trim();
  if (!question) return json({ error: { message: "Missing question" } }, 400);
  const scope = normalizeCfrScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildCfrPlanningSystem(),
      messages: [{ role: "user", content: buildCfrPlanningUser(question, scope) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Planning step: " + e.message, code: e.code } }, e.status || 502);
  }
  let plan;
  try { plan = parseCfrPlan(res.text); }
  catch (e) { return json({ error: { message: "Could not parse plan: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const token = crypto.randomUUID();
  await env.QUOTA.put("cfr-plan:" + token, JSON.stringify({
    plan, scope, question, provider, model, userId: auth.userId, authMode: auth.authMode
  }), { expirationTtl: 900 });

  return json({
    token,
    output_mode: plan.output_mode,
    approach_summary: plan.approach_summary,
    candor_notes: plan.candor_notes,
    queries: plan.queries.map(function (q) { return { label: q.label, sql: q.sql }; }),
    estimated_cost_cents: plan.estimated_cost_cents,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

async function corpusCfrExecuteHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const token = body && body.token;
  if (!token || typeof token !== "string") return json({ error: { message: "Missing plan token" } }, 400);
  const stored = await env.QUOTA.get("cfr-plan:" + token);
  if (!stored) return json({ error: { message: "Plan expired or not found — re-run the question.", code: "plan_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored plan is corrupt — re-run the question." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider, body);
  if (auth instanceof Response) return auth;
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This plan belongs to a different session. Re-run the question." } }, 403);
  }
  ctx.waitUntil(env.QUOTA.delete("cfr-plan:" + token));

  let results;
  try { results = await executeCfrPlan(env, blob.plan, blob.scope); }
  catch (e) { return json({ error: { message: e.message, code: "execute_failed" } }, 400); }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildCfrSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildCfrSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 8000 : 6000
    });
  } catch (e) {
    return json({ error: { message: "Synthesis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let synth;
  try { synth = parseCfrSynthesis(res.text, blob.plan.output_mode); }
  catch (e) { return json({ error: { message: "Could not parse synthesis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    answer_markdown: synth.answer_markdown,
    section_ids: synth.section_ids,
    candor_notes: synth.candor_notes,
    output_mode: blob.plan.output_mode,
    query_summary: results.map(function (r) { return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated }; }),
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── CFR: summarize one section ──────────────────────────────────────────────
var CFR_SUMMARIZE_TEXT_CAP = 150000;

function buildCfrSummarizeSystem() {
  return [
    "You are summarizing one section of the Code of Federal Regulations for a researcher. CFR sections are binding regulatory text issued by federal agencies. Your job: a structured, attribution-forward summary, never editorialize on compliance burden or policy.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "summary_markdown": "...",  // markdown summary, 4-8 short paragraphs.',
    '  "candor_notes": ["caveats — per-section currency, reserved-flag, truncation, definitions-by-reference"]',
    "}",
    "",
    "Structure the summary_markdown around these headings (omit any that don't apply):",
    "- **What it does** — the operative regulatory rule in plain English, 1-3 sentences.",
    "- **To whom it applies** — the regulated party / actor / activity scope. This is often as load-bearing as the operative rule itself.",
    "- **Key terms** — defined terms or terms-of-art the section uses; note when a definition is incorporated by reference (\"as defined in §164.103\") without inventing the definition.",
    "- **Cross-references** — sections, statutory authorities, and CFR provisions the text explicitly cites. Inline-only — do not import related-but-unmentioned regulations.",
    "- **Currency** — surface the per-section up_to_date_as_of and the latest_amended_on date. Researchers need to know how fresh this text is.",
    "",
    "Rules:",
    "- Describe what the section says. Do not opine on whether the regulation is well-designed or unduly burdensome.",
    "- Quote sparingly; use curly quotes (“”) for direct quotation. Straight double quotes break JSON parsing.",
    "- If the text was truncated before reaching you, note that in candor_notes (\"Summary based on the first N characters of the section; later subsections not seen.\").",
    "- If `reserved` is true, lead with that — there's no operative text to summarize.",
    "- Per-section currency goes in both the Currency heading and candor_notes.",
    "- Output strict JSON only. No markdown outside summary_markdown. No code fences."
  ].join("\n");
}

function buildCfrSummarizeUser(section, wasTruncated) {
  const parts = [
    "SECTION METADATA:",
    "- Citation: " + (section.citation || "(no citation)"),
    "- Title: " + (section.title_num != null ? section.title_num + " — " + (section.title_name || "") : "(no title)"),
    "- Hierarchy path: " + (section.structure_path || "(no path)"),
    "- Heading: " + (section.heading || "(no heading)"),
    "- Reserved: " + (section.reserved ? "yes (placeholder; no operative text)" : "no"),
    "- Source: " + (section.source || "(unknown)"),
    "- Up to date as of: " + (section.up_to_date_as_of || "(unknown)"),
    "- Latest amended on: " + (section.latest_amended_on || "(unknown)")
  ];
  parts.push("");
  parts.push("SECTION TEXT" + (wasTruncated ? " (TRUNCATED to " + fmtIntJs(CFR_SUMMARIZE_TEXT_CAP) + " characters — flag this in candor_notes):" : ":"));
  const text = String(section.text_content || "");
  parts.push(wasTruncated ? text.slice(0, CFR_SUMMARIZE_TEXT_CAP) : text);
  parts.push("");
  parts.push("Return the summary JSON now.");
  return parts.join("\n");
}

function parseCfrSummary(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    try {
      const repaired = cleaned.replace(/"answer_markdown"/g, '"summary_markdown"');
      const rep2 = repairAnswerMarkdownQuotes(repaired.replace(/"summary_markdown"/g, '"answer_markdown"'))
        .replace(/"answer_markdown"/g, '"summary_markdown"');
      v = JSON.parse(rep2);
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) { throw new Error("JSON.parse error: " + pe3.message); }
      } else {
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.summary_markdown !== "string" || !v.summary_markdown.trim()) throw new Error("summary_markdown is empty.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusCfrSummarizeHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  const sql = "SELECT id, title_num, title_name, structure_path, citation, heading, " +
    "text_content, reserved, source, " +
    "up_to_date_as_of::text AS up_to_date_as_of, " +
    "latest_amended_on::text AS latest_amended_on " +
    "FROM cfr_sections WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Section fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Section not found", code: "not_found" } }, 404);
  }
  const section = rows[0];
  const text = String(section.text_content || "");
  if (!text.trim()) {
    return json({ error: { message: "This section has no text content to summarize. (It may be a reserved placeholder.)", code: "no_text" } }, 400);
  }
  const wasTruncated = text.length > CFR_SUMMARIZE_TEXT_CAP;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildCfrSummarizeSystem(),
      messages: [{ role: "user", content: buildCfrSummarizeUser(section, wasTruncated) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Summarize step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseCfrSummary(res.text); }
  catch (e) { return json({ error: { message: "Could not parse summary: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    summary_markdown: parsed.summary_markdown,
    candor_notes: parsed.candor_notes,
    was_truncated: wasTruncated,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ============================================================================
// OLC opinions corpus — v1 alpha
//
// Third reference-style spoke after USC/CFR. The atomic unit is an opinion
// (not a section); the corpus is small (2,145) and flat (no hierarchy
// chain). Per brief #2 OLC is paradigmatically analytical/narrative — AI
// synthesis is the flagship — but manual filter + opinion detail still
// gives meaningful research: title browse, date-range, source filtering
// (DOJ-published vs Knight FOIA net-new), OCR-quality filter (~200
// degraded scans worth filtering out for serious work).
//
// Display columns are the list-table fields. text_content is omitted to
// keep payloads cheap; the detail handler returns everything.
// ============================================================================

// `source_url_doj` + `source_url_knight` join here (PR 4v) so result rows
// and AMA cited-list rows can render an auditable "↗ source" affordance
// without a follow-up detail fetch. Per brief #1 §4b (auditability): every
// row that mentions a document gets a one-click path to the canonical
// primary source.
var OLC_DISPLAY_COLS = "id, title, author, date_issued::text AS date_issued, source, source_url_doj, source_url_knight, page_count, text_length, ocr_quality";

/**
 * Build the WHERE clause for /corpus/olc/filter. Same single-quote
 * escaping discipline as the USC and CFR builders.
 *
 * Supported axes:
 *   search       FTS over fts (text_content + title)
 *   title        substring (ILIKE %title%) on opinion title — many records
 *                have null author so title is the primary text axis
 *   author       substring (ILIKE %author%)
 *   source       exact match — 'doj-published' (1,439) or 'knight-foia' (706)
 *   from / to    ISO YYYY-MM-DD bounds on date_issued
 *   ocrQuality   exact match — 'clean' (1,857), 'degraded' (197),
 *                'normalized' (91) so users can exclude degraded scans
 *                for serious research
 */
function buildOlcFilterWhere(fields) {
  var parts = [];
  if (fields.search && typeof fields.search === 'string' && fields.search.trim()) {
    var q = fields.search.trim().replace(/'/g, "''");
    parts.push("fts @@ websearch_to_tsquery('english', '" + q + "')");
  }
  if (fields.title && typeof fields.title === 'string' && fields.title.trim()) {
    var t = fields.title.trim().replace(/'/g, "''");
    parts.push("title ILIKE '%" + t + "%'");
  }
  if (fields.author && typeof fields.author === 'string' && fields.author.trim()) {
    var a = fields.author.trim().replace(/'/g, "''");
    parts.push("author ILIKE '%" + a + "%'");
  }
  if (fields.source && typeof fields.source === 'string' && fields.source.trim()) {
    var s = fields.source.trim().replace(/'/g, "''");
    parts.push("source = '" + s + "'");
  }
  if (fields.from && typeof fields.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.from)) {
    parts.push("date_issued >= '" + fields.from + "'");
  }
  if (fields.to && typeof fields.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.to)) {
    parts.push("date_issued <= '" + fields.to + "'");
  }
  if (fields.ocrQuality && typeof fields.ocrQuality === 'string' && fields.ocrQuality.trim()) {
    var o = fields.ocrQuality.trim().replace(/'/g, "''");
    parts.push("ocr_quality = '" + o + "'");
  }
  return parts.length ? " WHERE " + parts.join(" AND ") : "";
}

async function corpusOlcFacetsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  try {
    // Small corpus (~2,145) — COUNT(*) is cheap. Exact counts here
    // rather than the reltuples estimate USC/CFR rely on for their
    // multi-hundred-thousand-row tables.
    const stats = await corpusRunQuery(env,
      "SELECT count(*)::bigint AS opinion_count, " +
      "MIN(date_issued)::text AS earliest, " +
      "MAX(date_issued)::text AS latest " +
      "FROM olc_opinions");
    const sources = await corpusRunQuery(env,
      "SELECT source AS v, count(*)::bigint AS n FROM olc_opinions " +
      "WHERE source IS NOT NULL AND source <> '' GROUP BY source ORDER BY n DESC");
    const ocrQualities = await corpusRunQuery(env,
      "SELECT ocr_quality AS v, count(*)::bigint AS n FROM olc_opinions " +
      "WHERE ocr_quality IS NOT NULL AND ocr_quality <> '' GROUP BY ocr_quality ORDER BY n DESC");
    const s = stats[0] || {};
    return json({
      opinion_count: s.opinion_count,
      earliest: s.earliest,
      latest: s.latest,
      sources: sources.map((r) => ({ value: r.v, count: r.n })),
      ocr_qualities: ocrQualities.map((r) => ({ value: r.v, count: r.n }))
    }, 200);
  } catch (e) {
    return json({ error: { message: "OLC facets fetch failed: " + e.message } }, 502);
  }
}

async function corpusOlcFilterHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const fields = (body && body.fields) || {};
  const where = buildOlcFilterWhere(fields);
  const idsSql = "SELECT id FROM olc_opinions" + where;
  // Order by date_issued desc — most recent first. Matches brief #2's
  // typical interaction (research starts from current state, walks back).
  const rowsSql = "SELECT " + OLC_DISPLAY_COLS + " FROM olc_opinions" + where +
    " ORDER BY date_issued DESC NULLS LAST LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "OLC filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const ids = idRows.map((r) => r.id).filter((x) => x != null);
  return json({
    ids,
    display_rows: rows,
    count: ids.length,
    generated_sql: rowsSql,
    executed_sql: idsSql
  }, 200);
}

/**
 * Single-opinion detail for the OLC opinion panel. Includes the full
 * text_content plus the provenance fields (DOJ + Knight URLs, doj
 * download path, Knight doc id, release date, summary). Surfaces the
 * dual-provenance story per brief #2 — many opinions in the corpus came
 * from the Knight FOIA dataset that DOJ never published, and the user
 * deserves to see which path a given opinion arrived through.
 */
async function corpusOlcOpinionHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }
  // Prefer the LLM-cleaned / OCR'd text where present (Knight degraded scans),
  // falling back to the raw extraction. Image-only docs have text ONLY in
  // text_content_clean, so the detail panel would otherwise show nothing.
  const sql = "SELECT id, title, author, recipient, president, date_issued::text AS date_issued, " +
    "release_date::text AS release_date, summary, summary_source, " +
    "source, source_url_doj, source_url_knight, doj_dl_path, knight_doc_id, " +
    "volume, page, page_count, text_length, " +
    "COALESCE(text_content_clean, text_content) AS text_content, clean_method, " +
    "ocr_quality, dedup_key " +
    "FROM olc_opinions WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Opinion fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Opinion not found", code: "not_found" } }, 404);
  }
  return json({ opinion: rows[0] }, 200);
}

// ── OLC AI modes (PR 4q) ────────────────────────────────────────────────────
// Two surfaces per brief #2 §3:
//   1. Narrative synthesis (claude_ama-shaped) — "what has OLC said about X
//      across administrations" — plan + execute against olc_opinions.
//   2. Summarize-one-opinion — invoked from the opinion detail panel; not a
//      mode in the selector. Single Anthropic call on one opinion's text.
//
// Mirrors the litigation /corpus/plan + /corpus/execute shape (so the React
// pre-flight modal pattern carries across), but with OLC-specific schema,
// canonical citation syntax (opinion title + year + author where known, in
// prose; cited list below the narrative does the navigation — PR 4v dropped
// the inline-token pattern), and editorial guardrails (the released-vs-
// issued caveat, DOJ-vs-Knight-FOIA provenance, degraded-OCR flag, NEVER
// editorializing on contested doctrine).

// Scope normalization for OLC. Litigation's normalizeScope handles cl_ids +
// scope_sql; OLC is small (2,145 opinions max) so we only support an inline
// opinion_ids list. No scope_sql path needed — full-DB inlining covers the
// "narrowed scope is too big" edge case litigation worries about.
function normalizeOlcScope(s) {
  s = s || {};
  let ids = Array.isArray(s.opinion_ids)
    ? s.opinion_ids.filter((x) => x != null).map(Number).filter(Number.isFinite)
    : null;
  if (ids && ids.length === 0) ids = null;
  return {
    opinion_ids: ids,
    is_full_db: !ids,
    count: Number(s.count) || (ids ? ids.length : 0),
    description: typeof s.description === "string" && s.description.trim() ? s.description.trim() : ""
  };
}

var OLC_AMA_SCHEMA_DOC = [
  "TABLE: olc_opinions — one row per OLC opinion (2,145 total).",
  "  id (bigint, PK)               — opinion id; use this when you need to identify an opinion in your output.",
  "  title (text)                  — opinion title; FTS-indexed in column \"fts\" alongside text_content.",
  "  author (text)                 — signing OLC lawyer; NULL on 100% of rows today — DO NOT filter on this.",
  "  recipient (text)              — addressee agency/official; NULL on 100% of rows today — DO NOT filter on this.",
  "  president (text)              — administration; NULL on 100% of rows today — DO NOT filter on this.",
  "  date_issued (date)            — opinion date; populated on 100% of rows; this is your temporal axis.",
  "  release_date (date)           — when OLC released the opinion publicly (may differ from issue date).",
  "  summary (text)                — short editorial summary, where available; check IS NOT NULL before relying on it.",
  "  source (text)                 — 'doj-published' (1,439) or 'knight-foia' (706 — Knight FOIA net-new, opinions DOJ never published).",
  "  page_count (int)              — opinion length in pages.",
  "  text_length (int)             — opinion length in characters.",
  "  text_content (text)           — full opinion text; LARGE (do not return in raw form — pull title/summary/date_issued and let synthesis cite).",
  "  ocr_quality (text)            — 'clean' (1,857), 'degraded' (197 — flag in candor_notes if any of your results have this), 'normalized' (91).",
  "  fts (tsvector, generated)     — to_tsvector('english', title || ' ' || text_content) — use this for topical search.",
  "",
  "NOTES:",
  "- Topical/conceptual search: WHERE fts @@ websearch_to_tsquery('english', 'your search') — supports OR and quoted phrases.",
  "- Date axis is reliable; populated on 100% of rows. \"What has OLC said in the last decade\" → date_issued >= now() - interval '10 years'.",
  "- Provenance filter: source = 'doj-published' OR source = 'knight-foia'. The Knight set is older/suppressed memos DOJ never published — a real completeness differentiator.",
  "- DEGRADED-OCR DISCLOSURE: any result rows with ocr_quality = 'degraded' should be called out in candor_notes (their text may be garbled and synthesis from them is lower-confidence).",
  "- RELEASED-vs-ISSUED CAVEAT: counts of opinions by year reflect *released* opinions, NOT OLC's true output (most opinions are never released). The early-1980s peak (1981 = 164) is the Knight FOIA *Francis v. DOJ* release window. ANY query that reports counts by year/era MUST surface this in candor_notes.",
  "- SUPERSESSION/WITHDRAWAL CAVEAT: no structured field exists. A raw text search for 'withdraw|overrule|supersede' matches 458/2,145 but is mostly noise (an opinion withdrawing *troops*; a *superseded statute*). \"What opinions have been withdrawn\" questions MUST surface this noise caveat in candor_notes.",
  "- Read-only: only SELECT statements are accepted; LIMIT yourself to ≤ 500 rows per query (the corpus is small; full-set retrieval rarely needed)."
].join("\n");

function buildOlcPlanningSystem() {
  return [
    "You are the planner for an agentic narrative-synthesis tool over the OLC (DOJ Office of Legal Counsel) opinion corpus. OLC opinions are the executive branch's authoritative legal interpretations of what the law permits it to do — contested, politically charged terrain. Your job is to look at a user question and the current scope, then return a JSON plan describing how you would answer it.",
    "",
    "You have access to a Postgres database (read-only) via SELECT queries. Schema:",
    "",
    OLC_AMA_SCHEMA_DOC,
    "",
    "Output a single JSON object with these keys (no prose, no code fences):",
    "{",
    '  "output_mode": "list" | "narrative" | "hybrid",',
    "       // list = the question wants a refined set of opinions (the field will be narrowed).",
    "       // narrative = the question wants an analytical answer; the field is unchanged.",
    "       // hybrid = both — narrative summary plus a refined list (most synthesis questions).",
    '  "approach_summary": "2-4 sentence plan, plain prose, no markdown headers",',
    '  "candor_notes": ["caveats the user should see — e.g. the released-vs-issued caveat for year counts, the supersession-noise caveat for withdrawal questions, degraded-OCR rows in your set, missing facets you would have used if populated"],',
    '  "queries": [',
    '    {"label": "what this query gathers", "sql": "SELECT ... FROM olc_opinions WHERE ... LIMIT 200"},',
    "    ...",
    "  ],",
    '  "estimated_cost_cents": <integer>,',
    "       // your estimate of the synthesis call cost in cents (the planning call is already paid).",
    "       // Synthesis input ≈ all query results in JSON; output ≈ 800-2000 tokens.",
    "       // Anthropic Sonnet pricing × 1.35 markup is roughly: input 0.4¢/1K tokens, output 2¢/1K tokens.",
    '  "wants_synthesis": true',
    "}",
    "",
    "Rules:",
    "- Be ruthlessly economical with queries. Pull metadata (id, title, date_issued, summary, source, ocr_quality) — NEVER text_content in a planned query. The synthesis step works from titles + dates + summaries; per-opinion deep reads are a separate mode.",
    "- For trend questions, prefer ONE query that groups by year (or decade) over many narrow queries. Per the released-vs-issued caveat, ANY year-count query must add the caveat to candor_notes.",
    "- For narrative questions over a topic ('how has OLC's view of X evolved'), order by date_issued ASC and cap at 200 opinions per query — that's plenty of evidence for the synthesis step.",
    "- author / recipient / president are NULL on every row today. Do NOT plan queries that filter or group on them. If the question really wants administration analysis, add candor_notes: 'Administration field is not populated yet; v1 surfaces opinions by date_issued, not by administration.'",
    "- For 'what's been overturned/withdrawn' questions, surface the supersession-noise caveat in candor_notes and run an honest text search (fts @@ websearch_to_tsquery('english', 'withdraw OR overrule OR supersede')) without claiming the result list is authoritative.",
    "- KEYWORD UNDERPERFORMS — FAN OUT WITH OR GENEROUSLY. OLC questions are doctrinal; the user's phrasing rarely matches the opinion's. Specific failure modes:",
    "    * **Doctrine vs phrasing.** User asks about 'executive privilege'; the opinion may use 'the President's communications privilege', 'deliberative process privilege', 'presidential confidentiality', 'Article II authority over executive communications'. Fan: '\"executive privilege\" OR \"communications privilege\" OR \"deliberative process\" OR \"presidential confidentiality\"'.",
    "    * **Authority/power constructions.** 'Can the President do X' → 'authority', 'power', 'constitutional', 'inherent', 'Article II', 'executive function'. Fan all of these in tandem with the action verb of the question.",
    "    * **Agency/officer formulations.** Like USC/CFR: the OLC opinion may name the umbrella department, statutory authority, or constitutional clause rather than the agency the user named.",
    "  WORKED EXAMPLE — *'OLC opinions on the President's power to remove agency heads'*: don't just FTS 'remove agency heads'. Fan: websearch_to_tsquery('english', '(\"removal power\" OR \"power to remove\" OR \"at-will removal\" OR \"removability\") AND (\"agency\" OR \"officer\" OR \"principal officer\" OR \"inferior officer\")'). Add Article II as a candor-note hook since the constitutional dimension is dispositive for many of these.",
    "- NARRATIVE DISCIPLINE. For output_mode='narrative' or 'hybrid', prefer 2–4 queries, NOT 6+. Synthesis has a finite output-token budget (currently 8000 for narrative); too many queries inflate the synthesis input and risk truncation mid-answer. A single well-fanned query with strong OR coverage is better than five literal-term queries.",
    "- WHEN THE CURRENT SCOPE IS NARROWED (opinion_ids list provided): use the name \"scoped_olc_opinions\" instead of \"olc_opinions\". The runner substitutes this with an inline subquery already filtered to the scope. CRITICAL: reference this name ONLY after FROM or JOIN keywords, and DO NOT alias it. Write \"FROM scoped_olc_opinions WHERE date_issued > '2010-01-01'\" (good), not \"FROM scoped_olc_opinions o WHERE ...\" (will break). WHEN SCOPE IS THE FULL CORPUS: use \"olc_opinions\".",
    LEGAL_ADVICE_PLANNER_RULE,
    "- Output strict JSON only. No markdown. No code fences. No prose outside the object."
  ].join("\n");
}

function buildOlcPlanningUser(question, scope) {
  return [
    "USER QUESTION:",
    question,
    "",
    "CURRENT SCOPE:",
    scope.description || (scope.is_full_db
      ? "The full corpus — all 2,145 OLC opinions (DOJ-published + Knight FOIA)."
      : fmtIntJs(scope.count) + " opinions (narrowed)."),
    scope.is_full_db
      ? "(no opinion_id constraint — your queries run against the full corpus; use the table name \"olc_opinions\")"
      : "(narrowed to " + fmtIntJs(scope.count) + " opinion_ids; the runner will substitute scoped_olc_opinions with an inline subquery filtered to the scope — use THAT name in your queries)",
    "",
    "Return the JSON plan now."
  ].join("\n");
}

function parseOlcPlan(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) {
      try { v = JSON.parse(firstObj); }
      catch (pe2) { throw new Error("JSON.parse error: " + pe2.message); }
    } else {
      throw new Error("could not find a JSON object in the response.");
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (["list", "narrative", "hybrid"].indexOf(v.output_mode) < 0) throw new Error("output_mode must be list, narrative, or hybrid.");
  if (!Array.isArray(v.queries)) throw new Error("queries must be an array.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  v.estimated_cost_cents = Math.max(0, Math.round(Number(v.estimated_cost_cents) || 0));
  v.approach_summary = String(v.approach_summary || "").trim();
  return v;
}

async function executeOlcPlan(env, plan, scope) {
  // 2,145 opinions max — always inlineable, no scope_sql path needed.
  let scopedBody = null;
  if (scope.opinion_ids && scope.opinion_ids.length > 0) {
    const idsSubquery = "SELECT unnest('{" + scope.opinion_ids.join(",") + "}'::bigint[]) AS id";
    scopedBody = "(SELECT o.* FROM olc_opinions o WHERE o.id IN (" + idsSubquery + "))";
  }

  const results = [];
  for (let i = 0; i < plan.queries.length; i++) {
    const q = plan.queries[i];
    let sql = String(q.sql || "").trim().replace(/;\s*$/, "").trim();
    if (!sql) continue;
    let execSql = sql;
    if (scopedBody) {
      execSql = substituteScoped(execSql, "scoped_olc_opinions", scopedBody);
    }
    if (!/^\s*SELECT\b/i.test(execSql)) execSql = "SELECT * FROM (" + execSql + ") AS olc_q";
    let rows;
    try { rows = await withStatementTimeoutRetry(() => corpusRunQuery(env, execSql)); }
    catch (err) { throw new Error('Query "' + (q.label || ("query " + (i + 1))) + '" failed: ' + err.message); }
    const truncated = (rows.length > 200) ? rows.slice(0, 200) : rows;
    results.push({ label: q.label || ("query " + (i + 1)), sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 200 });
  }
  return results;
}

function buildOlcSynthesisSystem(outputMode) {
  const listClause = (outputMode === "list" || outputMode === "hybrid")
    ? '"opinion_ids": [<bigint>, ...]   // the opinion ids the user should see; pulled from your query results.'
    : '"opinion_ids": null';
  return [
    "You are the synthesis step for an agentic narrative-synthesis tool over the OLC opinion corpus. The planner has already run the SQL queries you proposed; you now have the question, the plan, and the query results. Write the user-facing answer.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "answer_markdown": "...",  // markdown narrative; cite opinions in prose by title + year (e.g. "OLC\'s 1987 opinion on the Appointments Clause"). DO NOT embed internal id tokens.',
    "  " + listClause + ",",
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    "}",
    "",
    "Rules:",
    "- ATTRIBUTION-FORWARD. OLC is the executive's authoritative legal *position*, not a court's holding. Describe what OLC has said; never editorialize on whether it is correct.",
    "- CITE EVERY POSITION via OPINION TITLE + YEAR (and author where the row has it) in PROSE — 'OLC's 1987 opinion on the Appointments Clause', 'Olson's 1986 memo on executive privilege', 'the 2014 opinion on recess appointments'. The user navigates to each cited opinion via the Cited Opinions list that renders below the narrative; do NOT embed [olc-ref:N] tokens or any other internal id markers. Bad: '...OLC's 1987 opinion on X [olc-ref:42] concluded...'. Good: '...OLC's 1987 opinion on X concluded...'.",
    "- PROVENANCE WHEN MEANINGFUL. If your set includes Knight-FOIA opinions DOJ never published, mention that — it's a completeness signal for the user.",
    "- DEGRADED OCR. If any row has ocr_quality = 'degraded', surface that in candor_notes — synthesis from those rows is lower-confidence.",
    "- RELEASED-vs-ISSUED CAVEAT. Any count-by-year statement must include the caveat that counts reflect released opinions only, not OLC's true annual output.",
    "- ZERO-RESULT HONESTY. When the query results are empty (or near-empty) for what should be a non-trivial question, the answer_markdown MUST: (1) name the FTS terms tried in prose ('I searched for opinions matching ...'), (2) acknowledge this may be a keyword recall failure — explain that OLC opinions are doctrinal and often phrase concepts differently than questions (e.g., 'executive privilege' may appear as 'the President's communications privilege'; agency names may not appear at all where the analysis is about constitutional power), and (3) note that this could also genuinely mean OLC has not opined on the topic in publicly-released opinions (with the released-vs-issued caveat). Suggest one or two reformulations. DO NOT just say 'no results found'.",
    "- For list and hybrid output_modes, opinion_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable opinions, downgrade to narrative mode and explain.",
    "- Be tight. The user wants an answer, not a methodology essay. Keep candor_notes for caveats.",
    "- Output strict JSON only. No markdown outside answer_markdown. No code fences.",
    '- CRITICAL: inside answer_markdown, do NOT use straight double quotes (") — they break JSON parsing when not escaped. Use curly quotes ("") for direct quotation, or single quotes (\'\' or \') for short inline quotation. Apostrophes (\') are fine. If you absolutely must use a straight double quote, escape it as \\".'
  ].join("\n");
}

function buildOlcSynthesisUser(question, plan, results) {
  const resultsForModel = results.map(function (r) {
    return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated, rows: r.rows };
  });
  return [
    "USER QUESTION:",
    question,
    "",
    "YOUR PLAN (from the planning step):",
    plan.approach_summary,
    "",
    "PLANNED OUTPUT MODE: " + plan.output_mode,
    "",
    "CANDOR NOTES FROM PLANNING:",
    (plan.candor_notes && plan.candor_notes.length) ? plan.candor_notes.map(function (n) { return "- " + n; }).join("\n") : "(none)",
    "",
    "QUERY RESULTS (JSON):",
    JSON.stringify(resultsForModel, null, 2),
    "",
    "Return the synthesis JSON now."
  ].join("\n");
}

function parseOlcSynthesis(raw, outputMode) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
          catch (pe4) {
            const salvaged = salvageTruncatedSynthesis(raw);
            if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "opinion_ids");
            throw new Error("JSON.parse error: " + pe4.message);
          }
        }
      } else {
        const salvaged = salvageTruncatedSynthesis(raw);
        if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "opinion_ids");
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.answer_markdown !== "string" || !v.answer_markdown.trim()) throw new Error("answer_markdown is empty.");
  if (outputMode === "list" || outputMode === "hybrid") {
    if (!Array.isArray(v.opinion_ids) || v.opinion_ids.length === 0) {
      v.opinion_ids = [];
      v.candor_notes = (v.candor_notes || []).concat(["Output mode requested an opinion list but synthesis returned none — showing narrative only."]);
    } else {
      v.opinion_ids = v.opinion_ids
        .filter(function (x) { return x != null; })
        .map(function (x) { return Number(x); })
        .filter(function (x) { return Number.isFinite(x); });
    }
  } else {
    v.opinion_ids = null;
  }
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusOlcPlanHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const question = String((body && body.question) || "").trim();
  if (!question) return json({ error: { message: "Missing question" } }, 400);
  const scope = normalizeOlcScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildOlcPlanningSystem(),
      messages: [{ role: "user", content: buildOlcPlanningUser(question, scope) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Planning step: " + e.message, code: e.code } }, e.status || 502);
  }
  let plan;
  try { plan = parseOlcPlan(res.text); }
  catch (e) { return json({ error: { message: "Could not parse plan: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const token = crypto.randomUUID();
  await env.QUOTA.put("olc-plan:" + token, JSON.stringify({
    plan, scope, question, provider, model, userId: auth.userId, authMode: auth.authMode
  }), { expirationTtl: 900 });

  return json({
    token,
    output_mode: plan.output_mode,
    approach_summary: plan.approach_summary,
    candor_notes: plan.candor_notes,
    queries: plan.queries.map(function (q) { return { label: q.label, sql: q.sql }; }),
    estimated_cost_cents: plan.estimated_cost_cents,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

async function corpusOlcExecuteHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const token = body && body.token;
  if (!token || typeof token !== "string") return json({ error: { message: "Missing plan token" } }, 400);
  const stored = await env.QUOTA.get("olc-plan:" + token);
  if (!stored) return json({ error: { message: "Plan expired or not found — re-run the question.", code: "plan_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored plan is corrupt — re-run the question." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider, body);
  if (auth instanceof Response) return auth;
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This plan belongs to a different session. Re-run the question." } }, 403);
  }
  ctx.waitUntil(env.QUOTA.delete("olc-plan:" + token));

  let results;
  try { results = await executeOlcPlan(env, blob.plan, blob.scope); }
  catch (e) { return json({ error: { message: e.message, code: "execute_failed" } }, 400); }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildOlcSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildOlcSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 8000 : 6000
    });
  } catch (e) {
    return json({ error: { message: "Synthesis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let synth;
  try { synth = parseOlcSynthesis(res.text, blob.plan.output_mode); }
  catch (e) { return json({ error: { message: "Could not parse synthesis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    answer_markdown: synth.answer_markdown,
    opinion_ids: synth.opinion_ids,
    candor_notes: synth.candor_notes,
    output_mode: blob.plan.output_mode,
    query_summary: results.map(function (r) { return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated }; }),
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── OLC: summarize one opinion ──────────────────────────────────────────────
// Invoked from the opinion detail panel. Pulls the opinion's text_content +
// metadata, sends a single Anthropic call with an attribution-forward
// summarize prompt, returns a markdown summary. One billed call; no plan/
// execute split (the work is bounded by the single opinion's length).
//
// Brief #2 §1: "Walk me through / summarize this opinion." Brief #2 §5:
// attribution-forward, never editorialize, flag degraded OCR.

// Cap on text_content sent to the model. The longest OLC opinions are well
// under this; the cap protects us from a single runaway opinion pinning the
// model call to its max-input limit. Truncate with a visible note in the
// result, so synthesis doesn't claim coverage of text it never saw.
var OLC_SUMMARIZE_TEXT_CAP = 200000; // chars (~50K tokens)

function buildOlcSummarizeSystem() {
  return [
    "You are summarizing one OLC (DOJ Office of Legal Counsel) opinion for a researcher. OLC opinions are the executive branch's authoritative legal interpretations — contested, politically charged terrain. Your job: attribution-forward summary, never editorialize.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "summary_markdown": "...",  // markdown summary, 4-10 short paragraphs.',
    '  "candor_notes": ["caveats — degraded OCR, truncation, gaps in the text you were shown"]',
    "}",
    "",
    "Structure the summary_markdown around these headings (omit any that don't apply):",
    "- **Question presented** — what OLC was asked.",
    "- **Conclusion** — OLC's bottom line (one or two sentences).",
    "- **Reasoning** — the steps of the argument, in OLC's framing.",
    "- **Authorities cited** — major statutes, prior OLC opinions, court cases the opinion relies on (list, where identifiable).",
    "- **Notable caveats / limits** — anything OLC explicitly disclaimed or confined.",
    "",
    "Rules:",
    "- Describe what the opinion says. Do not say whether it is right or wrong, nor add modern context the opinion itself does not contain.",
    "- Quote sparingly; use curly quotes (“”) for direct quotation. Straight double quotes break JSON parsing.",
    "- If the text appears degraded (garbled OCR, missing sentences), surface that in candor_notes and lower-confidence the rest of your summary accordingly.",
    "- If the text was truncated before reaching you, note that in candor_notes (\"Summary based on the first N characters of the opinion; later sections not seen.\").",
    "- Output strict JSON only. No markdown outside summary_markdown. No code fences."
  ].join("\n");
}

function buildOlcSummarizeUser(opinion, wasTruncated) {
  const parts = [
    "OPINION METADATA:",
    "- Title: " + (opinion.title || "(no title)"),
    "- Date issued: " + (opinion.date_issued || "(no date)"),
    "- Author: " + (opinion.author || "(not populated)"),
    "- Recipient: " + (opinion.recipient || "(not populated)"),
    "- Source: " + (opinion.source || "(unknown)"),
    "- OCR quality: " + (opinion.ocr_quality || "(unknown)")
  ];
  if (opinion.summary) {
    parts.push("");
    parts.push("EDITORIAL SUMMARY (from the corpus, where present):");
    parts.push(opinion.summary);
  }
  parts.push("");
  parts.push("OPINION TEXT" + (wasTruncated ? " (TRUNCATED to " + fmtIntJs(OLC_SUMMARIZE_TEXT_CAP) + " characters — flag this in candor_notes):" : ":"));
  const text = String(opinion.text_content || "");
  parts.push(wasTruncated ? text.slice(0, OLC_SUMMARIZE_TEXT_CAP) : text);
  parts.push("");
  parts.push("Return the summary JSON now.");
  return parts.join("\n");
}

function parseOlcSummary(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    try {
      // Reuse the answer_markdown quote-repair, retargeted at summary_markdown.
      const repaired = cleaned.replace(/"answer_markdown"/g, '"summary_markdown"');
      const rep2 = repairAnswerMarkdownQuotes(repaired.replace(/"summary_markdown"/g, '"answer_markdown"'))
        .replace(/"answer_markdown"/g, '"summary_markdown"');
      v = JSON.parse(rep2);
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) { throw new Error("JSON.parse error: " + pe3.message); }
      } else {
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.summary_markdown !== "string" || !v.summary_markdown.trim()) throw new Error("summary_markdown is empty.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusOlcSummarizeHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  // Pull the opinion. Same SELECT shape as /corpus/olc/opinion so the
  // handler returns useful context to the model. Prefer cleaned/OCR'd text
  // (Knight degraded scans) so the summary works off legible text, not raw
  // OCR garbage — and so image-only docs (text only in text_content_clean)
  // are summarizable at all.
  const sql = "SELECT id, title, author, recipient, date_issued::text AS date_issued, " +
    "summary, source, COALESCE(text_content_clean, text_content) AS text_content, ocr_quality " +
    "FROM olc_opinions WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Opinion fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Opinion not found", code: "not_found" } }, 404);
  }
  const opinion = rows[0];
  const text = String(opinion.text_content || "");
  if (!text.trim()) {
    return json({ error: { message: "This opinion has no text content to summarize. (Likely a Knight FOIA entry with zero-text OCR; the corpus knows it exists but holds no text.)", code: "no_text" } }, 400);
  }
  const wasTruncated = text.length > OLC_SUMMARIZE_TEXT_CAP;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildOlcSummarizeSystem(),
      messages: [{ role: "user", content: buildOlcSummarizeUser(opinion, wasTruncated) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Summarize step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseOlcSummary(res.text); }
  catch (e) { return json({ error: { message: "Could not parse summary: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    summary_markdown: parsed.summary_markdown,
    candor_notes: parsed.candor_notes,
    was_truncated: wasTruncated,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ============================================================================
// Lawfare commentary corpus — v1 alpha
//
// The platform's FIRST commentary corpus: ~27K articles, podcasts, and
// newsletters from Lawfare's own archive. The atomic unit is an ARTICLE
// (analysis/opinion by a named expert author); the unit of authority is the
// byline. Unlike OLC/FRUS (primary sources), Lawfare is secondary
// commentary, which drives a hard accuracy guardrail: the analytical (AMA)
// path MUST query the view `lawfare_ama_source` (= the base table minus
// search_tier='suppressed' roundup digests), so derivative tables-of-contents
// are never counted or attributed in synthesis. The plain filter handler
// queries the base table directly (and excludes suppressed by default unless
// include_suppressed is set).
//
// Citations point to canonical_url (live lawfaremedia.org links), not PDF
// download paths. author/topic/date/content_type/series are all populated and
// reliable here — first-class scoping axes (contrast OLC, where author /
// recipient / president are NULL).
// ============================================================================

// Display columns for the list table. body_text/body_html are omitted to keep
// payloads cheap; the article-detail handler returns everything. canonical_url
// rides along so result rows + AMA cited-list rows render a one-click "↗ read
// on Lawfare" affordance (brief #1 §4b auditability).
var LAWFARE_DISPLAY_COLS = "id, slug, title, dek, author_names, published_date::text AS published_date, topic_names, content_type, series, canonical_url, text_length, quality, search_tier";

/**
 * Build the WHERE clause for /corpus/lawfare/filter. Same single-quote
 * escaping discipline as the USC/CFR/OLC/FRUS builders.
 *
 * Supported axes:
 *   q                  FTS over fts (title + dek + body_text)
 *   author_slug        author_slugs @> ARRAY['slug'] — exact slug membership
 *   author_name        case-insensitive substring over unnest(author_names) —
 *                      reaches authors outside the top-authors dropdown
 *   topic_slug         topic_slugs @> ARRAY['slug'] — exact slug membership
 *   content_type       exact match — 'article' | 'podcast' | 'newsletter'
 *   series             exact match on the recurring-series label
 *   date_from / date_to  ISO YYYY-MM-DD bounds on published_date
 *   include_suppressed boolean — by DEFAULT the filter EXCLUDES roundup
 *                      digests (search_tier='suppressed'); only when this is
 *                      true are they included.
 */
function buildLawfareFilterWhere(fields) {
  var parts = [];
  if (fields.q && typeof fields.q === 'string' && fields.q.trim()) {
    var q = fields.q.trim().replace(/'/g, "''");
    parts.push("fts @@ websearch_to_tsquery('english', '" + q + "')");
  }
  if (fields.author_slug && typeof fields.author_slug === 'string' && fields.author_slug.trim()) {
    var a = fields.author_slug.trim().replace(/'/g, "''");
    parts.push("author_slugs @> ARRAY['" + a + "']");
  }
  // Free-text author NAME match — case-insensitive substring over the
  // author_names array. Slugs follow an opaque first-initial+lastname scheme
  // ('alapatina') that the UI/user cannot derive, so name matching is the
  // reachable path for any author outside the top-authors dropdown.
  if (fields.author_name && typeof fields.author_name === 'string' && fields.author_name.trim()) {
    var an = fields.author_name.trim().replace(/'/g, "''");
    parts.push("EXISTS (SELECT 1 FROM unnest(author_names) AS _an WHERE _an ILIKE '%" + an + "%')");
  }
  if (fields.topic_slug && typeof fields.topic_slug === 'string' && fields.topic_slug.trim()) {
    var t = fields.topic_slug.trim().replace(/'/g, "''");
    parts.push("topic_slugs @> ARRAY['" + t + "']");
  }
  if (fields.content_type && typeof fields.content_type === 'string' && fields.content_type.trim()) {
    var c = fields.content_type.trim().replace(/'/g, "''");
    parts.push("content_type = '" + c + "'");
  }
  if (fields.series && typeof fields.series === 'string' && fields.series.trim()) {
    var s = fields.series.trim().replace(/'/g, "''");
    parts.push("series = '" + s + "'");
  }
  if (fields.date_from && typeof fields.date_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.date_from)) {
    parts.push("published_date >= '" + fields.date_from + "'");
  }
  if (fields.date_to && typeof fields.date_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.date_to)) {
    parts.push("published_date <= '" + fields.date_to + "'");
  }
  // Default: exclude suppressed (roundup digests). Only include them when the
  // caller explicitly opts in. This predicate is always present so a query
  // with no other axes still respects the default scope.
  if (fields.include_suppressed !== true) {
    parts.push("search_tier <> 'suppressed'");
  }
  return parts.length ? " WHERE " + parts.join(" AND ") : "";
}

async function corpusLawfareFacetsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  try {
    // ~27K rows — COUNT(*) is cheap; exact counts here (not the reltuples
    // estimate USC/CFR rely on). Facet counts reflect the DEFAULT search scope
    // (search_tier <> 'suppressed') so the numbers match what plain search
    // shows by default.
    const stats = await corpusRunQuery(env,
      "SELECT count(*)::bigint AS document_count, " +
      "MIN(published_date)::text AS earliest, " +
      "MAX(published_date)::text AS latest " +
      "FROM lawfare_documents WHERE search_tier <> 'suppressed'");
    const contentTypes = await corpusRunQuery(env,
      "SELECT content_type AS v, count(*)::bigint AS n FROM lawfare_documents " +
      "WHERE search_tier <> 'suppressed' AND content_type IS NOT NULL AND content_type <> '' " +
      "GROUP BY content_type ORDER BY n DESC");
    const topics = await corpusRunQuery(env,
      "SELECT t AS v, count(*)::bigint AS n FROM lawfare_documents, unnest(topic_names) AS t " +
      "WHERE search_tier <> 'suppressed' AND t IS NOT NULL AND t <> '' " +
      "GROUP BY t ORDER BY n DESC");
    const series = await corpusRunQuery(env,
      "SELECT series AS v, count(*)::bigint AS n FROM lawfare_documents " +
      "WHERE search_tier <> 'suppressed' AND series IS NOT NULL AND series <> '' " +
      "GROUP BY series ORDER BY n DESC");
    // Top authors by piece count. Unnest the parallel slug/name arrays with
    // ordinality so slug and display name stay aligned.
    const topAuthors = await corpusRunQuery(env,
      "SELECT a.slug AS slug, a.name AS name, count(*)::bigint AS n FROM lawfare_documents d, " +
      "LATERAL unnest(d.author_slugs, d.author_names) AS a(slug, name) " +
      "WHERE d.search_tier <> 'suppressed' AND a.slug IS NOT NULL AND a.slug <> '' " +
      "GROUP BY a.slug, a.name ORDER BY n DESC LIMIT 50");
    const s = stats[0] || {};
    return json({
      document_count: s.document_count,
      earliest: s.earliest,
      latest: s.latest,
      content_types: contentTypes.map((r) => ({ value: r.v, count: r.n })),
      topics: topics.map((r) => ({ value: r.v, count: r.n })),
      series: series.map((r) => ({ value: r.v, count: r.n })),
      top_authors: topAuthors.map((r) => ({ slug: r.slug, name: r.name, count: r.n }))
    }, 200);
  } catch (e) {
    return json({ error: { message: "Lawfare facets fetch failed: " + e.message } }, 502);
  }
}

async function corpusLawfareFilterHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const fields = (body && body.fields) || {};
  const where = buildLawfareFilterWhere(fields);
  const idsSql = "SELECT id FROM lawfare_documents" + where;
  // Order by published_date desc — most recent first (research starts from
  // current state and walks back).
  const rowsSql = "SELECT " + LAWFARE_DISPLAY_COLS + " FROM lawfare_documents" + where +
    " ORDER BY published_date DESC NULLS LAST LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "Lawfare filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const ids = idRows.map((r) => r.id).filter((x) => x != null);
  return json({
    ids,
    display_rows: rows,
    count: ids.length,
    generated_sql: rowsSql,
    executed_sql: idsSql
  }, 200);
}

/**
 * Single-article detail for the Lawfare article panel. Includes the full
 * body_text + body_html plus all metadata (authors, topics, series,
 * content_type, dek, canonical_url). Mirrors corpusOlcOpinionHandler.
 */
async function corpusLawfareArticleHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }
  const sql = "SELECT id, slug, canonical_url, title, dek, author_names, author_slugs, " +
    "published_at::text AS published_at, published_date::text AS published_date, published_raw, " +
    "topic_names, topic_slugs, series, content_type, search_tier, " +
    "body_text, body_html, text_length, quality, source " +
    "FROM lawfare_documents WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Article fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Article not found", code: "not_found" } }, 404);
  }
  return json({ article: rows[0] }, 200);
}

// ── Lawfare AI modes ─────────────────────────────────────────────────────────
// Two surfaces:
//   1. Narrative synthesis (claude_ama-shaped) — "what have Lawfare authors
//      argued about X" — plan + execute against the lawfare_ama_source VIEW
//      (roundup digests excluded; only original authored pieces).
//   2. Summarize-one-article — invoked from the article detail panel; a single
//      Anthropic call on one article's body_text.
//
// Mirrors the OLC plan/execute shape, with Lawfare-specific schema, canonical
// citation syntax (article title + author + date, with canonical_url, in
// prose; cited list below does navigation), and COMMENTARY DISCIPLINE (attribute
// every position to a named author + piece; synthesize what authors said,
// never adjudicate; surface the range on contested questions; never add
// RAGtime's own analysis).

// Scope normalization for Lawfare. The corpus is small enough to always inline
// an article_ids list when scope is narrowed; full-DB otherwise. Mirrors
// normalizeOlcScope (opinion_ids → article_ids).
function normalizeLawfareScope(s) {
  s = s || {};
  let ids = Array.isArray(s.article_ids)
    ? s.article_ids.filter((x) => x != null).map(Number).filter(Number.isFinite)
    : null;
  if (ids && ids.length === 0) ids = null;
  return {
    article_ids: ids,
    is_full_db: !ids,
    count: Number(s.count) || (ids ? ids.length : 0),
    description: typeof s.description === "string" && s.description.trim() ? s.description.trim() : ""
  };
}

var LAWFARE_AMA_SCHEMA_DOC = [
  "RELATION: lawfare_ama_source — one row per Lawfare piece (article / podcast / newsletter). This is a VIEW over the base table that EXCLUDES roundup digests (secondary tables-of-contents); it holds only ORIGINAL AUTHORED pieces. Use this relation for ALL analytical work — counts here are counts of original commentary, never of derivative digests.",
  "  id (bigint, PK)               — piece id; use this to identify a piece in your output.",
  "  slug (text)                   — URL slug.",
  "  canonical_url (text)          — the live lawfaremedia.org link; MUST accompany every citation so the user reads the real piece.",
  "  title (text)                  — piece title; FTS-indexed in column \"fts\" alongside dek + body_text.",
  "  dek (text)                    — subhead / standfirst summary, where present.",
  "  author_names (text[])         — display names of the byline authors; POPULATED and reliable. The unit of authority is the byline — attribute positions to these names.",
  "  author_slugs (text[])         — author slugs, parallel to author_names. Filter with author_slugs @> ARRAY['slug'] when scoping to an author.",
  "  published_date (date)         — publication date; POPULATED and reliable; this is your temporal axis.",
  "  topic_names (text[])          — Lawfare's controlled topic taxonomy (~13 values); POPULATED and reliable.",
  "  topic_slugs (text[])          — topic slugs, parallel to topic_names. Filter with topic_slugs @> ARRAY['slug'].",
  "  series (text)                 — recurring-series label (e.g. a podcast or column series); NULL where the piece is not part of a series.",
  "  content_type (text)           — 'article' | 'podcast' | 'newsletter'. Surface this in synthesis ('from the Lawfare Podcast' vs 'in an article by ...').",
  "  body_text (text)              — full piece text; LARGE (do not return raw — pull title/dek/author_names/published_date and let synthesis cite).",
  "  text_length (int)             — piece length in characters.",
  "  quality (text)                — ingest-quality flag.",
  "  fts (tsvector, generated)     — over title + dek + body_text — use this for topical search.",
  "",
  "NOTES:",
  "- Topical/conceptual search: WHERE fts @@ websearch_to_tsquery('english', 'your search') — supports OR and quoted phrases.",
  "- AUTHOR is a first-class scoping axis. 'What has [author] argued about X' → WHERE author_slugs @> ARRAY['author-slug'] AND fts @@ ... . Author names are reliable.",
  "- TOPIC is a controlled ~13-value taxonomy; topic_slugs @> ARRAY['topic-slug'] is a clean scoping axis.",
  "- DATE axis is reliable; populated on rows. 'What has Lawfare said in the last year' → published_date >= now() - interval '1 year'.",
  "- CONTENT_TYPE lets you separate written analysis from the Lawfare Podcast / newsletters; surface the medium in synthesis.",
  "- COMMENTARY, NOT PRIMARY SOURCE: Lawfare is analysis/opinion by named experts. The unit of citation is the article; the unit of authority is the byline. Counts here are of ORIGINAL authored pieces (the view excludes roundup digests) — mention this when reporting counts.",
  "- Read-only: only SELECT statements are accepted; LIMIT yourself to ≤ 500 rows per query.",
].join("\n");

function buildLawfarePlanningSystem() {
  return [
    "You are the planner for an agentic narrative-synthesis tool over the LAWFARE COMMENTARY corpus — articles, podcasts, and newsletters of legal/national-security analysis by named expert authors. This is COMMENTARY, not primary source: the unit of citation is the article, the unit of authority is the byline. Your job is to look at a user question and the current scope, then return a JSON plan describing how you would answer it.",
    "",
    "You have access to a Postgres database (read-only) via SELECT queries. Schema:",
    "",
    LAWFARE_AMA_SCHEMA_DOC,
    "",
    "Output a single JSON object with these keys (no prose, no code fences):",
    "{",
    '  "output_mode": "list" | "narrative" | "hybrid",',
    "       // list = the question wants a refined set of pieces (the field will be narrowed).",
    "       // narrative = the question wants an analytical answer; the field is unchanged.",
    "       // hybrid = both — narrative summary plus a refined list (most synthesis questions).",
    '  "approach_summary": "2-4 sentence plan, plain prose, no markdown headers",',
    '  "candor_notes": ["caveats the user should see — e.g. for COUNT questions, that counts are of original authored pieces (the view excludes roundup digests); keyword-recall risk on conceptual queries; missing coverage you could not find"],',
    '  "queries": [',
    '    {"label": "what this query gathers", "sql": "SELECT ... FROM lawfare_ama_source WHERE ... LIMIT 200"},',
    "    ...",
    "  ],",
    '  "estimated_cost_cents": <integer>,',
    "       // your estimate of the synthesis call cost in cents (the planning call is already paid).",
    "       // Synthesis input ≈ all query results in JSON; output ≈ 800-2000 tokens.",
    "       // Anthropic Sonnet pricing × 1.35 markup is roughly: input 0.4¢/1K tokens, output 2¢/1K tokens.",
    '  "wants_synthesis": true',
    "}",
    "",
    "Rules:",
    "- Be ruthlessly economical with queries. Pull metadata (id, title, dek, author_names, published_date, topic_names, content_type, canonical_url) — NEVER body_text in a planned query. Synthesis works from titles + deks + bylines + dates; per-piece deep reads are a separate mode.",
    "- The unit of citation is the article and the unit of authority is the byline — ALWAYS pull author_names, published_date, title, and canonical_url so synthesis can attribute every position to a named author + piece + date with a live link.",
    "- AUTHOR is a first-class scoping axis. 'What has [author] argued about X' → scope by NAME against the author_names array, NOT by a guessed slug. Author slugs follow an opaque scheme (first-initial + last name, e.g. 'alapatina' for Anastasiia Lapatina) that you CANNOT reliably derive from a name, so guessing author_slugs @> ARRAY['...'] silently returns zero. Instead match the display name: EXISTS (SELECT 1 FROM unnest(author_names) AS _a WHERE _a ILIKE '%lapatina%'). Use a distinctive surname (or surname fragment) as the ILIKE needle to tolerate spelling/diacritic variants (e.g. 'Anastasiia' vs 'Anastasia'). Do NOT skip the author filter just because the question also has a topic.",
    "- TOPIC is a controlled taxonomy — use topic_slugs @> ARRAY['topic-slug'] where the question maps cleanly onto a topic.",
    "- For trend questions, prefer ONE query that groups by year (or by author, or by content_type) over many narrow queries. For COUNT/methodology questions, surface in candor_notes that the count is of original authored pieces (the queryable view excludes roundup digests) plus the denominator/dataset.",
    "- For narrative questions over a topic ('how have Lawfare authors thought about X'), order by published_date ASC and cap at 200 pieces per query — plenty of evidence for synthesis.",
    "- KEYWORD UNDERPERFORMS ON CONCEPTUAL QUERIES — FAN OUT WITH OR GENEROUSLY. The author's phrasing rarely matches the user's. Specific failure modes:",
    "    * **Doctrine vs phrasing.** User asks about 'executive privilege'; a piece may say 'the President's communications privilege', 'deliberative-process privilege', 'presidential confidentiality'. Fan: '\"executive privilege\" OR \"communications privilege\" OR \"deliberative process\" OR \"presidential confidentiality\"'.",
    "    * **Issue framings.** 'Can the President do X' → 'authority', 'power', 'constitutional', 'Article II', 'statutory'. Fan these with the action verb.",
    "    * **Named-entity drift.** A piece may name the umbrella department, the statute, or the case rather than the agency/officer the user named.",
    "  WORKED EXAMPLE — *'what have Lawfare authors argued about birthright citizenship'*: don't just FTS 'birthright citizenship'. Fan: websearch_to_tsquery('english', '\"birthright citizenship\" OR \"Fourteenth Amendment\" OR \"jus soli\" OR \"citizenship clause\" OR \"subject to the jurisdiction\"').",
    "- NARRATIVE DISCIPLINE. For output_mode='narrative' or 'hybrid', prefer 2–4 queries, NOT 6+. Synthesis has a finite output-token budget; too many queries inflate the input and risk truncation. A single well-fanned query with strong OR coverage beats five literal-term queries.",
    "- COMMENTARY DISCIPLINE (bake this into your plan). Lawfare is analysis/opinion. You are planning to SYNTHESIZE WHAT LAWFARE AUTHORS SAID — never to adjudicate which view is correct. On CONTESTED questions, plan queries that surface the RANGE of published positions (don't pre-select for one side). Distinguish reporting vs. argument vs. prediction where the source does.",
    "- WHEN THE CURRENT SCOPE IS NARROWED (article_ids list provided): use the name \"scoped_lawfare_documents\" instead of \"lawfare_ama_source\". The runner substitutes this with an inline subquery over the view, already filtered to the scope. CRITICAL: reference this name ONLY after FROM or JOIN keywords, and DO NOT alias it. Write \"FROM scoped_lawfare_documents WHERE published_date > '2024-01-01'\" (good), not \"FROM scoped_lawfare_documents d WHERE ...\" (will break). WHEN SCOPE IS THE FULL CORPUS: use \"lawfare_ama_source\".",
    LEGAL_ADVICE_PLANNER_RULE,
    "- Output strict JSON only. No markdown. No code fences. No prose outside the object."
  ].join("\n");
}

function buildLawfarePlanningUser(question, scope) {
  return [
    "USER QUESTION:",
    question,
    "",
    "CURRENT SCOPE:",
    scope.description || (scope.is_full_db
      ? "The full Lawfare commentary corpus (original authored pieces; roundup digests excluded)."
      : fmtIntJs(scope.count) + " pieces (narrowed)."),
    scope.is_full_db
      ? "(no article_id constraint — your queries run against the full corpus; use the relation name \"lawfare_ama_source\")"
      : "(narrowed to " + fmtIntJs(scope.count) + " article_ids; the runner will substitute scoped_lawfare_documents with an inline subquery over the view filtered to the scope — use THAT name in your queries)",
    "",
    "Return the JSON plan now."
  ].join("\n");
}

function parseLawfarePlan(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) {
      try { v = JSON.parse(firstObj); }
      catch (pe2) { throw new Error("JSON.parse error: " + pe2.message); }
    } else {
      throw new Error("could not find a JSON object in the response.");
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (["list", "narrative", "hybrid"].indexOf(v.output_mode) < 0) throw new Error("output_mode must be list, narrative, or hybrid.");
  if (!Array.isArray(v.queries)) throw new Error("queries must be an array.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  v.estimated_cost_cents = Math.max(0, Math.round(Number(v.estimated_cost_cents) || 0));
  v.approach_summary = String(v.approach_summary || "").trim();
  return v;
}

async function executeLawfarePlan(env, plan, scope) {
  // Scope is inlined as a subquery over the VIEW (lawfare_ama_source), so even
  // a narrowed scope can never reach a suppressed roundup digest.
  let scopedBody = null;
  if (scope.article_ids && scope.article_ids.length > 0) {
    const idsSubquery = "SELECT unnest('{" + scope.article_ids.join(",") + "}'::bigint[]) AS id";
    scopedBody = "(SELECT d.* FROM lawfare_ama_source d WHERE d.id IN (" + idsSubquery + "))";
  }

  const results = [];
  for (let i = 0; i < plan.queries.length; i++) {
    const q = plan.queries[i];
    let sql = String(q.sql || "").trim().replace(/;\s*$/, "").trim();
    if (!sql) continue;
    let execSql = sql;
    if (scopedBody) {
      execSql = substituteScoped(execSql, "scoped_lawfare_documents", scopedBody);
    }
    // HARD GUARDRAIL: the analytical/AMA path must never read suppressed roundup
    // digests (they are derivative tables-of-contents, not authored Lawfare
    // pieces — they must never be counted or attributed). The planner is told to
    // use the lawfare_ama_source view, but we ALSO force it in code: rewrite any
    // bare base-table reference to the view. The \b before "lawfare_documents"
    // is a real word boundary only when not preceded by a word char, so this
    // does NOT touch "scoped_lawfare_documents", and "lawfare_ama_source" is
    // untouched. Belt-and-suspenders so a planner slip can't leak roundups.
    execSql = execSql.replace(/\blawfare_documents\b/g, "lawfare_ama_source");
    if (!/^\s*SELECT\b/i.test(execSql)) execSql = "SELECT * FROM (" + execSql + ") AS lawfare_q";
    let rows;
    try { rows = await withStatementTimeoutRetry(() => corpusRunQuery(env, execSql)); }
    catch (err) { throw new Error('Query "' + (q.label || ("query " + (i + 1))) + '" failed: ' + err.message); }
    const truncated = (rows.length > 200) ? rows.slice(0, 200) : rows;
    results.push({ label: q.label || ("query " + (i + 1)), sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 200 });
  }
  return results;
}

function buildLawfareSynthesisSystem(outputMode) {
  const listClause = (outputMode === "list" || outputMode === "hybrid")
    ? '"article_ids": [<bigint>, ...]   // the article ids the user should see; pulled from your query results.'
    : '"article_ids": null';
  return [
    "You are the synthesis step for an agentic narrative-synthesis tool over the LAWFARE COMMENTARY corpus. The planner has already run the SQL queries you proposed; you now have the question, the plan, and the query results. Write the user-facing answer.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "answer_markdown": "...",  // markdown narrative; cite pieces in prose by title + author + date (e.g. "In \'The Limits of Executive Power\' (March 2025), Jane Doe argued that..."). DO NOT embed internal id tokens.',
    "  " + listClause + ",",
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    "}",
    "",
    "COMMENTARY DISCIPLINE — this is the core of the job (Lawfare is analysis/opinion by named experts, NOT a court holding or a primary source):",
    "- ATTRIBUTE EVERY POSITION to a specific author + piece (title) + date: \"In [title] ([date]), [author] argued that…\". The unit of citation is the article; the unit of authority is the byline. NEVER state a contested analytical claim as settled fact.",
    "- SYNTHESIZE WHAT LAWFARE AUTHORS SAID — never adjudicate which view is correct, never add RAGtime's own analysis on top of theirs.",
    "- ON CONTESTED QUESTIONS, surface the RANGE of published positions WITH ATTRIBUTION; do NOT declare a winner.",
    "- DISTINGUISH reporting vs. argument vs. prediction where the source does; don't flatten a hedged forecast into a factual claim.",
    "- SURFACE THE MEDIUM via content_type — \"from the Lawfare Podcast ([date])\" vs. \"in an article by [author]\" vs. \"in a newsletter\".",
    "- EVERY CITATION MUST CARRY THE PIECE'S canonical_url (the live lawfaremedia.org link) so the user can read the real piece. Weave the link into the prose or list it with the citation.",
    "- For analytical COUNTS, show methodology + denominator + dataset; because the queryable view excludes roundup digests, counts are of ORIGINAL authored pieces — say so.",
    "",
    "Other rules:",
    "- CITE EVERY POSITION via TITLE + AUTHOR + DATE in PROSE. The user navigates to each cited piece via the Cited Articles list that renders below the narrative; do NOT embed [lawfare-ref:N] tokens or any other internal id markers. Bad: '...as argued in X [lawfare-ref:42]...'. Good: '...as argued in X...'.",
    "- ZERO-RESULT HONESTY. When the query results are empty (or near-empty) for what should be a non-trivial question, the answer_markdown MUST: (1) name the FTS terms tried in prose ('I searched for pieces matching ...'), (2) acknowledge this may be a keyword-recall failure — commentary often phrases concepts differently than questions — and (3) note it could genuinely mean Lawfare has not covered the topic. Suggest one or two reformulations. DO NOT just say 'no results found'.",
    "- For list and hybrid output_modes, article_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable pieces, downgrade to narrative mode and explain.",
    "- Be tight. The user wants an answer, not a methodology essay. Keep candor_notes for caveats.",
    "- Output strict JSON only. No markdown outside answer_markdown. No code fences.",
    '- CRITICAL: inside answer_markdown, do NOT use straight double quotes (") — they break JSON parsing when not escaped. Use curly quotes ("") for direct quotation, or single quotes (\'\' or \') for short inline quotation. Apostrophes (\') are fine. If you absolutely must use a straight double quote, escape it as \\".'
  ].join("\n");
}

function buildLawfareSynthesisUser(question, plan, results) {
  const resultsForModel = results.map(function (r) {
    return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated, rows: r.rows };
  });
  return [
    "USER QUESTION:",
    question,
    "",
    "YOUR PLAN (from the planning step):",
    plan.approach_summary,
    "",
    "PLANNED OUTPUT MODE: " + plan.output_mode,
    "",
    "CANDOR NOTES FROM PLANNING:",
    (plan.candor_notes && plan.candor_notes.length) ? plan.candor_notes.map(function (n) { return "- " + n; }).join("\n") : "(none)",
    "",
    "QUERY RESULTS (JSON):",
    JSON.stringify(resultsForModel, null, 2),
    "",
    "Return the synthesis JSON now."
  ].join("\n");
}

function parseLawfareSynthesis(raw, outputMode) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
          catch (pe4) {
            const salvaged = salvageTruncatedSynthesis(raw);
            if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "article_ids");
            throw new Error("JSON.parse error: " + pe4.message);
          }
        }
      } else {
        const salvaged = salvageTruncatedSynthesis(raw);
        if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "article_ids");
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.answer_markdown !== "string" || !v.answer_markdown.trim()) throw new Error("answer_markdown is empty.");
  if (outputMode === "list" || outputMode === "hybrid") {
    if (!Array.isArray(v.article_ids) || v.article_ids.length === 0) {
      v.article_ids = [];
      v.candor_notes = (v.candor_notes || []).concat(["Output mode requested an article list but synthesis returned none — showing narrative only."]);
    } else {
      v.article_ids = v.article_ids
        .filter(function (x) { return x != null; })
        .map(function (x) { return Number(x); })
        .filter(function (x) { return Number.isFinite(x); });
    }
  } else {
    v.article_ids = null;
  }
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusLawfarePlanHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const question = String((body && body.question) || "").trim();
  if (!question) return json({ error: { message: "Missing question" } }, 400);
  const scope = normalizeLawfareScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildLawfarePlanningSystem(),
      messages: [{ role: "user", content: buildLawfarePlanningUser(question, scope) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Planning step: " + e.message, code: e.code } }, e.status || 502);
  }
  let plan;
  try { plan = parseLawfarePlan(res.text); }
  catch (e) { return json({ error: { message: "Could not parse plan: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const token = crypto.randomUUID();
  await env.QUOTA.put("lawfare-plan:" + token, JSON.stringify({
    plan, scope, question, provider, model, userId: auth.userId, authMode: auth.authMode
  }), { expirationTtl: 900 });

  return json({
    token,
    output_mode: plan.output_mode,
    approach_summary: plan.approach_summary,
    candor_notes: plan.candor_notes,
    queries: plan.queries.map(function (q) { return { label: q.label, sql: q.sql }; }),
    estimated_cost_cents: plan.estimated_cost_cents,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

async function corpusLawfareExecuteHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const token = body && body.token;
  if (!token || typeof token !== "string") return json({ error: { message: "Missing plan token" } }, 400);
  const stored = await env.QUOTA.get("lawfare-plan:" + token);
  if (!stored) return json({ error: { message: "Plan expired or not found — re-run the question.", code: "plan_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored plan is corrupt — re-run the question." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider, body);
  if (auth instanceof Response) return auth;
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This plan belongs to a different session. Re-run the question." } }, 403);
  }
  ctx.waitUntil(env.QUOTA.delete("lawfare-plan:" + token));

  let results;
  try { results = await executeLawfarePlan(env, blob.plan, blob.scope); }
  catch (e) { return json({ error: { message: e.message, code: "execute_failed" } }, 400); }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildLawfareSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildLawfareSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 8000 : 6000
    });
  } catch (e) {
    return json({ error: { message: "Synthesis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let synth;
  try { synth = parseLawfareSynthesis(res.text, blob.plan.output_mode); }
  catch (e) { return json({ error: { message: "Could not parse synthesis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const querySummary = results.map(function (r) { return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated }; });

  // Authoritative server-side trace capture (joins the client annotation row by
  // interaction_id). Fire-and-forget; gated + UUID-guarded inside the helper.
  logCorpusSuccess(request, env, ctx, {
    interaction_id: body && body.interaction_id,
    // user_email is filled by the client annotation POST (derived from the JWT);
    // the trace log keys on user_id, which already identifies paid sessions.
    authMode: auth.authMode, userId: auth.userId,
    surface: "lawfare", mode: "ama", question: blob.question,
    output_mode: blob.plan.output_mode,
    plan: { output_mode: blob.plan.output_mode, approach_summary: blob.plan.approach_summary, queries: blob.plan.queries, estimated_cost_cents: blob.plan.estimated_cost_cents },
    query_summary: querySummary,
    answer_markdown: synth.answer_markdown, cited_ids: synth.article_ids, candor_notes: synth.candor_notes,
    cost_cents: res.costCents, provider: blob.provider, model: blob.model
  });

  return json({
    answer_markdown: synth.answer_markdown,
    article_ids: synth.article_ids,
    candor_notes: synth.candor_notes,
    output_mode: blob.plan.output_mode,
    query_summary: querySummary,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── Lawfare: summarize one article ──────────────────────────────────────────
// Invoked from the article detail panel. Pulls the article's body_text +
// metadata, sends a single Anthropic call with an attribution-forward
// summarize prompt, returns a markdown summary. One billed call; no plan/
// execute split (bounded by the single article's length).

var LAWFARE_SUMMARIZE_TEXT_CAP = 200000; // chars (~50K tokens)

function buildLawfareSummarizeSystem() {
  return [
    "You are summarizing one LAWFARE piece (an article, podcast, or newsletter of legal/national-security commentary by a named expert author) for a researcher. This is COMMENTARY, not a primary source: the unit of authority is the byline. Your job: attribution-forward summary of what the AUTHOR argued — never editorialize on whether they are right.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "summary_markdown": "...",  // markdown summary, 4-10 short paragraphs.',
    '  "candor_notes": ["caveats — truncation, gaps in the text you were shown"]',
    "}",
    "",
    "Structure the summary_markdown around these headings (omit any that don't apply):",
    "- **Thesis** — the author's central claim or argument, in one or two sentences.",
    "- **Argument** — the steps of the reasoning, in the author's framing.",
    "- **Key points** — notable sub-claims, evidence, or examples the author marshals.",
    "- **Predictions / recommendations** — any forecasts or prescriptions the author makes (flag them AS forecasts/prescriptions, not facts).",
    "- **Caveats the author flags** — anything the author explicitly hedges or confines.",
    "",
    "Rules:",
    "- Describe what the AUTHOR argues. Do not say whether it is right or wrong, do not add your own analysis, and do not flatten a hedged prediction into a factual claim.",
    "- Distinguish reporting vs. argument vs. prediction where the piece does.",
    "- Quote sparingly; use curly quotes (“”) for direct quotation. Straight double quotes break JSON parsing.",
    "- If the text was truncated before reaching you, note that in candor_notes (\"Summary based on the first N characters of the piece; later sections not seen.\").",
    "- Output strict JSON only. No markdown outside summary_markdown. No code fences."
  ].join("\n");
}

function buildLawfareSummarizeUser(article, wasTruncated) {
  const authors = Array.isArray(article.author_names) ? article.author_names.filter(Boolean).join(", ") : "";
  const topics = Array.isArray(article.topic_names) ? article.topic_names.filter(Boolean).join(", ") : "";
  const parts = [
    "PIECE METADATA:",
    "- Title: " + (article.title || "(no title)"),
    "- Published: " + (article.published_date || "(no date)"),
    "- Author(s): " + (authors || "(none listed)"),
    "- Content type: " + (article.content_type || "(unknown)"),
    "- Series: " + (article.series || "(none)"),
    "- Topics: " + (topics || "(none)"),
    "- Canonical URL: " + (article.canonical_url || "(none)")
  ];
  if (article.dek) {
    parts.push("");
    parts.push("DEK / STANDFIRST:");
    parts.push(article.dek);
  }
  parts.push("");
  parts.push("PIECE TEXT" + (wasTruncated ? " (TRUNCATED to " + fmtIntJs(LAWFARE_SUMMARIZE_TEXT_CAP) + " characters — flag this in candor_notes):" : ":"));
  const text = String(article.body_text || "");
  parts.push(wasTruncated ? text.slice(0, LAWFARE_SUMMARIZE_TEXT_CAP) : text);
  parts.push("");
  parts.push("Return the summary JSON now.");
  return parts.join("\n");
}

function parseLawfareSummary(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    try {
      const repaired = cleaned.replace(/"answer_markdown"/g, '"summary_markdown"');
      const rep2 = repairAnswerMarkdownQuotes(repaired.replace(/"summary_markdown"/g, '"answer_markdown"'))
        .replace(/"answer_markdown"/g, '"summary_markdown"');
      v = JSON.parse(rep2);
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) { throw new Error("JSON.parse error: " + pe3.message); }
      } else {
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.summary_markdown !== "string" || !v.summary_markdown.trim()) throw new Error("summary_markdown is empty.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusLawfareSummarizeHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  const sql = "SELECT id, title, dek, author_names, published_date::text AS published_date, " +
    "topic_names, content_type, series, canonical_url, body_text " +
    "FROM lawfare_documents WHERE id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Article fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Article not found", code: "not_found" } }, 404);
  }
  const article = rows[0];
  const text = String(article.body_text || "");
  if (!text.trim()) {
    return json({ error: { message: "This piece has no body text to summarize.", code: "no_text" } }, 400);
  }
  const wasTruncated = text.length > LAWFARE_SUMMARIZE_TEXT_CAP;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildLawfareSummarizeSystem(),
      messages: [{ role: "user", content: buildLawfareSummarizeUser(article, wasTruncated) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Summarize step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseLawfareSummary(res.text); }
  catch (e) { return json({ error: { message: "Could not parse summary: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    summary_markdown: parsed.summary_markdown,
    candor_notes: parsed.candor_notes,
    was_truncated: wasTruncated,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

async function corpusLawfareItemsByIdsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const parsed = parseItemsByIdsRequest(body && body.ids);
  if (parsed.error) return json({ error: { message: parsed.error } }, 400);
  if (parsed.ids.length === 0) return json({ display_rows: [] }, 200);
  const sql = buildItemsByIdsSql(LAWFARE_DISPLAY_COLS, "lawfare_documents", parsed.ids);
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Lawfare items-by-ids failed: " + e.message } }, 502); }
  return json({ display_rows: rows }, 200);
}

// ============================================================================
// FRUS (Foreign Relations of the United States) corpus — v1 alpha
//
// Fifth and final v1 spoke. The corpus has two tables:
//   frus_documents — 314,483 documents across 552 volumes-with-docs
//   frus_volumes — 694 volume metadata rows (552 with docs, 142 placeholders
//                  for the lagging-publication tail of the series)
//
// Per brief #5 FRUS is paradigmatically analytical/narrative — the user
// asks "Tell me about US-Iran relations in 1979" and the system
// synthesizes from the relevant cluster of documents. v1 alpha is the
// metadata-floor surface: keyword + structured filtering plus a
// document detail panel.
//
// Display columns omit text_content (loaded on detail); the FRUS-specific
// addition is `volume_id` so the user can see which volume each doc came
// from inline (the natural browse spine).
// ============================================================================

// `source_url` joins here (PR 4v) so every row that mentions a FRUS
// document carries a one-click path to history.state.gov. Brief #1 §4b
// (auditability): for FRUS, the link to the State Department's
// publication IS the canonical check. Buried at the bottom of the
// detail panel before 4v; now surfaced on every row.
var FRUS_DISPLAY_COLS = "id, title, doc_date::text AS doc_date, volume_id, place_name, classification, source_url, text_length";

/**
 * Build the WHERE clause for /corpus/frus/filter. Same single-quote
 * escaping discipline as USC/CFR/OLC.
 *
 * Supported axes:
 *   search          FTS over fts (text_content + title)
 *   title           substring (ILIKE %title%)
 *   volumeId        exact match on volume_id (e.g. "frus1969-76v01")
 *   subSeries       exact match (joined through frus_volumes)
 *   classification  exact match — 'Secret', 'Confidential', 'Top Secret',
 *                   'Limited Official Use', 'Official Use Only',
 *                   'Unclassified', 'Restricted'
 *   from / to       ISO YYYY-MM-DD bounds on doc_date
 *   place           substring on place_name (where the document originated)
 */
function buildFrusFilterWhere(fields) {
  var parts = [];
  if (fields.search && typeof fields.search === 'string' && fields.search.trim()) {
    var q = fields.search.trim().replace(/'/g, "''");
    parts.push("fts @@ websearch_to_tsquery('english', '" + q + "')");
  }
  if (fields.title && typeof fields.title === 'string' && fields.title.trim()) {
    var t = fields.title.trim().replace(/'/g, "''");
    parts.push("title ILIKE '%" + t + "%'");
  }
  if (fields.volumeId && typeof fields.volumeId === 'string' && fields.volumeId.trim()) {
    var v = fields.volumeId.trim().replace(/'/g, "''");
    parts.push("volume_id = '" + v + "'");
  }
  if (fields.subSeries && typeof fields.subSeries === 'string' && fields.subSeries.trim()) {
    // sub_series lives on frus_volumes; join via subquery so we keep the
    // build pure (no caller has to compose a JOIN clause).
    var ss = fields.subSeries.trim().replace(/'/g, "''");
    parts.push("volume_id IN (SELECT volume_id FROM frus_volumes WHERE sub_series = '" + ss + "')");
  }
  if (fields.classification && typeof fields.classification === 'string' && fields.classification.trim()) {
    var c = fields.classification.trim().replace(/'/g, "''");
    parts.push("classification = '" + c + "'");
  }
  if (fields.from && typeof fields.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.from)) {
    parts.push("doc_date >= '" + fields.from + "'");
  }
  if (fields.to && typeof fields.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.to)) {
    parts.push("doc_date <= '" + fields.to + "'");
  }
  if (fields.place && typeof fields.place === 'string' && fields.place.trim()) {
    var p = fields.place.trim().replace(/'/g, "''");
    parts.push("place_name ILIKE '%" + p + "%'");
  }
  return parts.length ? " WHERE " + parts.join(" AND ") : "";
}

async function corpusFrusFacetsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  try {
    // 314K docs — use reltuples for the doc count (like USC/CFR), exact
    // counts for the smaller volume / sub_series / classification totals.
    const stats = await corpusRunQuery(env,
      "SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.frus_documents'::regclass) AS document_count, " +
      "(SELECT count(*)::bigint FROM frus_volumes) AS volume_count, " +
      "(SELECT count(*)::bigint FROM frus_volumes WHERE doc_count > 0) AS volumes_with_docs, " +
      "(SELECT MIN(doc_date)::text FROM frus_documents) AS earliest, " +
      "(SELECT MAX(doc_date)::text FROM frus_documents) AS latest");
    // Sub-series list (~102) for the filter dropdown.
    const subSeriesList = await corpusRunQuery(env,
      "SELECT v FROM (SELECT DISTINCT sub_series AS v FROM frus_volumes " +
      "WHERE sub_series IS NOT NULL AND sub_series <> '') z ORDER BY v");
    // Classification list — small enum, 7 values. Order by count.
    const classifications = await corpusRunQuery(env,
      "SELECT classification AS v, count(*)::bigint AS n FROM frus_documents " +
      "WHERE classification IS NOT NULL AND classification <> '' " +
      "GROUP BY classification ORDER BY n DESC");
    const s = stats[0] || {};
    return json({
      document_count: s.document_count,
      volume_count: s.volume_count,
      volumes_with_docs: s.volumes_with_docs,
      earliest: s.earliest,
      latest: s.latest,
      sub_series: subSeriesList.map((r) => r.v),
      classifications: classifications.map((r) => ({ value: r.v, count: r.n }))
    }, 200);
  } catch (e) {
    return json({ error: { message: "FRUS facets fetch failed: " + e.message } }, 502);
  }
}

async function corpusFrusFilterHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const fields = (body && body.fields) || {};
  const where = buildFrusFilterWhere(fields);
  const idsSql = "SELECT id FROM frus_documents" + where;
  // Order by doc_date asc — chronological matches the historical-research
  // mental model (start at the beginning of the period, walk forward).
  const rowsSql = "SELECT " + FRUS_DISPLAY_COLS + " FROM frus_documents" + where +
    " ORDER BY doc_date ASC NULLS LAST, id ASC LIMIT 10000";
  let idRows, rows;
  try {
    idRows = await corpusRunQuery(env, idsSql);
    rows = await corpusRunQuery(env, rowsSql);
  } catch (e) {
    return json({ error: { message: "FRUS filter failed: " + e.message, code: "filter_failed" } }, 400);
  }
  const ids = idRows.map((r) => r.id).filter((x) => x != null);
  return json({
    ids,
    display_rows: rows,
    count: ids.length,
    generated_sql: rowsSql,
    executed_sql: idsSql
  }, 200);
}

/**
 * Single-document detail for the FRUS document panel. Includes the full
 * text_content plus the volume context (title, sub_series) via a JOIN
 * with frus_volumes — users coming in via FTS need to see which volume
 * the document came from to evaluate the historical context. The jsonb
 * fields (persons, glossary, footnotes) are returned as-is for the UI
 * to render; v1 alpha surfaces persons inline and defers glossary/
 * footnotes to a follow-up polish PR.
 */
async function corpusFrusDocumentHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }
  const sql = "SELECT d.id, d.volume_id, d.element_id, d.doc_number, d.title, " +
    "d.doc_date::text AS doc_date, d.doc_datetime_min::text AS doc_datetime_min, " +
    "d.doc_datetime_max::text AS doc_datetime_max, " +
    "d.place_name, d.source_note, d.classification, d.text_content, d.text_length, " +
    "d.persons, d.glossary, d.footnotes, d.source_url, " +
    "v.title AS volume_title, v.sub_series, v.volume_number, " +
    "v.content_date_min::text AS volume_content_date_min, " +
    "v.content_date_max::text AS volume_content_date_max " +
    "FROM frus_documents d LEFT JOIN frus_volumes v ON v.volume_id = d.volume_id " +
    "WHERE d.id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Document fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Document not found", code: "not_found" } }, 404);
  }
  return json({ document: rows[0] }, 200);
}

// ── items-by-ids endpoints (PR 4v) ──────────────────────────────────────────
// AMA synthesis returns a list of <doc>_ids; the result panel needs
// metadata-rich display rows for each, not "Doc #N" stubs (the v1 shortcut
// PR 4q–4t shipped). Each spoke gets its own items-by-ids handler that
// takes the id list and returns rows in caller-supplied order using the
// spoke's existing filter-display columns — so the AMA cited list and the
// manual-filter result list render identically.
//
// Brief #1 §4b auditability: rows that mention a document MUST carry a
// one-click path to the canonical primary source. The FRUS/OLC display-
// column expansions above (source_url, source_url_doj/source_url_knight)
// make that link available on every row this endpoint returns.

var ITEMS_BY_IDS_CAP = 25000;

/** Shared input validation. Filters to finite positive integers; rejects
 *  oversize lists. Empty input is valid and short-circuits to []. */
function parseItemsByIdsRequest(raw) {
  if (raw === undefined || raw === null) return { error: "Missing ids" };
  if (!Array.isArray(raw)) return { error: "ids must be an array" };
  if (raw.length > ITEMS_BY_IDS_CAP) {
    return { error: "ids array too large (max " + ITEMS_BY_IDS_CAP + ")" };
  }
  const ids = raw
    .filter((x) => x != null)
    .map(Number)
    .filter((x) => Number.isFinite(x) && x > 0)
    .map((x) => Math.floor(x));
  return { ids };
}

/** Build the items-by-ids SQL. Preserves caller order via array_position —
 *  the AMA planner's ranking is meaningful (chronological for FRUS, date-DESC
 *  for OLC, ts_rank for USC/CFR), and the cited list should mirror it. */
function buildItemsByIdsSql(displayCols, table, ids) {
  const arrayLiteral = "'{" + ids.join(",") + "}'::bigint[]";
  return "SELECT " + displayCols + " FROM " + table +
    " WHERE id IN (SELECT unnest(" + arrayLiteral + ")) " +
    "ORDER BY array_position(" + arrayLiteral + ", id)";
}

async function corpusUscItemsByIdsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const parsed = parseItemsByIdsRequest(body && body.ids);
  if (parsed.error) return json({ error: { message: parsed.error } }, 400);
  if (parsed.ids.length === 0) return json({ display_rows: [] }, 200);
  const sql = buildItemsByIdsSql(USC_DISPLAY_COLS, "usc_sections", parsed.ids);
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "USC items-by-ids failed: " + e.message } }, 502); }
  return json({ display_rows: rows }, 200);
}

async function corpusCfrItemsByIdsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const parsed = parseItemsByIdsRequest(body && body.ids);
  if (parsed.error) return json({ error: { message: parsed.error } }, 400);
  if (parsed.ids.length === 0) return json({ display_rows: [] }, 200);
  const sql = buildItemsByIdsSql(CFR_DISPLAY_COLS, "cfr_sections", parsed.ids);
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "CFR items-by-ids failed: " + e.message } }, 502); }
  return json({ display_rows: rows }, 200);
}

async function corpusOlcItemsByIdsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const parsed = parseItemsByIdsRequest(body && body.ids);
  if (parsed.error) return json({ error: { message: parsed.error } }, 400);
  if (parsed.ids.length === 0) return json({ display_rows: [] }, 200);
  const sql = buildItemsByIdsSql(OLC_DISPLAY_COLS, "olc_opinions", parsed.ids);
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "OLC items-by-ids failed: " + e.message } }, 502); }
  return json({ display_rows: rows }, 200);
}

async function corpusFrusItemsByIdsHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const parsed = parseItemsByIdsRequest(body && body.ids);
  if (parsed.error) return json({ error: { message: parsed.error } }, 400);
  if (parsed.ids.length === 0) return json({ display_rows: [] }, 200);
  const sql = buildItemsByIdsSql(FRUS_DISPLAY_COLS, "frus_documents", parsed.ids);
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "FRUS items-by-ids failed: " + e.message } }, 502); }
  return json({ display_rows: rows }, 200);
}

// ── FRUS AI modes (PR 4r) ───────────────────────────────────────────────────
// Brief #5 §3 names three flagships, asymmetric: C (narrative synthesis) is
// paradigmatic; A (documentary coverage) and B (specific document retrieval)
// are secondary; plus a B-analytical secondary (auditable counts). All four
// shapes are served by ONE claude_ama mode whose planner picks output_mode
// per question shape — the "no query-architecture buttons" principle. The
// "summarize this document" surface lives on the detail sheet, not in the
// mode selector.

// FRUS scope cap. The corpus is 314,483 documents — large enough that a
// loose filter could produce six-figure scopes. The executor inlines
// document_ids; over this cap the SQL becomes unwieldy and we refuse with
// a clear "narrow further" error.
var FRUS_SCOPE_LITERAL_LIMIT = 25000;

function normalizeFrusScope(s) {
  s = s || {};
  let ids = Array.isArray(s.document_ids)
    ? s.document_ids.filter((x) => x != null).map(Number).filter(Number.isFinite)
    : null;
  if (ids && ids.length === 0) ids = null;
  return {
    document_ids: ids,
    is_full_db: !ids,
    count: Number(s.count) || (ids ? ids.length : 0),
    description: typeof s.description === "string" && s.description.trim() ? s.description.trim() : ""
  };
}

var FRUS_AMA_SCHEMA_DOC = [
  "TABLE: frus_documents — one row per FRUS document (314,483 across 694 volumes; 1620 → 1991).",
  "  id (bigint, PK)                — document id; use this in citations.",
  "  volume_id (text)               — FK to frus_volumes; e.g. 'frus1958-60v15'.",
  "  doc_number (text)              — within-volume document number.",
  "  title (text)                   — document title; FTS-indexed.",
  "  doc_date (date)                — primary chronological axis; populated on ~99% of rows.",
  "  doc_datetime_min (date)        — start of date range when the document spans multiple dates (rare).",
  "  doc_datetime_max (date)        — end of date range.",
  "  place_name (text)              — where the document was sent from / written at (TEI-extracted).",
  "  source_note (text)             — original archival source note.",
  "  classification (text)          — original classification level: 'Secret' / 'Top Secret' / 'Confidential' / 'Limited Official Use' / 'Official Use Only' / 'Unclassified' / 'Restricted'.",
  "  text_content (text)            — full document text; LARGE for some documents (do not return raw in planned queries — pull title/date/place/classification and let synthesis cite).",
  "  text_length (int)              — character count.",
  "  persons (jsonb)                — TEI-extracted persons mentioned in the document. Shape: array of objects each with at minimum a 'name' string. Filter: persons @> '[{\"name\": \"Stalin\"}]'::jsonb or similar.",
  "  glossary (jsonb)               — TEI-extracted glossary terms.",
  "  footnotes (jsonb)              — original FRUS editorial footnotes; scholarship, not noise.",
  "  source_url (text)              — canonical history.state.gov URL.",
  "  fts (tsvector, generated)      — to_tsvector('english', title || ' ' || text_content) — use for topical search.",
  "",
  "TABLE: frus_volumes — one row per FRUS volume (694 total; 552 with docs + 142 forthcoming placeholders).",
  "  volume_id (text, PK)           — e.g. 'frus1958-60v15'.",
  "  title (text)                   — short volume title.",
  "  title_complete (text)          — fully-qualified title with administration + region (e.g. 'Foreign Relations of the United States, 1958–1960, South and Southeast Asia').",
  "  sub_series (text)              — major series grouping; ~100 distinct values.",
  "  volume_number (text)           — Roman or arabic numeral within the series.",
  "  publication_date (date)        — when State published this volume.",
  "  content_date_min (date)        — earliest document date in the volume.",
  "  content_date_max (date)        — latest document date in the volume.",
  "  editors (text)                 — volume editors.",
  "  doc_count (int)                — count of frus_documents rows with this volume_id (552 nonzero, 142 are forthcoming placeholders with doc_count=0).",
  "",
  "NOTES:",
  "- Topical/conceptual search: WHERE fts @@ websearch_to_tsquery('english', 'your search') — supports OR and quoted phrases.",
  "- Date axis is reliable. For era questions, filter by doc_date or date range.",
  "- Person search uses jsonb containment. To find docs mentioning Stalin: persons @> '[{\"name\": \"Stalin\"}]'::jsonb. To enumerate persons mentioned in a result set: SELECT p->>'name' FROM frus_documents, jsonb_array_elements(persons) AS p WHERE ... GROUP BY 1 ORDER BY count(*) DESC.",
  "- Place search uses ILIKE on place_name (free-text strings).",
  "- Classification is preserved verbatim — use it as historical-interest signal, not as a current security marking (these are 30+ years old).",
  "- Cite documents in prose with the full citation chain — 'FRUS 1958-1960, Vol. XV, Doc. 138 — Memcon Acheson/Lloyd, London, October 17, 1958 (SECRET)'. The user navigates to each cited document via the Cited Documents list that renders below the narrative; do NOT embed any internal id markers in the prose.",
  "- COVERAGE/EXISTENCE QUESTIONS ('Has the US ever...'). For 'no' answers especially, surface the SEARCH DATASET in candor_notes so the user can interrogate the formulation ('Searched fts for X OR Y OR Z; returned 0 matches across 314K documents.').",
  "- ANALYTICAL COUNTS. Surface the denominator (e.g. 'Of 314,483 documents, 437 mention Stalin between 1948 and 1955') in candor_notes.",
  "- Read-only: only SELECT statements are accepted; cap planned queries at LIMIT 500 (text_content is large; bigger pulls blow up synthesis input)."
].join("\n");

function buildFrusPlanningSystem() {
  return [
    "You are the planner for an agentic narrative-synthesis tool over the FRUS (Foreign Relations of the United States) corpus — the State Department's official documentary history of U.S. foreign policy: diplomatic cables, memoranda of conversation, briefing papers, presidential decision memos, intelligence assessments, exchanges with foreign governments. Politically charged terrain at times (covert operations, regime-change involvement); never editorialize.",
    "",
    "You have access to a Postgres database (read-only) via SELECT queries. Schema:",
    "",
    FRUS_AMA_SCHEMA_DOC,
    "",
    "Output a single JSON object with these keys (no prose, no code fences):",
    "{",
    '  "output_mode": "list" | "narrative" | "hybrid",',
    "       // list = the question wants a refined set of documents (Flagship B: specific document retrieval).",
    "       // narrative = the question wants a prose answer (Flagship C: narrative synthesis — paradigmatic).",
    "       // hybrid = both — synthesized answer + refined document list (Flagship A: coverage/existence with supporting docs).",
    '  "approach_summary": "2-4 sentence plan, plain prose, no markdown headers",',
    '  "candor_notes": ["caveats — the search dataset for coverage answers, denominator for analytical counts, dates the planner had to guess at, persons / places that proved ambiguous"],',
    '  "queries": [',
    '    {"label": "what this query gathers", "sql": "SELECT ... FROM frus_documents WHERE ... LIMIT 500"},',
    "    ...",
    "  ],",
    '  "estimated_cost_cents": <integer>,',
    "       // your estimate of the synthesis call cost in cents (the planning call is already paid).",
    "       // Synthesis input ≈ all query results in JSON; output ≈ 800-2000 tokens.",
    "       // Anthropic Sonnet pricing × 1.35 markup is roughly: input 0.4¢/1K tokens, output 2¢/1K tokens.",
    '  "wants_synthesis": true',
    "}",
    "",
    "Rules:",
    "- Question shape → output_mode mapping (the three flagships are recognized internally, not as separate UI modes):",
    "    * 'Tell me about [event/era/person/policy]' → output_mode='narrative'. Pull documents chronologically; synthesis writes prose.",
    "    * 'Has the U.S. ever [X]' / 'Did [administration] do [X]' → output_mode='hybrid'. Search for evidence; synthesis writes a yes/no verdict + supporting documents list.",
    "    * 'Show me [docs about X]' / 'Find the cables on [Y]' → output_mode='list'. Retrieval; synthesis narrows.",
    "    * 'How many documents / which administration most / what year produced' → output_mode='narrative' with analytical answer + denominator in candor_notes.",
    "- PULL METADATA, NOT TEXT. Planned queries should select id, title, doc_date, place_name, classification, volume_id, doc_number, persons — NEVER text_content. Synthesis works from metadata; the user reads full text via the detail sheet.",
    "- CHRONOLOGICAL ORDER. For narrative questions, ORDER BY doc_date ASC. The synthesis renders chronologically by default.",
    "- CAP QUERIES at LIMIT 500. The corpus is large; bigger pulls blow up synthesis input.",
    "- USE THE VOLUMES TABLE as scope hint. If the question targets a known volume (era + region), the volume_id filter is faster than FTS. 'Eisenhower Suez' → look for volumes with content_date around 1956-1957 + 'Suez' or 'Near East' in title_complete.",
    "- PERSON QUERIES. Use jsonb containment: persons @> '[{\"name\": \"Stalin\"}]'::jsonb. Names can be partial — fall back to text search on text_content if the jsonb lookup returns nothing.",
    "- KEYWORD UNDERPERFORMS — FAN OUT WITH OR GENEROUSLY. The user's phrasing is often NOT the diplomatic record's phrasing. Specific failure modes:",
    "    * **Event/place names.** User says 'the Suez Crisis'; the cables say 'situation in the Middle East', 'Egyptian nationalization of the Canal', 'tripartite intervention', 'Eden government'. Fan: '(\"Suez\" OR \"Egypt\" OR \"Canal\" OR \"Middle East\") AND (1956 OR 1957)'. Anchor with the date range when known.",
    "    * **Country/region name variants.** 'Iran' (1953-) ↔ 'Persia' (pre-1935). 'Burma' ↔ 'Myanmar'. 'Soviet Union' ↔ 'USSR' ↔ 'Russia'. 'PRC' ↔ 'Communist China' ↔ 'Peking' ↔ 'Beijing'. The diplomatic record's vocabulary reflects the era. Fan all plausible variants for the period in question.",
    "    * **Person names.** Use persons jsonb containment first; if zero hits, FTS the surname AND any common given-name short form. 'Kennan' alone often suffices; 'McGeorge Bundy' should fan to '(\"McGeorge Bundy\" OR \"Mac Bundy\" OR \"Bundy\")'.",
    "    * **Policy/concept terms.** 'Containment' as State Department phrasing predates the popular term. 'Détente' often appears as 'easing of tensions' or 'modus vivendi' in cables. Fan to common period synonyms.",
    "  WORKED EXAMPLE — *'history of US embassy in Israel'*: don't just FTS 'embassy in Israel'. The cables discuss this under terms like 'Jerusalem', 'Tel Aviv', 'recognition', 'capital', 'consulate'. Fan: doc_date BETWEEN '1948-01-01' AND '2017-12-31' AND fts ~ '(\"Jerusalem\" OR \"Tel Aviv\" OR \"embassy\" OR \"recognition of Israel\") AND (capital OR \"Holy City\" OR consulate OR mission)'. Most reliable for FRUS: scope first by relevant volumes (volume_id IN (SELECT volume_id FROM frus_volumes WHERE content_date_min ≥ '1948' AND title_complete ILIKE '%Israel%'))) and THEN FTS within scope.",
    "- COVERAGE/EXISTENCE. For 'has the US ever' questions, include the SEARCH DATASET (the FTS terms you tried) in candor_notes regardless of whether anything matched — for 'no' answers, this is required content.",
    "- ANALYTICAL COUNTS. Always include the denominator (corpus size or the relevant subset) in candor_notes.",
    "- NARRATIVE DISCIPLINE. For output_mode='narrative' or 'hybrid', prefer 2–4 queries, NOT 6+. Synthesis has a finite output-token budget (currently 8000 for narrative); too many queries inflate the synthesis input and risk truncation mid-answer. A single well-fanned query with strong OR coverage is better than five literal-term queries.",
    "- WHEN THE CURRENT SCOPE IS NARROWED (document_ids list provided): use the name \"scoped_frus_documents\" instead of \"frus_documents\". The runner substitutes this with an inline subquery filtered to the scope. CRITICAL: reference this name ONLY after FROM or JOIN keywords, and DO NOT alias it. Write \"FROM scoped_frus_documents WHERE classification = 'Secret'\" (good), not \"FROM scoped_frus_documents d WHERE ...\" (will break). WHEN SCOPE IS THE FULL CORPUS: use \"frus_documents\".",
    LEGAL_ADVICE_PLANNER_RULE,
    "- Output strict JSON only. No markdown. No code fences. No prose outside the object."
  ].join("\n");
}

function buildFrusPlanningUser(question, scope) {
  return [
    "USER QUESTION:",
    question,
    "",
    "CURRENT SCOPE:",
    scope.description || (scope.is_full_db
      ? "The full corpus — all 314,483 FRUS documents across 694 volumes (1620 → 1991)."
      : fmtIntJs(scope.count) + " documents (narrowed)."),
    scope.is_full_db
      ? "(no document_id constraint — your queries run against the full corpus; use the table names \"frus_documents\" and \"frus_volumes\")"
      : "(narrowed to " + fmtIntJs(scope.count) + " document_ids; the runner will substitute scoped_frus_documents with an inline subquery filtered to the scope — use THAT name in your queries. frus_volumes is still available unaltered.)",
    "",
    "Return the JSON plan now."
  ].join("\n");
}

function parseFrusPlan(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    const firstObj = extractFirstJsonObject(cleaned);
    if (firstObj) {
      try { v = JSON.parse(firstObj); }
      catch (pe2) { throw new Error("JSON.parse error: " + pe2.message); }
    } else {
      throw new Error("could not find a JSON object in the response.");
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (["list", "narrative", "hybrid"].indexOf(v.output_mode) < 0) throw new Error("output_mode must be list, narrative, or hybrid.");
  if (!Array.isArray(v.queries)) throw new Error("queries must be an array.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  v.estimated_cost_cents = Math.max(0, Math.round(Number(v.estimated_cost_cents) || 0));
  v.approach_summary = String(v.approach_summary || "").trim();
  return v;
}

async function executeFrusPlan(env, plan, scope) {
  let scopedBody = null;
  if (scope.document_ids && scope.document_ids.length > 0) {
    if (scope.document_ids.length > FRUS_SCOPE_LITERAL_LIMIT) {
      throw new Error("Scope is " + fmtIntJs(scope.document_ids.length) + " documents — too large to inline (cap " + fmtIntJs(FRUS_SCOPE_LITERAL_LIMIT) + "). Narrow further with the filter before running narrative synthesis.");
    }
    const idsSubquery = "SELECT unnest('{" + scope.document_ids.join(",") + "}'::bigint[]) AS id";
    scopedBody = "(SELECT d.* FROM frus_documents d WHERE d.id IN (" + idsSubquery + "))";
  }

  const results = [];
  for (let i = 0; i < plan.queries.length; i++) {
    const q = plan.queries[i];
    let sql = String(q.sql || "").trim().replace(/;\s*$/, "").trim();
    if (!sql) continue;
    let execSql = sql;
    if (scopedBody) {
      execSql = substituteScoped(execSql, "scoped_frus_documents", scopedBody);
    }
    if (!/^\s*SELECT\b/i.test(execSql)) execSql = "SELECT * FROM (" + execSql + ") AS frus_q";
    let rows;
    try { rows = await withStatementTimeoutRetry(() => corpusRunQuery(env, execSql)); }
    catch (err) { throw new Error('Query "' + (q.label || ("query " + (i + 1))) + '" failed: ' + err.message); }
    const truncated = (rows.length > 500) ? rows.slice(0, 500) : rows;
    results.push({ label: q.label || ("query " + (i + 1)), sql, rows: truncated, total_rows: rows.length, was_truncated: rows.length > 500 });
  }
  return results;
}

function buildFrusSynthesisSystem(outputMode) {
  const listClause = (outputMode === "list" || outputMode === "hybrid")
    ? '"document_ids": [<bigint>, ...]   // the document ids the user should see; pulled from your query results.'
    : '"document_ids": null';
  return [
    "You are the synthesis step for an agentic narrative-synthesis tool over the FRUS (Foreign Relations of the United States) corpus — the State Department's official documentary history of U.S. foreign policy. The planner has run the SQL queries you proposed; you now have the question, the plan, and the query results. Write the user-facing answer.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "answer_markdown": "...",  // markdown narrative; cite documents in prose with the FULL FRUS citation chain (volume + doc_number + title + date + place + classification). DO NOT embed internal id tokens.',
    "  " + listClause + ",",
    '  "candor_notes": ["any caveats discovered during synthesis"]',
    "}",
    "",
    "Rules:",
    "- CHRONOLOGICAL by default for narrative output. Order events by date; surface transitions explicitly ('In May 1961…', 'Three months later…').",
    "- ATTRIBUTION-FORWARD. Name persons explicitly when the document attribution is clear (who said what to whom, when). The persons jsonb field gives you this for free where TEI extraction succeeded.",
    "- CITE EVERY CLAIM via the FULL FRUS chain in PROSE — 'FRUS 1958-1960, Vol. XV, Doc. 138 (Memcon Acheson/Lloyd, London, October 17, 1958, SECRET)' or naturally folded in: 'A May 14, 1961 cable from London marked SECRET (FRUS 1961-1963, Vol. XII, Doc. 47) reports that...'. The user navigates to each cited document via the Cited Documents list that renders below the narrative; do NOT embed [frus-ref:N] tokens or any other internal id markers. Bad: '...cable from London [frus-ref:12345] reports...'. Good: '...cable from London (FRUS 1961-1963, Vol. XII, Doc. 47) reports...'.",
    "- CLASSIFICATION IS HISTORICAL-INTEREST SIGNAL. When citing a document, surface its original classification level when it's interesting (e.g., a document marked TOP SECRET at the time, or — for the inverse signal — a document marked UNCLASSIFIED on a sensitive topic).",
    "- COVERAGE/EXISTENCE answers (output_mode = hybrid in response to 'has the US ever' questions): lead with a clean yes/no verdict; back it with the document list. For 'no' answers, the search dataset (which FTS terms / date ranges / classification filters the planner tried) MUST be surfaced in candor_notes so the user can interrogate the formulation.",
    "- ANALYTICAL answers (output_mode = narrative for counting questions): surface the denominator and the methodology explicitly. 'Of 314,483 documents in the corpus, 437 mention Stalin between 1948 and 1955' — never just '437 documents mention Stalin'.",
    "- ZERO-RESULT HONESTY. When the query results are empty (or near-empty) for what should be a non-trivial question, the answer_markdown MUST: (1) name the FTS terms and date ranges tried in prose, (2) acknowledge this may be a recall failure — explain that the diplomatic record's vocabulary reflects the era (country names change, terminology evolves, agencies are named differently) and may not match the question's modern phrasing, and (3) suggest one or two reformulations (period-appropriate terminology, alternative spellings, broader date range). DO NOT just say 'no results found' — that's opaque about whether the corpus is genuinely silent or the query phrasing missed.",
    "- DO NOT EDITORIALIZE on contested historical interpretations. FRUS terrain includes covert operations, regime-change involvement, contested intelligence judgments — describe and cite, never opine.",
    "- For list and hybrid output_modes, document_ids must be a non-empty array of bigints drawn from your query results. If your queries did not return identifiable documents, downgrade to narrative mode and explain.",
    "- Be tight. Keep candor_notes for caveats. The user wants the answer, not a methodology essay.",
    "- Output strict JSON only. No markdown outside answer_markdown. No code fences.",
    '- CRITICAL: inside answer_markdown, do NOT use straight double quotes (") — they break JSON parsing when not escaped. Use curly quotes ("") for direct quotation, or single quotes (\'\' or \') for short inline quotation. Apostrophes (\') are fine. If you absolutely must use a straight double quote, escape it as \\".'
  ].join("\n");
}

function buildFrusSynthesisUser(question, plan, results) {
  const resultsForModel = results.map(function (r) {
    return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated, rows: r.rows };
  });
  return [
    "USER QUESTION:",
    question,
    "",
    "YOUR PLAN (from the planning step):",
    plan.approach_summary,
    "",
    "PLANNED OUTPUT MODE: " + plan.output_mode,
    "",
    "CANDOR NOTES FROM PLANNING:",
    (plan.candor_notes && plan.candor_notes.length) ? plan.candor_notes.map(function (n) { return "- " + n; }).join("\n") : "(none)",
    "",
    "QUERY RESULTS (JSON):",
    JSON.stringify(resultsForModel, null, 2),
    "",
    "Return the synthesis JSON now."
  ].join("\n");
}

function parseFrusSynthesis(raw, outputMode) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
          catch (pe4) {
            const salvaged = salvageTruncatedSynthesis(raw);
            if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "document_ids");
            throw new Error("JSON.parse error: " + pe4.message);
          }
        }
      } else {
        const salvaged = salvageTruncatedSynthesis(raw);
        if (salvaged) return buildSalvagedSynthesis(salvaged, outputMode, "document_ids");
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.answer_markdown !== "string" || !v.answer_markdown.trim()) throw new Error("answer_markdown is empty.");
  if (outputMode === "list" || outputMode === "hybrid") {
    if (!Array.isArray(v.document_ids) || v.document_ids.length === 0) {
      v.document_ids = [];
      v.candor_notes = (v.candor_notes || []).concat(["Output mode requested a document list but synthesis returned none — showing narrative only."]);
    } else {
      v.document_ids = v.document_ids
        .filter(function (x) { return x != null; })
        .map(function (x) { return Number(x); })
        .filter(function (x) { return Number.isFinite(x); });
    }
  } else {
    v.document_ids = null;
  }
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusFrusPlanHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const question = String((body && body.question) || "").trim();
  if (!question) return json({ error: { message: "Missing question" } }, 400);
  const scope = normalizeFrusScope(body && body.scope);

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildFrusPlanningSystem(),
      messages: [{ role: "user", content: buildFrusPlanningUser(question, scope) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Planning step: " + e.message, code: e.code } }, e.status || 502);
  }
  let plan;
  try { plan = parseFrusPlan(res.text); }
  catch (e) { return json({ error: { message: "Could not parse plan: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  const token = crypto.randomUUID();
  await env.QUOTA.put("frus-plan:" + token, JSON.stringify({
    plan, scope, question, provider, model, userId: auth.userId, authMode: auth.authMode
  }), { expirationTtl: 900 });

  return json({
    token,
    output_mode: plan.output_mode,
    approach_summary: plan.approach_summary,
    candor_notes: plan.candor_notes,
    queries: plan.queries.map(function (q) { return { label: q.label, sql: q.sql }; }),
    estimated_cost_cents: plan.estimated_cost_cents,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

async function corpusFrusExecuteHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const token = body && body.token;
  if (!token || typeof token !== "string") return json({ error: { message: "Missing plan token" } }, 400);
  const stored = await env.QUOTA.get("frus-plan:" + token);
  if (!stored) return json({ error: { message: "Plan expired or not found — re-run the question.", code: "plan_expired" } }, 410);
  let blob;
  try { blob = JSON.parse(stored); } catch { return json({ error: { message: "Stored plan is corrupt — re-run the question." } }, 500); }

  const auth = await resolveCorpusAuth(request, env, ctx, blob.provider, body);
  if (auth instanceof Response) return auth;
  if (blob.authMode === "paid" && (auth.authMode !== "paid" || auth.userId !== blob.userId)) {
    return json({ error: { message: "This plan belongs to a different session. Re-run the question." } }, 403);
  }
  ctx.waitUntil(env.QUOTA.delete("frus-plan:" + token));

  let results;
  try { results = await executeFrusPlan(env, blob.plan, blob.scope); }
  catch (e) { return json({ error: { message: e.message, code: "execute_failed" } }, 400); }

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider: blob.provider, model: blob.model,
      system: buildFrusSynthesisSystem(blob.plan.output_mode),
      messages: [{ role: "user", content: buildFrusSynthesisUser(blob.question, blob.plan, results) }],
      max_tokens: blob.plan.output_mode === "narrative" ? 8000 : 6000
    });
  } catch (e) {
    return json({ error: { message: "Synthesis step: " + e.message, code: e.code } }, e.status || 502);
  }
  let synth;
  try { synth = parseFrusSynthesis(res.text, blob.plan.output_mode); }
  catch (e) { return json({ error: { message: "Could not parse synthesis: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    answer_markdown: synth.answer_markdown,
    document_ids: synth.document_ids,
    candor_notes: synth.candor_notes,
    output_mode: blob.plan.output_mode,
    query_summary: results.map(function (r) { return { label: r.label, total_rows: r.total_rows, was_truncated: r.was_truncated }; }),
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// ── FRUS: summarize one document ────────────────────────────────────────────
// Mirrors OLC summarize-opinion. FRUS-specific: provenance includes volume
// metadata + classification + place; the summary structure leans on
// diplomatic-document conventions (setting / substance / persons /
// footnotes-as-scholarship) rather than OLC's question-presented /
// conclusion / reasoning headings.

var FRUS_SUMMARIZE_TEXT_CAP = 150000; // chars (~37K tokens); FRUS docs are mostly shorter than OLC opinions.

function buildFrusSummarizeSystem() {
  return [
    "You are summarizing one FRUS (Foreign Relations of the United States) document for a researcher. FRUS documents are the State Department's working diplomatic record — cables, memoranda, briefing papers, conversation memcons. Your job: attribution-forward summary, never editorialize on contested historical interpretations.",
    "",
    "Output a single JSON object (no prose, no code fences) with these keys:",
    "{",
    '  "summary_markdown": "...",  // markdown summary, 3-8 short paragraphs.',
    '  "candor_notes": ["caveats — truncation, missing date, ambiguous attribution, scanned-but-unclear passages"]',
    "}",
    "",
    "Structure the summary_markdown around these headings (omit any that don't apply):",
    "- **Provenance** — the document's place in the diplomatic record (sender, recipient, place, date, classification at the time).",
    "- **Setting** — what was happening around the document (the moment it intervenes in, in 1-2 sentences). Stay grounded in the document itself; don't import outside historical context.",
    "- **Substance** — what the document says, in its own framing. The bulk of the summary.",
    "- **Key persons** — named individuals whose views or actions the document attributes (only those the document itself names).",
    "- **Notable footnotes / glossary** — when the original FRUS editorial footnotes carry historical context that materially aids understanding, briefly mention them (these are scholarship, not noise).",
    "",
    "Rules:",
    "- Describe what the document says. Do not say whether the U.S. was right or wrong; do not add modern context.",
    "- Quote sparingly; use curly quotes (“”) for direct quotation. Straight double quotes break JSON parsing.",
    "- If the text appears garbled (rare; FRUS texts are generally clean), surface that in candor_notes.",
    "- If the text was truncated before reaching you, note that in candor_notes (\"Summary based on the first N characters of the document; later sections not seen.\").",
    "- Surface classification explicitly when it's interesting (e.g., \"Marked SECRET at the time.\").",
    "- Output strict JSON only. No markdown outside summary_markdown. No code fences."
  ].join("\n");
}

function buildFrusSummarizeUser(doc, wasTruncated) {
  const parts = [
    "DOCUMENT METADATA:",
    "- Title: " + (doc.title || "(no title)"),
    "- Date: " + (doc.doc_date || "(no date)"),
    "- Place: " + (doc.place_name || "(no place)"),
    "- Classification: " + (doc.classification || "(not specified)"),
    "- Volume: " + (doc.volume_title || doc.volume_id || "(no volume)"),
    "- Document number in volume: " + (doc.doc_number || "(no number)")
  ];
  if (doc.persons && Array.isArray(doc.persons) && doc.persons.length > 0) {
    const names = doc.persons.map(function (p) { return (p && p.name) ? p.name : null; }).filter(Boolean);
    if (names.length > 0) {
      parts.push("- Persons (TEI-extracted): " + names.slice(0, 40).join(", ") + (names.length > 40 ? " (+" + (names.length - 40) + " more)" : ""));
    }
  }
  parts.push("");
  parts.push("DOCUMENT TEXT" + (wasTruncated ? " (TRUNCATED to " + fmtIntJs(FRUS_SUMMARIZE_TEXT_CAP) + " characters — flag this in candor_notes):" : ":"));
  const text = String(doc.text_content || "");
  parts.push(wasTruncated ? text.slice(0, FRUS_SUMMARIZE_TEXT_CAP) : text);
  if (doc.footnotes) {
    try {
      const fn = typeof doc.footnotes === "string" ? JSON.parse(doc.footnotes) : doc.footnotes;
      if (Array.isArray(fn) && fn.length > 0) {
        parts.push("");
        parts.push("ORIGINAL FRUS EDITORIAL FOOTNOTES (JSON, scholarship):");
        parts.push(JSON.stringify(fn).slice(0, 20000));
      }
    } catch { /* ignore parse errors; footnotes is optional content */ }
  }
  parts.push("");
  parts.push("Return the summary JSON now.");
  return parts.join("\n");
}

function parseFrusSummary(raw) {
  const cleaned = String(raw).replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let v;
  try { v = JSON.parse(cleaned); }
  catch (pe) {
    try {
      // Reuse the answer_markdown quote-repair, retargeted at summary_markdown.
      const repaired = cleaned.replace(/"answer_markdown"/g, '"summary_markdown"');
      const rep2 = repairAnswerMarkdownQuotes(repaired.replace(/"summary_markdown"/g, '"answer_markdown"'))
        .replace(/"answer_markdown"/g, '"summary_markdown"');
      v = JSON.parse(rep2);
    } catch (pe2) {
      const firstObj = extractFirstJsonObject(cleaned);
      if (firstObj) {
        try { v = JSON.parse(firstObj); }
        catch (pe3) { throw new Error("JSON.parse error: " + pe3.message); }
      } else {
        throw new Error("could not find a JSON object.");
      }
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("top-level value is not an object.");
  if (typeof v.summary_markdown !== "string" || !v.summary_markdown.trim()) throw new Error("summary_markdown is empty.");
  v.candor_notes = Array.isArray(v.candor_notes) ? v.candor_notes : [];
  return v;
}

async function corpusFrusSummarizeHandler(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const provider = (body && body.provider) || "anthropic";
  if (!PROVIDERS[provider]) return json({ error: { message: "Invalid or missing provider" } }, 400);
  const model = body && body.model;
  if (!model || typeof model !== "string") return json({ error: { message: "Missing or invalid model" } }, 400);
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ error: { message: "Missing or invalid id" } }, 400);
  }

  const auth = await resolveCorpusAuth(request, env, ctx, provider, body);
  if (auth instanceof Response) return auth;

  // Same SELECT shape as /corpus/frus/document so we hand the model the
  // same context the UI shows the user.
  const sql = "SELECT d.id, d.volume_id, d.doc_number, d.title, " +
    "d.doc_date::text AS doc_date, d.place_name, d.classification, " +
    "d.text_content, d.persons, d.footnotes, " +
    "v.title AS volume_title " +
    "FROM frus_documents d LEFT JOIN frus_volumes v ON v.volume_id = d.volume_id " +
    "WHERE d.id = " + Math.floor(id) + " LIMIT 1";
  let rows;
  try { rows = await corpusRunQuery(env, sql); }
  catch (e) { return json({ error: { message: "Document fetch failed: " + e.message } }, 502); }
  if (!rows || rows.length === 0) {
    return json({ error: { message: "Document not found", code: "not_found" } }, 404);
  }
  const doc = rows[0];
  const text = String(doc.text_content || "");
  if (!text.trim()) {
    return json({ error: { message: "This document has no text content to summarize.", code: "no_text" } }, 400);
  }
  const wasTruncated = text.length > FRUS_SUMMARIZE_TEXT_CAP;

  let res;
  try {
    res = await corpusModelCall(env, ctx, auth, {
      provider, model,
      system: buildFrusSummarizeSystem(),
      messages: [{ role: "user", content: buildFrusSummarizeUser(doc, wasTruncated) }],
      max_tokens: 4000
    });
  } catch (e) {
    return json({ error: { message: "Summarize step: " + e.message, code: e.code } }, e.status || 502);
  }
  let parsed;
  try { parsed = parseFrusSummary(res.text); }
  catch (e) { return json({ error: { message: "Could not parse summary: " + e.message, raw: String(res.text).slice(0, 600) } }, 502); }

  return json({
    summary_markdown: parsed.summary_markdown,
    candor_notes: parsed.candor_notes,
    was_truncated: wasTruncated,
    _cost_cents: res.costCents,
    _balance_cents: res.balanceCents
  }, 200);
}

// Docket entries for one case (the case-detail view).
// ── Hub cross-corpus keyword search (PR 4u) ────────────────────────────────
// Brief #1's free demo moment. Five parallel FTS queries (one per corpus)
// returning a top-K display set + total count per corpus. No LLM; no auth.
// Each corpus's relevance scores aren't comparable across tables — so
// results are grouped by corpus (brief #1 §4b decision) rather than
// merged into one ranked list. That changes when pgvector lands (Phase 2)
// and provides a single comparable similarity score.

var HUB_CORPORA = ["litigation", "usc", "cfr", "olc", "frus", "lawfare"];
// Per-corpus top-K cap. The brief says the hub is "the shallow end" — five
// results per card surface the result-set shape without overwhelming. Users
// who want more click into the spoke.
var HUB_RESULTS_PER_CORPUS = 5;

// Per-corpus query builders. Each returns { rowsSql, countSql }. The hub
// handler runs all of them in parallel via Promise.all. Display-row shape
// is normalized: { id (bigint), title (string), context (string|null —
// secondary line shown below the title), date (string|null — YYYY-MM-DD
// where applicable) }.
function buildHubQueriesLitigation(escapedQuery, limit) {
  // Litigation's FTS spine is docket_entries.fts (per the existing filter
  // builder); the topical workhorse. Display from cases. Count is distinct
  // cl_ids matching the FTS — the meaningful "how many cases mention this"
  // signal for hub users.
  const ftsClause = "fts @@ websearch_to_tsquery('english', '" + escapedQuery + "')";
  const rowsSql =
    "SELECT c.cl_id::text AS id, " +
    "  COALESCE(c.case_name, '(no name)') AS title, " +
    "  c.court AS context, " +
    "  c.date_filed::text AS date " +
    "FROM cases c " +
    "WHERE c.cl_id IN (" +
    "  SELECT DISTINCT cl_id FROM docket_entries WHERE " + ftsClause +
    "  LIMIT 10000" +
    ") " +
    "ORDER BY c.date_filed DESC NULLS LAST " +
    "LIMIT " + limit;
  const countSql =
    "SELECT count(DISTINCT cl_id)::bigint AS n FROM docket_entries WHERE " + ftsClause;
  return { rowsSql, countSql };
}

function buildHubQueriesUsc(escapedQuery, limit) {
  const ftsClause = "fts @@ websearch_to_tsquery('english', '" + escapedQuery + "')";
  const tsRank = "ts_rank(fts, websearch_to_tsquery('english', '" + escapedQuery + "'))";
  const rowsSql =
    "SELECT id::text AS id, " +
    "  COALESCE(citation, heading, '(no title)') AS title, " +
    "  COALESCE(heading, title_name) AS context, " +
    "  NULL::text AS date " +
    "FROM usc_sections WHERE " + ftsClause + " " +
    "ORDER BY " + tsRank + " DESC LIMIT " + limit;
  const countSql = "SELECT count(*)::bigint AS n FROM usc_sections WHERE " + ftsClause;
  return { rowsSql, countSql };
}

function buildHubQueriesCfr(escapedQuery, limit) {
  // Exclude reserved placeholders from hub results — they have no operative
  // text and would be noise. The count also excludes them so the displayed
  // "47 in CFR" is "47 substantive sections," matching what the user sees.
  const ftsClause = "fts @@ websearch_to_tsquery('english', '" + escapedQuery + "')";
  const where = "WHERE NOT reserved AND " + ftsClause;
  const tsRank = "ts_rank(fts, websearch_to_tsquery('english', '" + escapedQuery + "'))";
  const rowsSql =
    "SELECT id::text AS id, " +
    "  COALESCE(citation, heading, '(no title)') AS title, " +
    "  COALESCE(heading, title_name) AS context, " +
    "  up_to_date_as_of::text AS date " +
    "FROM cfr_sections " + where + " " +
    "ORDER BY " + tsRank + " DESC LIMIT " + limit;
  const countSql = "SELECT count(*)::bigint AS n FROM cfr_sections " + where;
  return { rowsSql, countSql };
}

function buildHubQueriesOlc(escapedQuery, limit) {
  const ftsClause = "fts @@ websearch_to_tsquery('english', '" + escapedQuery + "')";
  const rowsSql =
    "SELECT id::text AS id, " +
    "  COALESCE(title, '(no title)') AS title, " +
    "  source AS context, " +
    "  date_issued::text AS date " +
    "FROM olc_opinions WHERE " + ftsClause + " " +
    "ORDER BY date_issued DESC NULLS LAST LIMIT " + limit;
  const countSql = "SELECT count(*)::bigint AS n FROM olc_opinions WHERE " + ftsClause;
  return { rowsSql, countSql };
}

function buildHubQueriesFrus(escapedQuery, limit) {
  const ftsClause = "fts @@ websearch_to_tsquery('english', '" + escapedQuery + "')";
  const rowsSql =
    "SELECT id::text AS id, " +
    "  COALESCE(title, '(no title)') AS title, " +
    "  COALESCE(place_name, volume_id) AS context, " +
    "  doc_date::text AS date " +
    "FROM frus_documents WHERE " + ftsClause + " " +
    // FRUS doc_date is ASC by default in the spoke (chronological); the hub
    // surfaces most-recent-first to match the other spokes' header rule of
    // thumb. The full FRUS-internal chronological browse lives on the spoke.
    "ORDER BY doc_date DESC NULLS LAST LIMIT " + limit;
  const countSql = "SELECT count(*)::bigint AS n FROM frus_documents WHERE " + ftsClause;
  return { rowsSql, countSql };
}

function buildHubQueriesLawfare(escapedQuery, limit) {
  // Match the spoke's default scope: exclude suppressed roundup digests so the
  // hub surfaces only original authored pieces (brief #5 / the Lawfare filter).
  const ftsClause =
    "fts @@ websearch_to_tsquery('english', '" + escapedQuery + "') " +
    "AND search_tier <> 'suppressed'";
  const rowsSql =
    "SELECT id::text AS id, " +
    "  COALESCE(title, '(untitled)') AS title, " +
    "  content_type AS context, " +
    "  published_date::text AS date " +
    "FROM lawfare_documents WHERE " + ftsClause + " " +
    "ORDER BY published_date DESC NULLS LAST LIMIT " + limit;
  const countSql = "SELECT count(*)::bigint AS n FROM lawfare_documents WHERE " + ftsClause;
  return { rowsSql, countSql };
}

var HUB_QUERY_BUILDERS = {
  litigation: buildHubQueriesLitigation,
  usc: buildHubQueriesUsc,
  cfr: buildHubQueriesCfr,
  olc: buildHubQueriesOlc,
  frus: buildHubQueriesFrus,
  lawfare: buildHubQueriesLawfare
};

async function runHubKeywordForCorpus(env, corpus, escapedQuery, limit) {
  const builder = HUB_QUERY_BUILDERS[corpus];
  if (!builder) throw new Error("Unknown corpus: " + corpus);
  const { rowsSql, countSql } = builder(escapedQuery, limit);
  // Run rows + count in parallel; both share the same FTS GIN scan.
  const [rows, countRows] = await Promise.all([
    corpusRunQuery(env, rowsSql),
    corpusRunQuery(env, countSql)
  ]);
  return {
    count: Number((countRows[0] && countRows[0].n) || 0),
    results: rows.map(function (r) {
      return {
        id: r.id,
        title: r.title || "(no title)",
        context: r.context || null,
        date: r.date || null
      };
    })
  };
}

// Run fn over items with at most `limit` running at once, preserving order.
// Used to throttle the hub's per-corpus FTS fan-out: parallel (5-at-once) puts
// 5×N CPU-heavy queries on the 2-core DB under N concurrent searches and tips
// it past its contention cliff. Serializing (limit 1) or near-serializing
// (limit 2) trades ~1s of single-search latency for not collapsing under load
// (load-test fix #4). Tunable via HUB_FANOUT_CONCURRENCY (default 2).
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

function hubFanoutConcurrency(env) {
  const n = parseInt((env && env.HUB_FANOUT_CONCURRENCY) || "2", 10);
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

async function corpusHubKeywordHandler(request, env, ctx) {
  const rl = await checkIpRateLimit(request, env, ctx);
  if (rl) return rl;
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const query = String((body && body.query) || "").trim();
  if (!query) return json({ error: { message: "Missing query" } }, 400);
  if (query.length > 200) {
    return json({ error: { message: "Query too long (max 200 characters)" } }, 400);
  }

  // Per brief #1, all corpora are on by default. The caller can pass a
  // subset to narrow ("just OLC + litigation"); empty/missing = all five.
  const requested = Array.isArray(body && body.corpora)
    ? body.corpora.filter(function (c) { return HUB_CORPORA.indexOf(c) >= 0; })
    : null;
  const corpora = (requested && requested.length > 0) ? requested : HUB_CORPORA.slice();

  const escapedQuery = escSqlLit(query);

  // Run the per-corpus FTS with bounded concurrency (fix #4) instead of all 5
  // at once — keeps a burst of searches from over-subscribing the 2-core DB.
  // Per-corpus failures don't fail the whole request — the user sees grouped
  // results for the corpora that returned plus an inline error chip for the
  // one that didn't (the brief's "result-set characterization" tone).
  const limit = hubFanoutConcurrency(env);
  const t0 = Date.now();
  let slowest = null, slowestMs = -1;
  const settled = await mapWithConcurrency(corpora, limit, async function (corpus) {
    const c0 = Date.now();
    try {
      const out = await runHubKeywordForCorpus(env, corpus, escapedQuery, HUB_RESULTS_PER_CORPUS);
      const dt = Date.now() - c0;
      if (dt > slowestMs) { slowestMs = dt; slowest = corpus; }
      return [corpus, out];
    } catch (e) {
      const dt = Date.now() - c0;
      if (dt > slowestMs) { slowestMs = dt; slowest = corpus; }
      return [corpus, { count: 0, results: [], error: e && e.message ? e.message : String(e) }];
    }
  });

  // Content-free operational log (NO query text) so we can watch hub DB stress
  // during the beta from the Worker logs. Only cache MISSES reach this handler
  // (the edge cache wraps it), so this is exactly the DB-hitting hub load.
  try {
    console.log(JSON.stringify({ ev: "hub_fanout", ms: Date.now() - t0, slowest, slowest_ms: slowestMs, n: corpora.length, conc: limit }));
  } catch { /* logging must never break the response */ }

  const per_corpus = {};
  for (let i = 0; i < settled.length; i++) {
    per_corpus[settled[i][0]] = settled[i][1];
  }

  return json({ query, per_corpus }, 200);
}

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
    "metadata[product]": "RAGtime",
    // Label the resulting PaymentIntent/Charge so it is UNMISTAKABLE in the
    // Stripe Dashboard + CSV exports that this is a RAGtime credit purchase,
    // NOT a Lawfare donation — for accountant reconciliation. `description`
    // surfaces in the Payments-list Description column; the metadata keys are
    // filterable + included in exports. NOTE: session-level metadata does NOT
    // propagate to the charge — it must be set via payment_intent_data to land
    // on the object accountants see in the Payments view.
    "payment_intent_data[description]": `RAGtime credits — $${block} prepaid block`,
    "payment_intent_data[metadata][product]": "RAGtime",
    "payment_intent_data[metadata][user_id]": userId,
    "payment_intent_data[metadata][block]": block,
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

// ---------------- Service-health probes (frequent Cron Trigger) ----------------
// The liveness check above watches DATA freshness (is the pipeline writing?).
// These probes watch SERVICE health (can a user actually query, and how fast?)
// — the gap the robustness recon flagged: nothing observed user-facing
// latency/error rate. Each probe exercises a real serving path and measures
// wall-clock. Every run logs {ev:"health", ...} (a free 30-min latency
// heartbeat series in Workers Logs, alongside the per-request {ev:"req"}
// lines); Slack alerts fire on failure or slowness, muted via KV for
// HEALTH_ALERT_MUTE_MIN after each alert so a sustained outage pages once,
// not every 30 minutes. No "all clear" heartbeat to Slack (same noise-down
// posture as reconciliation).

var DEFAULT_HEALTH_DB_SLOW_MS = 5000;    // indexed single-row PostgREST reads run <300ms healthy
var DEFAULT_HEALTH_HUB_SLOW_MS = 20000;  // hub cache-miss fan-out: ~0.5-2s typical, broad-term tail ~10s
var DEFAULT_HEALTH_ALERT_MUTE_MIN = 120;

// One probe: run fn, measure, never throw. detail carries an error message
// (failure) or a short annotation like the cache disposition (success).
async function runHealthProbe(name, slowMs, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    return { name, ok: true, slow: ms > slowMs, ms, detail: detail || null };
  } catch (e) {
    return { name, ok: false, slow: false, ms: Date.now() - t0, detail: (e && e.message) || String(e) };
  }
}

// Pure: probe results -> alert lines (empty array = all healthy). Split out
// for unit tests.
function healthAlertLines(results) {
  const lines = [];
  for (const r of results) {
    if (!r.ok) lines.push(`${r.name}: FAILED after ${r.ms}ms (${String(r.detail).slice(0, 200)})`);
    else if (r.slow) lines.push(`${r.name}: slow — ${r.ms}ms`);
  }
  return lines;
}

async function runServiceHealthCheck(env, ctx) {
  const dbSlow = parseInt(env.HEALTH_DB_SLOW_MS || DEFAULT_HEALTH_DB_SLOW_MS, 10);
  const hubSlow = parseInt(env.HEALTH_HUB_SLOW_MS || DEFAULT_HEALTH_HUB_SLOW_MS, 10);

  const results = await Promise.all([
    // Corpus DB read path: PostgREST, indexed single-row read. Catches the
    // corpus project being down, paused, or under enough load that even a
    // trivial read crawls.
    runHealthProbe("corpus_db", dbSlow, async () => {
      const r = await corpusFetch(env, "/rest/v1/cases?select=cl_id&limit=1");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.text();
    }),
    // APP (billing/auth) DB read path — the plane sign-in and balances live on.
    runHealthProbe("app_db", dbSlow, async () => {
      const r = await supabaseFetch(env, "/rest/v1/accounts?select=user_id&limit=1");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.text();
    }),
    // Hub keyword end-to-end through the real route (edge cache wrapper +
    // 5-corpus FTS fan-out) — the known weak spot under load. In-process via
    // routeRequest (a Worker can't fetch itself). Fixed moderate-frequency
    // term keeps the cost realistic but bounded; the 300s edge TTL has lapsed
    // by the next 30-min run, so probes usually measure a genuine fan-out.
    // The fixed CF-Connecting-IP gives the probe its own rate-limit key
    // (1 req/30min — never trips, never collides with a real user).
    runHealthProbe("hub_keyword", hubSlow, async () => {
      const req = new Request("https://health-probe.internal/corpus/hub/keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.255.255.1" },
        body: JSON.stringify({ query: "certiorari" })
      });
      const resp = await routeRequest(req, env, ctx);
      if (resp.status !== 200) {
        throw new Error(`HTTP ${resp.status}: ${String(await resp.text()).slice(0, 200)}`);
      }
      return resp.headers.get("X-RT-Cache") || null;
    })
  ]);

  try { console.log(JSON.stringify({ ev: "health", results })); } catch { /* never throw from logging */ }

  const lines = healthAlertLines(results);
  if (lines.length === 0) return;

  // Mute window: only the first breach in HEALTH_ALERT_MUTE_MIN pages Slack.
  // KV trouble must not swallow the alert — on any KV error we alert anyway.
  try {
    if (env.QUOTA) {
      const muted = await env.QUOTA.get("health:alert-mute");
      if (muted) return;
      await env.QUOTA.put("health:alert-mute", "1", {
        expirationTtl: parseInt(env.HEALTH_ALERT_MUTE_MIN || DEFAULT_HEALTH_ALERT_MUTE_MIN, 10) * 60
      });
    }
  } catch { /* fall through to notify */ }
  await notify(env, `service health:\n${lines.map((l) => `• ${l}`).join("\n")}`);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Usage-Log-Token",
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
  buildUscFilterWhere,
  buildCfrFilterWhere,
  buildOlcFilterWhere,
  buildFrusFilterWhere,
  buildLawfareFilterWhere,
  constantTimeEqual,
  bufToHex,
  b64UrlDecodeToString,
  verifyStripeSignature,
  emailDomainAllowed,
  betaGate,
  webhookHandler,
  checkIpRateLimit,
  checkUserRateLimit,
  resolveCorpusAuth,
  LEGAL_ADVICE_CANDOR_NOTE,
  buildOlcPlanningSystem,
  buildFrusPlanningSystem,
  withStatementTimeoutRetry,
  supabaseGetAccount,
  verifyJwt,
  pipelineStaleness,
  normalizeOlcScope,
  parseOlcPlan,
  parseOlcSynthesis,
  parseOlcSummary,
  buildOlcPlanningUser,
  buildOlcSummarizeUser,
  OLC_SUMMARIZE_TEXT_CAP,
  normalizeFrusScope,
  parseFrusPlan,
  parseFrusSynthesis,
  parseFrusSummary,
  buildFrusPlanningUser,
  buildFrusSummarizeUser,
  executeFrusPlan,
  FRUS_SUMMARIZE_TEXT_CAP,
  FRUS_SCOPE_LITERAL_LIMIT,
  normalizeLawfareScope,
  parseLawfarePlan,
  parseLawfareSynthesis,
  parseLawfareSummary,
  buildLawfarePlanningUser,
  buildLawfarePlanningSystem,
  buildLawfareSummarizeUser,
  executeLawfarePlan,
  LAWFARE_SUMMARIZE_TEXT_CAP,
  normalizeUscScope,
  parseUscPlan,
  parseUscSynthesis,
  parseUscSummary,
  buildUscPlanningUser,
  buildUscSummarizeUser,
  buildUscPlanningSystem,
  executeUscPlan,
  USC_SUMMARIZE_TEXT_CAP,
  USC_SCOPE_LITERAL_LIMIT,
  normalizeCfrScope,
  parseCfrPlan,
  parseCfrSynthesis,
  parseCfrSummary,
  buildCfrPlanningUser,
  buildCfrSummarizeUser,
  buildCfrPlanningSystem,
  executeCfrPlan,
  CFR_SUMMARIZE_TEXT_CAP,
  CFR_SCOPE_LITERAL_LIMIT,
  HUB_CORPORA,
  HUB_RESULTS_PER_CORPUS,
  buildHubQueriesLitigation,
  buildHubQueriesUsc,
  buildHubQueriesCfr,
  buildHubQueriesOlc,
  buildHubQueriesFrus,
  buildHubQueriesLawfare,
  ITEMS_BY_IDS_CAP,
  parseItemsByIdsRequest,
  buildItemsByIdsSql,
  salvageTruncatedSynthesis,
  buildSalvagedSynthesis,
  parseSynthesis,
  parseAnalysis,
  repairAnalysisMarkdownQuotes,
  salvageTruncatedAnalysis,
  parseSqlGen,
  repairSqlGenQuotes,
  buildPlanningSystem,
  buildReadSystem,
  buildSynthesisSystem,
  parseUsageLogRequest,
  buildUsageLogSuccessRow,
  usageLogAuthorized,
  usageLoggingAllowed,
  corsHeaders,
  timingSafeStrEqual,
  sha256Hex,
  corpusCacheKeyUrl,
  CORPUS_CACHE_TTL,
  mapWithConcurrency,
  hubFanoutConcurrency,
  is57014,
  parseExplainTotalCost,
  heavyCostThreshold,
  healthAlertLines,
  runHealthProbe,
  logRequest
};
