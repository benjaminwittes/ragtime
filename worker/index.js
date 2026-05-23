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
// Change in v3.1: JWT verification migrated from HS256 (legacy shared
// `SUPABASE_JWT_SECRET`) to ES256 via Supabase's published JWKS endpoint
// (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). Supabase auto-migrated
// projects to asymmetric JWTs (ECDSA P-256) in 2025–2026, which the
// previous HS256-only verifier could no longer read — every token was
// rejected with "Invalid or expired session token", causing the paid-tier
// `/api/balance` 401 loop. The worker now:
//   - Reads the token's `alg` and `kid` header claims.
//   - For ES256: fetches the JWK from Supabase's JWKS endpoint
//     (cached in module memory for 10 minutes), imports the public key,
//     and verifies via Web Crypto's ECDSA P-256 / SHA-256 path.
//   - For HS256 (kept as fallback): does the legacy HMAC verification
//     using env.SUPABASE_JWT_SECRET, so older tokens still work during
//     any transitional window.
//
// Env vars required for paid-tier verification:
//   SUPABASE_URL   — already set; reused for JWKS fetch.
//   (SUPABASE_JWT_SECRET — only needed for HS256 fallback. Can be left
//    in place; ignored when token alg is ES256. Safe to remove later.)

var DEFAULT_DEMO_PASSWORD = "Lawfareskunkworks";
var DAILY_QUOTA = 500;
var PER_IP_PER_MIN = 10;
var ANTHROPIC_VERSION = "2023-06-01";
var DEFAULT_MARKUP = 1.35;
var DEFAULT_BALANCE_FLOOR_CENTS = 5;
var MAX_SPEND_RATIO = 1.5;

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

  // Cron trigger (see wrangler.toml [triggers]): weekly billing reconciliation.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReconciliation(env));
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
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = new Date();
  const ipKey = `ip:${ip}:${yyyymmddhhmm(now)}`;
  const ipCount = parseInt((await env.QUOTA.get(ipKey)) || "0", 10);
  if (ipCount >= PER_IP_PER_MIN) {
    return json({ error: { message: "Rate limit exceeded (10 req/min per IP)" } }, 429);
  }
  ctx.waitUntil(env.QUOTA.put(ipKey, String(ipCount + 1), { expirationTtl: 120 }));

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
    if (account.balance_cents < floor) {
      return json({ error: {
        message: "Your balance is empty. Top up to continue.",
        code: "empty_balance"
      } }, 402);
    }
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
    if (estMaxCents > account.balance_cents * MAX_SPEND_RATIO) {
      return json({ error: {
        message: `This query could cost up to $${(estMaxCents / 100).toFixed(2)}; your balance is $${(account.balance_cents / 100).toFixed(2)}. Top up or refine the query.`,
        code: "insufficient_for_estimate",
        estimated_max_cents: estMaxCents,
        balance_cents: account.balance_cents
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
  const baseUrl = env.APP_BASE_URL || "https://benjaminwittes.github.io/ragtime";
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
    } else if (header.alg === "HS256") {
      // Legacy fallback. Kept so any straggler HS256 tokens still verify
      // during a transitional window. Safe to remove once you're sure
      // no HS256 tokens are in circulation.
      if (!env.SUPABASE_JWT_SECRET) return null;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      ok = await crypto.subtle.verify("HMAC", key, sigBytes, signingInput);
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
    `/rest/v1/accounts?user_id=eq.${userId}&select=user_id,stripe_customer_id,balance_cents,per_query_cap_cents`
  );
  if (!r.ok) throw new Error(`Supabase getAccount failed: ${r.status}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function supabaseGetUserEmail(env, userId) {
  const r = await supabaseFetch(env, `/auth/v1/admin/users/${userId}`);
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
  const r = await supabaseFetch(env, `/rest/v1/accounts?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error(`Supabase updateAccount failed: ${r.status} ${await r.text()}`);
}

async function supabaseGetRecentLedger(env, userId, limit) {
  const r = await supabaseFetch(
    env,
    `/rest/v1/ledger?user_id=eq.${userId}&select=id,amount_cents,kind,metadata,created_at&order=created_at.desc&limit=${limit}`
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
  return Math.ceil(rawDollars * markup * 100);
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
