import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lookupAnthropicRates,
  computeCostCents,
  estimateInputTokens,
  constantTimeEqual,
  bufToHex,
  b64UrlDecodeToString,
  verifyStripeSignature,
  emailDomainAllowed,
  betaGate,
  webhookHandler,
  checkUserRateLimit,
  supabaseGetAccount,
  verifyJwt,
  pipelineStaleness
} from "./index.js";

// base64url-encode a JS object (no padding) for building fake JWT segments.
function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
// Build a fake "header.payload.sig" token. The signature is bogus — these are
// for the REJECTION paths, which all return null before/without real crypto.
function fakeJwt(header, payload, sig = "bogussig") {
  return `${b64urlJson(header)}.${b64urlJson(payload)}.${sig}`;
}

// ============================================================================
// Pricing math — computeCostCents decides what a paid user is actually charged.
// These tests pin the formula: ceil( (in*inRate + out*outRate)/1e6 * markup *
// 100 ) cents. Getting this wrong means mischarging real cards, so it's the
// highest-value invariant in the suite.
// ============================================================================
describe("computeCostCents", () => {
  const sonnet = { input: 3, output: 15 }; // $/Mtok

  it("charges input tokens at the input rate (markup 1.0)", () => {
    // 1M input tokens * $3/Mtok = $3.00 = 300 cents
    expect(computeCostCents({ inputTokens: 1_000_000, outputTokens: 0, rates: sonnet, markup: 1.0 })).toBe(300);
  });

  it("charges output tokens at the (higher) output rate", () => {
    // 1M output tokens * $15/Mtok = $15.00 = 1500 cents
    expect(computeCostCents({ inputTokens: 0, outputTokens: 1_000_000, rates: sonnet, markup: 1.0 })).toBe(1500);
  });

  it("applies the markup multiplier without FP over-rounding", () => {
    // $3.00 * 1.35 = $4.05 = exactly 405 cents. Before the toFixed(6) fix this
    // returned 406 because 3 * 1.35 === 4.050000000000001 and Math.ceil tipped
    // it over by a cent. This pins the corrected behavior.
    expect(computeCostCents({ inputTokens: 1_000_000, outputTokens: 0, rates: sonnet, markup: 1.35 })).toBe(405);
  });

  it("still rounds a GENUINE sub-cent fraction up (the fix must not undercharge)", () => {
    // 1_000_001 input tokens: 3.000003 * 1.35 * 100 = 405.000405 cents — a real
    // fraction above 405, so it must ceil to 406, not collapse to 405.
    expect(computeCostCents({ inputTokens: 1_000_001, outputTokens: 0, rates: sonnet, markup: 1.35 })).toBe(406);
  });

  it("rounds UP — a tiny query is never charged 0 (no free rides via rounding)", () => {
    // 1 input token costs $3e-6 → 0.0003 cents → ceil → 1 cent
    expect(computeCostCents({ inputTokens: 1, outputTokens: 0, rates: sonnet, markup: 1.0 })).toBe(1);
  });

  it("computes a realistic mixed query correctly", () => {
    // (10000*3 + 2000*15)/1e6 = 0.06 → *1.35 = 0.081 → *100 = 8.1 → ceil = 9
    expect(computeCostCents({ inputTokens: 10_000, outputTokens: 2_000, rates: sonnet, markup: 1.35 })).toBe(9);
  });

  it("a zero-token call costs 0", () => {
    expect(computeCostCents({ inputTokens: 0, outputTokens: 0, rates: sonnet, markup: 1.35 })).toBe(0);
  });
});

// ============================================================================
// lookupAnthropicRates — the price table + family fallbacks. A model with no
// price must return null (askHandler then refuses to charge rather than guess).
// ============================================================================
describe("lookupAnthropicRates", () => {
  it("returns exact rates for known model ids", () => {
    expect(lookupAnthropicRates("claude-sonnet-4-5")).toEqual({ input: 3, output: 15 });
    expect(lookupAnthropicRates("claude-opus-4-7")).toEqual({ input: 15, output: 75 });
    expect(lookupAnthropicRates("claude-haiku-4-5")).toEqual({ input: 1, output: 5 });
  });

  it("falls back by family for unknown but recognizable ids", () => {
    expect(lookupAnthropicRates("claude-sonnet-4-9-future")).toEqual({ input: 3, output: 15 });
    expect(lookupAnthropicRates("some-haiku-thing")).toEqual({ input: 1, output: 5 });
    expect(lookupAnthropicRates("claude-opus-99")).toEqual({ input: 15, output: 75 });
  });

  it("returns null for models with no known price", () => {
    expect(lookupAnthropicRates("gpt-4o")).toBeNull();
    expect(lookupAnthropicRates("")).toBeNull();
  });
});

// ============================================================================
// estimateInputTokens — the pre-flight cost estimate (chars/3.5 + 8/message).
// Used to refuse queries that could exceed the balance, so it must be stable.
// ============================================================================
describe("estimateInputTokens", () => {
  it("counts system + message chars plus per-message overhead", () => {
    // system "" (0) + one message content of 27 chars + 8 overhead = 35 → ceil(35/3.5)=10
    const msgs = [{ role: "user", content: "x".repeat(27) }];
    expect(estimateInputTokens("", msgs)).toBe(10);
  });

  it("includes the system prompt length", () => {
    const msgs = [{ role: "user", content: "" }]; // 0 + 8 overhead
    // system of 27 chars → 27 + 0 + 8 = 35 → ceil(35/3.5)=10
    expect(estimateInputTokens("y".repeat(27), msgs)).toBe(10);
  });

  it("handles missing content without throwing", () => {
    expect(estimateInputTokens(null, [{ role: "user" }])).toBe(Math.ceil(8 / 3.5));
  });
});

// ============================================================================
// constantTimeEqual — used for demo-password and signature comparison. Must be
// length-safe and reject non-strings (never throw, never loosely-equal).
// ============================================================================
describe("constantTimeEqual", () => {
  it("is true only for identical strings", () => {
    expect(constantTimeEqual("hunter2", "hunter2")).toBe(true);
  });
  it("is false for different same-length strings", () => {
    expect(constantTimeEqual("aaaa", "aaab")).toBe(false);
  });
  it("is false for different-length strings", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
  it("is false (not throwing) for non-strings", () => {
    expect(constantTimeEqual(undefined, "x")).toBe(false);
    expect(constantTimeEqual("x", null)).toBe(false);
  });
});

// ============================================================================
// b64UrlDecodeToString — JWT base64url decoding (no padding, -_ alphabet).
// ============================================================================
describe("b64UrlDecodeToString", () => {
  it("decodes base64url without padding", () => {
    // {"a":1} → base64url "eyJhIjoxfQ"
    expect(b64UrlDecodeToString("eyJhIjoxfQ")).toBe('{"a":1}');
  });
});

// ============================================================================
// emailDomainAllowed — the soft-launch whitelist domain check.
// ============================================================================
describe("emailDomainAllowed", () => {
  it("allows the default lawfaremedia.org domain", () => {
    expect(emailDomainAllowed({}, "ben@lawfaremedia.org")).toBe(true);
  });
  it("rejects other domains by default", () => {
    expect(emailDomainAllowed({}, "ben@gmail.com")).toBe(false);
  });
  it("honors a custom BETA_ALLOW_DOMAINS list (comma-separated, case-insensitive)", () => {
    const env = { BETA_ALLOW_DOMAINS: "example.com, Foo.ORG" };
    expect(emailDomainAllowed(env, "a@example.com")).toBe(true);
    expect(emailDomainAllowed(env, "a@foo.org")).toBe(true);
    expect(emailDomainAllowed(env, "a@bar.com")).toBe(false);
  });
  it("rejects malformed emails with no @", () => {
    expect(emailDomainAllowed({}, "not-an-email")).toBe(false);
  });
});

// ============================================================================
// verifyStripeSignature — the gate on the Stripe webhook. A forged or tampered
// payload MUST be rejected, or an attacker could credit themselves arbitrary
// balance. Uses real HMAC-SHA256 (no mocking).
// ============================================================================
async function signStripe(body, secret, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return { header: `t=${t},v1=${bufToHex(sigBuf)}`, t };
}

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';

  it("accepts a correctly-signed payload", async () => {
    const { header } = await signStripe(body, secret);
    expect(await verifyStripeSignature(body, header, secret)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const { header } = await signStripe(body, secret);
    expect(await verifyStripeSignature(body + " ", header, secret)).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const { header } = await signStripe(body, secret);
    expect(await verifyStripeSignature(body, header, "whsec_wrong")).toBe(false);
  });

  it("rejects a missing header or secret", async () => {
    expect(await verifyStripeSignature(body, "", secret)).toBe(false);
    expect(await verifyStripeSignature(body, "t=1,v1=abc", "")).toBe(false);
  });

  it("rejects a header missing t or v1", async () => {
    expect(await verifyStripeSignature(body, "v1=abc", secret)).toBe(false);
    expect(await verifyStripeSignature(body, "t=123", secret)).toBe(false);
  });
});

// ============================================================================
// webhookHandler — the credit/debit router. These are the integration tests
// that matter most for financial integrity: a paid checkout credits exactly the
// paid amount; a duplicate event is a no-op (no double-credit); a chargeback
// debits; a forged signature is refused. Supabase + Slack are mocked via fetch.
// ============================================================================
describe("webhookHandler", () => {
  const secret = "whsec_test_secret";
  const baseEnv = {
    STRIPE_WEBHOOK_SECRET: secret,
    SUPABASE_URL: "https://supa.test",
    SUPABASE_SERVICE_ROLE_KEY: "svc_role_key"
    // SLACK_ALERT_WEBHOOK_URL deliberately unset → notify() is a no-op
  };

  // Build a fetch mock that routes Supabase REST calls by URL+method. `seen`
  // controls whether the idempotency lookup reports the event as processed.
  function mockSupabase({ seen = false, userByPI = "user_123" } = {}) {
    const calls = [];
    const fn = vi.fn(async (url, init = {}) => {
      const method = (init.method || "GET").toUpperCase();
      const u = String(url);
      let bodyObj = null;
      try { bodyObj = init.body ? JSON.parse(init.body) : null; } catch { /* form/other */ }
      calls.push({ url: u, method, body: bodyObj });

      // Idempotency lookup: GET processed_stripe_events
      if (u.includes("/processed_stripe_events") && method === "GET") {
        return jsonResponse(seen ? [{ event_id: "evt" }] : []);
      }
      // Record processed event: POST processed_stripe_events
      if (u.includes("/processed_stripe_events") && method === "POST") {
        return new Response(null, { status: 201 });
      }
      // Find user by payment intent (chargeback / refund path)
      if (u.includes("/ledger") && method === "GET") {
        return jsonResponse(userByPI ? [{ user_id: userByPI }] : []);
      }
      // Balance change RPC (credit / debit / chargeback)
      if (u.includes("/rpc/apply_balance_change") && method === "POST") {
        return jsonResponse({});
      }
      return jsonResponse({}, 200);
    });
    return { fn, calls };
  }

  function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  function rpcCall(calls) {
    return calls.find((c) => c.url.includes("/rpc/apply_balance_change") && c.method === "POST");
  }

  async function makeRequest(event) {
    const body = JSON.stringify(event);
    const { header } = await signStripe(body, secret);
    return new Request("https://worker.test/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": header },
      body
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("credits the exact paid amount on checkout.session.completed", async () => {
    const { fn, calls } = mockSupabase({ seen: false });
    vi.stubGlobal("fetch", fn);
    const event = {
      id: "evt_credit_1",
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_test_1",
        amount_total: 2000, // $20.00
        payment_intent: "pi_1",
        metadata: { user_id: "user_123", block: "20" }
      } }
    };
    const res = await webhookHandler(await makeRequest(event), baseEnv);
    expect(res.status).toBe(200);
    const rpc = rpcCall(calls);
    expect(rpc).toBeTruthy();
    expect(rpc.body.p_user_id).toBe("user_123");
    expect(rpc.body.p_amount_cents).toBe(2000); // credited exactly, positive
    expect(rpc.body.p_kind).toBe("purchase");
    // and the event is recorded as processed
    expect(calls.some((c) => c.url.includes("/processed_stripe_events") && c.method === "POST")).toBe(true);
  });

  it("is idempotent — a duplicate event does NOT credit again", async () => {
    const { fn, calls } = mockSupabase({ seen: true });
    vi.stubGlobal("fetch", fn);
    const event = {
      id: "evt_credit_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", amount_total: 2000, payment_intent: "pi_1", metadata: { user_id: "user_123" } } }
    };
    const res = await webhookHandler(await makeRequest(event), baseEnv);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/already processed/i);
    expect(rpcCall(calls)).toBeUndefined(); // no balance change on a replay
  });

  it("debits the disputed amount on charge.dispute.created (chargeback)", async () => {
    const { fn, calls } = mockSupabase({ seen: false, userByPI: "user_777" });
    vi.stubGlobal("fetch", fn);
    const event = {
      id: "evt_dispute_1",
      type: "charge.dispute.created",
      data: { object: {
        id: "dp_1",
        amount: 5000, // $50 disputed
        payment_intent: "pi_9",
        charge: "ch_9",
        reason: "fraudulent",
        status: "needs_response"
      } }
    };
    const res = await webhookHandler(await makeRequest(event), baseEnv);
    expect(res.status).toBe(200);
    const rpc = rpcCall(calls);
    expect(rpc).toBeTruthy();
    expect(rpc.body.p_user_id).toBe("user_777");
    expect(rpc.body.p_amount_cents).toBe(-5000); // debit (negative)
    expect(rpc.body.p_kind).toBe("adjustment");
    expect(rpc.body.p_metadata.kind_detail).toBe("chargeback");
  });

  it("rejects a forged signature with 400 and touches no balance", async () => {
    const { fn, calls } = mockSupabase();
    vi.stubGlobal("fetch", fn);
    const body = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } });
    const req = new Request("https://worker.test/api/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": "t=123,v1=deadbeef" },
      body
    });
    const res = await webhookHandler(req, baseEnv);
    expect(res.status).toBe(400);
    expect(fn).not.toHaveBeenCalled(); // never reached Supabase
  });

  it("ignores a checkout with no user_id metadata (records but does not credit)", async () => {
    const { fn, calls } = mockSupabase({ seen: false });
    vi.stubGlobal("fetch", fn);
    const event = {
      id: "evt_nouser",
      type: "checkout.session.completed",
      data: { object: { id: "cs_2", amount_total: 500, metadata: {} } }
    };
    const res = await webhookHandler(await makeRequest(event), baseEnv);
    expect(res.status).toBe(200);
    expect(rpcCall(calls)).toBeUndefined();
  });
});

// ============================================================================
// betaGate — the soft-launch access gate. Allowed (domain or allowlist) → null;
// otherwise a 403 with code "not_in_beta". Uses claims.email when present.
// ============================================================================
describe("betaGate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("allows an on-domain user via the email claim (no Supabase call needed)", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const res = await betaGate({}, { sub: "u1", email: "x@lawfaremedia.org" });
    expect(res).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("blocks an off-domain user not in the allowlist with 403 not_in_beta", async () => {
    // allowlist lookup returns empty
    const fn = vi.fn(async () =>
      new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    vi.stubGlobal("fetch", fn);
    const env = { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
    const res = await betaGate(env, { sub: "u2", email: "x@gmail.com" });
    expect(res).not.toBeNull();
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error.code).toBe("not_in_beta");
  });

  it("allows an off-domain user who IS in the allowlist", async () => {
    const fn = vi.fn(async () =>
      new Response(JSON.stringify([{ email: "x@gmail.com" }]), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    vi.stubGlobal("fetch", fn);
    const env = { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
    const res = await betaGate(env, { sub: "u3", email: "x@gmail.com" });
    expect(res).toBeNull();
  });
});

// ============================================================================
// checkUserRateLimit — per-account request/min ceiling on the paid path. Bounds
// request rate independent of IP (the prepaid balance bounds total spend). Uses
// a per-minute KV counter; over the limit → 429 with code "user_rate_limited".
// ============================================================================
describe("checkUserRateLimit", () => {
  // Minimal in-memory KV stand-in for env.QUOTA.
  function mockKV(initial = {}) {
    const store = { ...initial };
    return {
      store,
      get: vi.fn(async (k) => (k in store ? store[k] : null)),
      put: vi.fn(async (k, v) => { store[k] = v; })
    };
  }
  const ctx = { waitUntil: (p) => p };
  const now = new Date("2026-05-25T12:00:00Z");
  // yyyymmddhhmm(now) → 202605251200
  const keyFor = (u) => `user:${u}:202605251200`;

  it("allows and increments when under the limit", async () => {
    const QUOTA = mockKV();
    const res = await checkUserRateLimit({ QUOTA }, ctx, "u1", now);
    expect(res).toBeNull();
    expect(QUOTA.store[keyFor("u1")]).toBe("1"); // counter bumped
  });

  it("returns 429 user_rate_limited at the limit", async () => {
    // Already at the default cap (30) this minute.
    const QUOTA = mockKV({ [keyFor("u2")]: "30" });
    const res = await checkUserRateLimit({ QUOTA }, ctx, "u2", now);
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
    const payload = await res.json();
    expect(payload.error.code).toBe("user_rate_limited");
    // does NOT increment past the cap (no further KV write)
    expect(QUOTA.put).not.toHaveBeenCalled();
  });

  it("honors a custom PER_USER_PER_MIN override", async () => {
    const QUOTA = mockKV({ [keyFor("u3")]: "2" });
    // cap of 2 → already at limit
    const res = await checkUserRateLimit({ QUOTA, PER_USER_PER_MIN: "2" }, ctx, "u3", now);
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
  });

  it("keys per user — one user's traffic doesn't limit another", async () => {
    const QUOTA = mockKV({ [keyFor("busy")]: "30" });
    const res = await checkUserRateLimit({ QUOTA }, ctx, "fresh", now);
    expect(res).toBeNull();
    expect(QUOTA.store[keyFor("fresh")]).toBe("1");
  });
});

// ============================================================================
// supabaseGetAccount — verifies the user id is URL-encoded into the PostgREST
// query (defense-in-depth). The id is a verified-JWT UUID today, but encoding
// ensures a value with PostgREST control chars (&, =, ?) can never escape the
// `user_id=eq.<id>` filter and read/alter other rows.
// ============================================================================
describe("supabaseGetAccount user-id encoding", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("URL-encodes the user id so query-param injection can't escape the filter", async () => {
    let captured = null;
    const fn = vi.fn(async (url) => {
      captured = String(url);
      return new Response(JSON.stringify([{ user_id: "x", balance_cents: 0 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fn);
    const env = { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
    // A hostile id that, unencoded, would inject extra PostgREST query params.
    await supabaseGetAccount(env, "evil&select=*&user_id=eq.someone-else");
    // The injection chars & and = are percent-encoded (%26 / %3D), so the whole
    // hostile string collapses into ONE value of the user_id filter — it can't
    // open new PostgREST query params. (* is a mark char left literal; harmless.)
    expect(captured).toContain("user_id=eq.evil%26select%3D*%26user_id%3Deq.someone-else");
    expect(captured).not.toContain("eq.evil&select="); // raw injection neutralized
  });
});

// ============================================================================
// verifyJwt — the auth boundary. The verifier accepts ES256 ONLY; everything
// else (no signature, the "none" algorithm-confusion bypass, the removed HS256
// path, malformed tokens, missing sub, expired) must return null. These cases
// reject BEFORE any signature crypto, so they need no JWKS / keypair.
// ============================================================================
describe("verifyJwt rejection (alg allow-list + claim checks)", () => {
  it("rejects the 'none' algorithm (no signature bypass)", async () => {
    const t = fakeJwt({ alg: "none", typ: "JWT" }, { sub: "u1", exp: 9999999999 }, "");
    expect(await verifyJwt(t, {})).toBeNull();
  });

  it("rejects HS256 (removed legacy path is not silently re-accepted)", async () => {
    const t = fakeJwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: 9999999999 });
    // Even if a JWT secret were present, HS256 is no longer an accepted alg.
    expect(await verifyJwt(t, { SUPABASE_JWT_SECRET: "leftover-secret" })).toBeNull();
  });

  it("rejects a malformed token (not three segments)", async () => {
    expect(await verifyJwt("only.two", {})).toBeNull();
    expect(await verifyJwt("", {})).toBeNull();
  });

  it("rejects a token with no sub claim", async () => {
    const t = fakeJwt({ alg: "ES256", kid: "k1" }, { exp: 9999999999 });
    expect(await verifyJwt(t, {})).toBeNull();
  });

  it("rejects an expired token before doing any crypto", async () => {
    const t = fakeJwt({ alg: "ES256", kid: "k1" }, { sub: "u1", exp: 1 }); // 1970
    expect(await verifyJwt(t, {})).toBeNull();
  });
});

// ============================================================================
// pipelineStaleness — pure decision logic for the off-box liveness check. Given
// the newest corpus-document timestamp, decide whether ingestion has gone stale.
// ============================================================================
describe("pipelineStaleness", () => {
  const now = Date.parse("2026-05-25T12:00:00Z");
  const minsAgo = (m) => new Date(now - m * 60000).toISOString();

  it("is NOT stale when a document arrived within the threshold", () => {
    const r = pipelineStaleness(minsAgo(10), now, 120);
    expect(r.stale).toBe(false);
    expect(r.ageMinutes).toBe(10);
  });

  it("IS stale when the newest document is older than the threshold", () => {
    const r = pipelineStaleness(minsAgo(200), now, 120);
    expect(r.stale).toBe(true);
    expect(r.ageMinutes).toBe(200);
  });

  it("treats exactly-at-threshold as not stale (strictly greater trips it)", () => {
    expect(pipelineStaleness(minsAgo(120), now, 120).stale).toBe(false);
    expect(pipelineStaleness(minsAgo(121), now, 120).stale).toBe(true);
  });

  it("is stale with null age when there are no documents at all", () => {
    const r = pipelineStaleness(null, now, 120);
    expect(r.stale).toBe(true);
    expect(r.ageMinutes).toBeNull();
  });

  it("is stale (not throwing) on an unparseable timestamp", () => {
    const r = pipelineStaleness("not-a-date", now, 120);
    expect(r.stale).toBe(true);
    expect(r.ageMinutes).toBeNull();
  });
});
