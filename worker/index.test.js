import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lookupAnthropicRates,
  computeCostCents,
  estimateInputTokens,
  checkPaidBudget,
  pickCheckoutReturnOrigin,
  buildUscFilterWhere,
  buildCfrFilterWhere,
  buildOlcFilterWhere,
  buildFrusFilterWhere,
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
  FRUS_SCOPE_LITERAL_LIMIT
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
// checkPaidBudget — the policy that gates billed calls. Owns:
//   - Whether a user is allowed to start at all (balance vs. floor)
//   - Whether their next query fits in the remaining headroom
// Includes the courtesy-deficit semantics: a negative floor lets a user
// run a small deficit before being blocked.
// ============================================================================
describe("checkPaidBudget", () => {
  it("allows a healthy balance with room to spare", () => {
    const r = checkPaidBudget({ balanceCents: 500, floorCents: -50, estMaxCents: 100 });
    expect(r.ok).toBe(true);
    expect(r.headroomCents).toBe(550); // 500 - (-50)
  });

  it("blocks when the balance is below the floor (positive floor)", () => {
    const r = checkPaidBudget({ balanceCents: 4, floorCents: 5, estMaxCents: 1 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("empty_balance");
    expect(r.balanceCents).toBe(4);
    expect(r.floorCents).toBe(5);
  });

  it("blocks when the balance is below the floor (negative floor / courtesy deficit)", () => {
    const r = checkPaidBudget({ balanceCents: -51, floorCents: -50, estMaxCents: 1 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("empty_balance");
    // The error message for negative floors mentions the courtesy floor so
    // the UI can surface what's blocking the user.
    expect(r.message).toMatch(/courtesy floor/i);
  });

  it("allows balance exactly at the floor when no estimate is offered", () => {
    // balance === floor → headroom = 0 → only zero-cost calls pass.
    const r = checkPaidBudget({ balanceCents: -50, floorCents: -50, estMaxCents: 0 });
    expect(r.ok).toBe(true);
    expect(r.headroomCents).toBe(0);
  });

  it("blocks a query whose estimate exceeds headroom", () => {
    // balance 100, floor 0 → headroom 100; query at 101 should fail.
    const r = checkPaidBudget({ balanceCents: 100, floorCents: 0, estMaxCents: 101 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("insufficient_for_estimate");
    expect(r.headroomCents).toBe(100);
    expect(r.estMaxCents).toBe(101);
  });

  it("allows the courtesy deficit to soak up a small overrun", () => {
    // balance 30, floor -50 → headroom 80. A 75¢ estimate is allowed even
    // though it pushes the worst-case ending balance to -45 (legal under
    // the courtesy floor); without the deficit it would have been blocked.
    const r = checkPaidBudget({ balanceCents: 30, floorCents: -50, estMaxCents: 75 });
    expect(r.ok).toBe(true);
    expect(r.headroomCents).toBe(80);
  });

  it("permits queries against a negative balance while above the floor", () => {
    // balance -30 (in the courtesy zone), floor -50 → headroom 20. A 15¢
    // query is allowed; a 25¢ query is not.
    const a = checkPaidBudget({ balanceCents: -30, floorCents: -50, estMaxCents: 15 });
    expect(a.ok).toBe(true);
    const b = checkPaidBudget({ balanceCents: -30, floorCents: -50, estMaxCents: 25 });
    expect(b.ok).toBe(false);
    expect(b.code).toBe("insufficient_for_estimate");
  });

  it("preserves the 'empty' phrasing when floor is non-negative", () => {
    const r = checkPaidBudget({ balanceCents: -1, floorCents: 0, estMaxCents: 1 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("empty_balance");
    expect(r.message).toMatch(/balance is empty/i);
  });
});

// ============================================================================
// pickCheckoutReturnOrigin — Stripe redirects the user's browser to whatever
// URL we hand it after checkout, so the allowlist here is a security
// boundary. Tests confirm: production fallback when nothing is requested,
// allowlist honoring (production + localhost dev), rejection of foreign
// origins, malformed-input safety.
// ============================================================================
describe("pickCheckoutReturnOrigin", () => {
  const prodEnv = { APP_BASE_URL: "https://benjaminwittes.github.io/ragtime" };

  it("falls back to APP_BASE_URL when no request is provided", () => {
    expect(pickCheckoutReturnOrigin(undefined, prodEnv)).toBe(
      "https://benjaminwittes.github.io/ragtime",
    );
    expect(pickCheckoutReturnOrigin("", prodEnv)).toBe(
      "https://benjaminwittes.github.io/ragtime",
    );
  });

  it("honors a request that matches the production origin (with path)", () => {
    expect(
      pickCheckoutReturnOrigin(
        "https://benjaminwittes.github.io/ragtime/",
        prodEnv,
      ),
    ).toBe("https://benjaminwittes.github.io/ragtime");
  });

  it("honors localhost dev origins (Vite default port)", () => {
    expect(pickCheckoutReturnOrigin("http://localhost:5173/", prodEnv)).toBe(
      "http://localhost:5173",
    );
    expect(pickCheckoutReturnOrigin("http://127.0.0.1:5173/", prodEnv)).toBe(
      "http://127.0.0.1:5173",
    );
  });

  it("rejects foreign origins, falling back to APP_BASE_URL", () => {
    // A tampered request must not redirect the user post-checkout.
    expect(
      pickCheckoutReturnOrigin("https://evil.example.com/", prodEnv),
    ).toBe("https://benjaminwittes.github.io/ragtime");
  });

  it("rejects non-allowlisted localhost ports (only :5173)", () => {
    expect(
      pickCheckoutReturnOrigin("http://localhost:3000/", prodEnv),
    ).toBe("https://benjaminwittes.github.io/ragtime");
  });

  it("rejects malformed URLs", () => {
    expect(pickCheckoutReturnOrigin("not-a-url", prodEnv)).toBe(
      "https://benjaminwittes.github.io/ragtime",
    );
  });

  it("strips a trailing slash so the appended ?checkout=... query is clean", () => {
    // Worker uses ${baseUrl}/?checkout=success&session_id=...; we want
    // exactly one '/' before '?', not two.
    expect(pickCheckoutReturnOrigin("http://localhost:5173/", prodEnv)).toBe(
      "http://localhost:5173",
    );
  });
});

// ============================================================================
// buildUscFilterWhere — the USC manual filter's WHERE-clause builder. Pure
// function; covers the brief #3 §3 free-tier metadata axes (FTS, title,
// citation, heading, positive-law, status). Tests confirm the SQL shape,
// the empty-input no-op, and single-quote escaping that keeps user input
// from breaking out of the literal.
// ============================================================================
describe("buildUscFilterWhere", () => {
  it("returns an empty string when no fields are provided", () => {
    expect(buildUscFilterWhere({})).toBe("");
  });

  it("produces an FTS predicate for `search`", () => {
    const where = buildUscFilterWhere({ search: "habeas corpus" });
    expect(where).toMatch(/^ WHERE /);
    expect(where).toContain("fts @@ websearch_to_tsquery('english', 'habeas corpus')");
  });

  it("escapes single quotes in `search` so user input can't break out", () => {
    // O'Brien — the canonical apostrophe test. SQL would otherwise misparse.
    const where = buildUscFilterWhere({ search: "O'Brien" });
    expect(where).toContain("websearch_to_tsquery('english', 'O''Brien')");
  });

  it("filters by exact title number", () => {
    expect(buildUscFilterWhere({ title: 8 })).toBe(" WHERE title_num = 8");
  });

  it("rejects non-finite title values silently", () => {
    expect(buildUscFilterWhere({ title: "not-a-number" })).toBe("");
    expect(buildUscFilterWhere({ title: NaN })).toBe("");
  });

  it("supports the canonical-citation lookup path (the #1 USC entry)", () => {
    const where = buildUscFilterWhere({ citation: "8 U.S.C. § 1225" });
    expect(where).toBe(" WHERE citation = '8 U.S.C. § 1225'");
  });

  it("escapes single quotes in citation too", () => {
    const where = buildUscFilterWhere({ citation: "a'b" });
    expect(where).toContain("citation = 'a''b'");
  });

  it("uses ILIKE for heading substring search", () => {
    const where = buildUscFilterWhere({ heading: "Inspection" });
    expect(where).toContain("heading ILIKE '%Inspection%'");
  });

  it("filters by positive-law status when explicitly set", () => {
    expect(buildUscFilterWhere({ positiveLaw: true })).toBe(" WHERE is_positive_law = true");
    expect(buildUscFilterWhere({ positiveLaw: false })).toBe(" WHERE is_positive_law = false");
  });

  it("omits the positive-law clause when the field is undefined", () => {
    // Distinguish "not selected" from "selected as false".
    expect(buildUscFilterWhere({})).not.toContain("is_positive_law");
  });

  it("filters by status with quote escaping", () => {
    expect(buildUscFilterWhere({ status: "active" })).toContain("status = 'active'");
    expect(buildUscFilterWhere({ status: "a'b" })).toContain("status = 'a''b'");
  });

  it("AND-joins multiple axes (FTS + title + positive-law)", () => {
    const where = buildUscFilterWhere({
      search: "habeas",
      title: 28,
      positiveLaw: true,
    });
    expect(where.startsWith(" WHERE ")).toBe(true);
    expect(where).toContain("fts @@");
    expect(where).toContain("title_num = 28");
    expect(where).toContain("is_positive_law = true");
    // Three predicates separated by AND.
    expect((where.match(/ AND /g) || []).length).toBe(2);
  });
});

// ============================================================================
// buildCfrFilterWhere — parallels the USC builder but for CFR regulations.
// CFR has its own axes (reserved boolean replaces USC's positive-law toggle,
// adds a `part` filter for the CFR hierarchy, drops the status enum), so
// the test surface mirrors that.
// ============================================================================
describe("buildCfrFilterWhere", () => {
  it("returns an empty string when no fields are provided", () => {
    expect(buildCfrFilterWhere({})).toBe("");
  });

  it("produces an FTS predicate for `search` with single-quote escaping", () => {
    const where = buildCfrFilterWhere({ search: "O'Brien" });
    expect(where).toContain("websearch_to_tsquery('english', 'O''Brien')");
  });

  it("filters by exact title number and rejects non-finite values", () => {
    expect(buildCfrFilterWhere({ title: 45 })).toBe(" WHERE title_num = 45");
    expect(buildCfrFilterWhere({ title: NaN })).toBe("");
    expect(buildCfrFilterWhere({ title: "not-a-number" })).toBe("");
  });

  it("supports the canonical-citation lookup path", () => {
    expect(buildCfrFilterWhere({ citation: "45 CFR § 164.502" })).toBe(
      " WHERE citation = '45 CFR § 164.502'",
    );
  });

  it("escapes single quotes in citation", () => {
    expect(buildCfrFilterWhere({ citation: "a'b" })).toContain(
      "citation = 'a''b'",
    );
  });

  it("uses ILIKE for heading substring search", () => {
    expect(buildCfrFilterWhere({ heading: "Privacy" })).toContain(
      "heading ILIKE '%Privacy%'",
    );
  });

  it("filters by the CFR `part` field (exact match)", () => {
    expect(buildCfrFilterWhere({ part: "164" })).toBe(" WHERE part = '164'");
  });

  it("filters by reserved status when explicitly set", () => {
    expect(buildCfrFilterWhere({ reserved: true })).toBe(" WHERE reserved = true");
    expect(buildCfrFilterWhere({ reserved: false })).toBe(" WHERE reserved = false");
  });

  it("omits the reserved clause when the field is undefined", () => {
    // The default (no filter) includes both reserved + non-reserved.
    expect(buildCfrFilterWhere({})).not.toContain("reserved");
  });

  it("AND-joins multiple axes (FTS + title + part + reserved)", () => {
    const where = buildCfrFilterWhere({
      search: "privacy",
      title: 45,
      part: "164",
      reserved: false,
    });
    expect(where.startsWith(" WHERE ")).toBe(true);
    expect(where).toContain("fts @@");
    expect(where).toContain("title_num = 45");
    expect(where).toContain("part = '164'");
    expect(where).toContain("reserved = false");
    // Four predicates separated by three ANDs.
    expect((where.match(/ AND /g) || []).length).toBe(3);
  });
});

// ============================================================================
// buildOlcFilterWhere — OLC opinions filter. Axes are corpus-shaped:
// title/author substrings (since records often have null author), source
// (DOJ-published vs Knight FOIA), date range, OCR quality. The date-range
// surface is the first one in any spoke that takes ISO YYYY-MM-DD bounds,
// so tests cover the validation regex too.
// ============================================================================
describe("buildOlcFilterWhere", () => {
  it("returns an empty string when no fields are provided", () => {
    expect(buildOlcFilterWhere({})).toBe("");
  });

  it("supports FTS with single-quote escaping", () => {
    expect(buildOlcFilterWhere({ search: "executive privilege" })).toContain(
      "websearch_to_tsquery('english', 'executive privilege')",
    );
    expect(buildOlcFilterWhere({ search: "O'Brien" })).toContain(
      "websearch_to_tsquery('english', 'O''Brien')",
    );
  });

  it("uses ILIKE substring search for title and author", () => {
    expect(buildOlcFilterWhere({ title: "Constitutionality" })).toContain(
      "title ILIKE '%Constitutionality%'",
    );
    expect(buildOlcFilterWhere({ author: "Olson" })).toContain(
      "author ILIKE '%Olson%'",
    );
  });

  it("filters by source with exact match", () => {
    expect(buildOlcFilterWhere({ source: "doj-published" })).toContain(
      "source = 'doj-published'",
    );
    expect(buildOlcFilterWhere({ source: "knight-foia" })).toContain(
      "source = 'knight-foia'",
    );
  });

  it("accepts ISO YYYY-MM-DD date bounds", () => {
    const w = buildOlcFilterWhere({ from: "2020-01-01", to: "2025-12-31" });
    expect(w).toContain("date_issued >= '2020-01-01'");
    expect(w).toContain("date_issued <= '2025-12-31'");
  });

  it("rejects malformed dates silently", () => {
    // Without strict validation this would land in the SQL and either error
    // or — worse — open an injection vector.
    expect(buildOlcFilterWhere({ from: "not-a-date" })).toBe("");
    expect(buildOlcFilterWhere({ from: "2025/01/01" })).toBe("");
    expect(buildOlcFilterWhere({ from: "2025-1-1" })).toBe("");
    expect(buildOlcFilterWhere({ to: "2025-01" })).toBe("");
  });

  it("filters by OCR quality with exact match", () => {
    expect(buildOlcFilterWhere({ ocrQuality: "clean" })).toContain(
      "ocr_quality = 'clean'",
    );
    expect(buildOlcFilterWhere({ ocrQuality: "degraded" })).toContain(
      "ocr_quality = 'degraded'",
    );
  });

  it("AND-joins multiple axes (FTS + source + date range + ocr_quality)", () => {
    const w = buildOlcFilterWhere({
      search: "habeas",
      source: "doj-published",
      from: "2010-01-01",
      ocrQuality: "clean",
    });
    expect(w.startsWith(" WHERE ")).toBe(true);
    expect(w).toContain("fts @@");
    expect(w).toContain("source = 'doj-published'");
    expect(w).toContain("date_issued >= '2010-01-01'");
    expect(w).toContain("ocr_quality = 'clean'");
    // Four predicates separated by three ANDs.
    expect((w.match(/ AND /g) || []).length).toBe(3);
  });
});

// ============================================================================
// buildFrusFilterWhere — FRUS documents filter. Axes mostly parallel OLC's
// (title/FTS/classification/date range/place substring) plus FRUS-specific
// volume_id exact match and a sub_series join through frus_volumes. The
// sub_series rendering as a subquery is the only structural delta from the
// other filter builders.
// ============================================================================
describe("buildFrusFilterWhere", () => {
  it("returns an empty string when no fields are provided", () => {
    expect(buildFrusFilterWhere({})).toBe("");
  });

  it("supports FTS + ILIKE title with quote escaping", () => {
    expect(buildFrusFilterWhere({ search: "Cuban missile" })).toContain(
      "websearch_to_tsquery('english', 'Cuban missile')",
    );
    expect(buildFrusFilterWhere({ title: "Memorandum" })).toContain(
      "title ILIKE '%Memorandum%'",
    );
    expect(buildFrusFilterWhere({ search: "O'Brien" })).toContain(
      "websearch_to_tsquery('english', 'O''Brien')",
    );
  });

  it("filters by exact volume_id", () => {
    expect(buildFrusFilterWhere({ volumeId: "frus1969-76v01" })).toBe(
      " WHERE volume_id = 'frus1969-76v01'",
    );
  });

  it("joins frus_volumes for sub_series filtering", () => {
    const w = buildFrusFilterWhere({ subSeries: "1969-1976" });
    expect(w).toContain(
      "volume_id IN (SELECT volume_id FROM frus_volumes WHERE sub_series = '1969-1976')",
    );
  });

  it("filters by classification exact match", () => {
    expect(buildFrusFilterWhere({ classification: "Top Secret" })).toContain(
      "classification = 'Top Secret'",
    );
  });

  it("accepts ISO YYYY-MM-DD date_date bounds", () => {
    const w = buildFrusFilterWhere({ from: "1962-10-01", to: "1962-10-31" });
    expect(w).toContain("doc_date >= '1962-10-01'");
    expect(w).toContain("doc_date <= '1962-10-31'");
  });

  it("rejects malformed dates silently", () => {
    expect(buildFrusFilterWhere({ from: "not-a-date" })).toBe("");
    expect(buildFrusFilterWhere({ to: "1962/10/01" })).toBe("");
  });

  it("uses ILIKE substring for place_name", () => {
    expect(buildFrusFilterWhere({ place: "Havana" })).toContain(
      "place_name ILIKE '%Havana%'",
    );
  });

  it("AND-joins multiple axes (FTS + sub_series + classification + date)", () => {
    const w = buildFrusFilterWhere({
      search: "Khrushchev",
      subSeries: "1961-1963",
      classification: "Secret",
      from: "1962-01-01",
    });
    expect(w.startsWith(" WHERE ")).toBe(true);
    expect(w).toContain("fts @@");
    expect(w).toContain("volume_id IN (SELECT volume_id FROM frus_volumes WHERE sub_series = '1961-1963')");
    expect(w).toContain("classification = 'Secret'");
    expect(w).toContain("doc_date >= '1962-01-01'");
    // Four predicates separated by three ANDs.
    expect((w.match(/ AND /g) || []).length).toBe(3);
  });
});

// ============================================================================
// OLC AI modes (PR 4q) — narrative synthesis (plan/execute) + summarize-one.
//
// The worker passes LLM-generated JSON through validators before letting it
// drive billing or downstream queries. These tests pin the validators so a
// malformed model response can't bypass the schema (e.g. forge an
// estimated_cost_cents that bypasses pre-flight, or claim opinion ids that
// were never returned).
// ============================================================================

describe("normalizeOlcScope", () => {
  it("treats missing / undefined scope as full-corpus", () => {
    const s = normalizeOlcScope(undefined);
    expect(s.is_full_db).toBe(true);
    expect(s.opinion_ids).toBe(null);
    expect(s.count).toBe(0);
  });

  it("treats empty opinion_ids as full-corpus (so the executor doesn't IN ())", () => {
    const s = normalizeOlcScope({ opinion_ids: [] });
    expect(s.is_full_db).toBe(true);
    expect(s.opinion_ids).toBe(null);
  });

  it("keeps a valid numeric opinion_ids list and computes count", () => {
    const s = normalizeOlcScope({ opinion_ids: [1, 2, 3] });
    expect(s.is_full_db).toBe(false);
    expect(s.opinion_ids).toEqual([1, 2, 3]);
    expect(s.count).toBe(3);
  });

  it("drops non-finite values from opinion_ids without throwing", () => {
    const s = normalizeOlcScope({ opinion_ids: [1, "x", null, 2, NaN, "3"] });
    // Number("x") = NaN (dropped), Number("3") = 3 (kept). Belt-and-suspenders.
    expect(s.opinion_ids).toEqual([1, 2, 3]);
  });

  it("honors caller-supplied count + description", () => {
    const s = normalizeOlcScope({
      opinion_ids: [1, 2, 3],
      count: 3,
      description: "3 Obama-era opinions"
    });
    expect(s.description).toBe("3 Obama-era opinions");
  });
});

describe("parseOlcPlan", () => {
  const validPlan = JSON.stringify({
    output_mode: "narrative",
    approach_summary: "Pull OLC opinions on X by date.",
    candor_notes: ["author/recipient/president are not populated."],
    queries: [{ label: "by date", sql: "SELECT id, title FROM olc_opinions WHERE fts @@ websearch_to_tsquery('english', 'X')" }],
    estimated_cost_cents: 8,
    wants_synthesis: true
  });

  it("accepts a well-formed plan", () => {
    const p = parseOlcPlan(validPlan);
    expect(p.output_mode).toBe("narrative");
    expect(p.queries).toHaveLength(1);
    expect(p.estimated_cost_cents).toBe(8);
  });

  it("strips code fences before parsing", () => {
    const fenced = "```json\n" + validPlan + "\n```";
    expect(parseOlcPlan(fenced).output_mode).toBe("narrative");
  });

  it("rejects an unknown output_mode", () => {
    const bad = JSON.stringify({ output_mode: "graph", queries: [] });
    expect(() => parseOlcPlan(bad)).toThrow(/output_mode/);
  });

  it("rejects non-array queries", () => {
    const bad = JSON.stringify({ output_mode: "narrative", queries: "SELECT 1" });
    expect(() => parseOlcPlan(bad)).toThrow(/queries must be an array/);
  });

  it("rejects a top-level array (only objects allowed)", () => {
    expect(() => parseOlcPlan("[1,2,3]")).toThrow(/top-level value is not an object/);
  });

  it("coerces estimated_cost_cents to a non-negative integer", () => {
    const negative = JSON.stringify({
      output_mode: "narrative",
      queries: [],
      estimated_cost_cents: -50
    });
    expect(parseOlcPlan(negative).estimated_cost_cents).toBe(0);
  });

  it("defaults candor_notes to [] when missing", () => {
    const noNotes = JSON.stringify({ output_mode: "narrative", queries: [] });
    expect(parseOlcPlan(noNotes).candor_notes).toEqual([]);
  });
});

describe("parseOlcSynthesis", () => {
  it("accepts a list-mode synthesis with valid opinion_ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "OLC has opined on X in [olc-ref:42].",
      opinion_ids: [42, 73],
      candor_notes: []
    });
    const s = parseOlcSynthesis(raw, "list");
    expect(s.opinion_ids).toEqual([42, 73]);
    expect(s.answer_markdown).toMatch(/olc-ref:42/);
  });

  it("rejects empty answer_markdown", () => {
    const raw = JSON.stringify({ answer_markdown: "  ", opinion_ids: [] });
    expect(() => parseOlcSynthesis(raw, "narrative")).toThrow(/answer_markdown is empty/);
  });

  it("downgrades to narrative + candor note when list mode returns no opinion_ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "No opinions matched the criterion.",
      opinion_ids: [],
      candor_notes: []
    });
    const s = parseOlcSynthesis(raw, "list");
    expect(s.opinion_ids).toEqual([]);
    expect(s.candor_notes.join(" ")).toMatch(/returned none/);
  });

  it("forces opinion_ids = null on narrative output_mode regardless of model output", () => {
    const raw = JSON.stringify({
      answer_markdown: "Narrative-only answer.",
      opinion_ids: [1, 2, 3], // model returned ids even though mode is narrative
      candor_notes: []
    });
    const s = parseOlcSynthesis(raw, "narrative");
    expect(s.opinion_ids).toBe(null);
  });

  it("coerces opinion_ids strings to numbers and drops non-finite values", () => {
    const raw = JSON.stringify({
      answer_markdown: "x",
      opinion_ids: ["42", 7, "not-a-number", null, 11.5],
      candor_notes: []
    });
    const s = parseOlcSynthesis(raw, "list");
    // 11.5 is finite — kept (the model shouldn't emit decimal ids, but parse
    // should not silently truncate; reality is the DB query will return nothing
    // and the UI will surface the empty page).
    expect(s.opinion_ids).toEqual([42, 7, 11.5]);
  });
});

describe("buildOlcPlanningUser", () => {
  it("describes the full-corpus scope and tells the planner to use olc_opinions", () => {
    const msg = buildOlcPlanningUser("Has OLC opined on X?", normalizeOlcScope(undefined));
    expect(msg).toMatch(/full corpus/i);
    expect(msg).toMatch(/olc_opinions/);
    expect(msg).not.toMatch(/scoped_olc_opinions/);
  });

  it("describes a narrowed scope and tells the planner to use scoped_olc_opinions", () => {
    const msg = buildOlcPlanningUser(
      "Across these opinions, what does OLC say about X?",
      normalizeOlcScope({ opinion_ids: [1, 2, 3], count: 3 })
    );
    expect(msg).toMatch(/3 opinion_ids/);
    expect(msg).toMatch(/scoped_olc_opinions/);
  });
});

describe("buildOlcSummarizeUser", () => {
  const opinion = {
    title: "Authority of the President to Recess-Appoint X",
    date_issued: "1987-03-15",
    author: null,
    recipient: null,
    source: "doj-published",
    ocr_quality: "clean",
    summary: "OLC concluded the President may make such appointments.",
    text_content: "I. Introduction. The question presented is whether..."
  };

  it("includes metadata and full text when not truncated", () => {
    const u = buildOlcSummarizeUser(opinion, false);
    expect(u).toMatch(/Authority of the President/);
    expect(u).toMatch(/1987-03-15/);
    expect(u).toMatch(/EDITORIAL SUMMARY/);
    expect(u).toMatch(/I\. Introduction\./);
    expect(u).not.toMatch(/TRUNCATED/);
  });

  it("truncates text and flags it when wasTruncated=true", () => {
    const huge = { ...opinion, text_content: "x".repeat(OLC_SUMMARIZE_TEXT_CAP + 1000) };
    const u = buildOlcSummarizeUser(huge, true);
    expect(u).toMatch(/TRUNCATED to/);
    // The truncated payload should be exactly the cap (plus the surrounding
    // header/footer text) — verify the appended text section length is the cap.
    const textStart = u.indexOf("OPINION TEXT");
    const textBlock = u.slice(textStart);
    // textBlock contains the header line + newline + truncated content + footer.
    // The number of "x" characters in it should equal OLC_SUMMARIZE_TEXT_CAP.
    const xCount = (textBlock.match(/x/g) || []).length;
    expect(xCount).toBe(OLC_SUMMARIZE_TEXT_CAP);
  });

  it("handles null author/recipient/summary gracefully (the OLC v1 reality)", () => {
    const sparse = {
      title: "Untitled OLC Memo",
      date_issued: null,
      author: null,
      recipient: null,
      source: null,
      ocr_quality: null,
      summary: null,
      text_content: "Body."
    };
    const u = buildOlcSummarizeUser(sparse, false);
    expect(u).toMatch(/not populated/);
    expect(u).not.toMatch(/EDITORIAL SUMMARY/);
  });
});

describe("parseOlcSummary", () => {
  it("accepts a well-formed summary", () => {
    const raw = JSON.stringify({
      summary_markdown: "**Question presented.** ...",
      candor_notes: []
    });
    const s = parseOlcSummary(raw);
    expect(s.summary_markdown).toMatch(/Question presented/);
    expect(s.candor_notes).toEqual([]);
  });

  it("rejects empty summary_markdown", () => {
    const raw = JSON.stringify({ summary_markdown: "  ", candor_notes: [] });
    expect(() => parseOlcSummary(raw)).toThrow(/summary_markdown is empty/);
  });

  it("strips code fences before parsing", () => {
    const fenced = "```json\n" + JSON.stringify({ summary_markdown: "x", candor_notes: [] }) + "\n```";
    expect(parseOlcSummary(fenced).summary_markdown).toBe("x");
  });

  it("defaults candor_notes to [] when missing", () => {
    const raw = JSON.stringify({ summary_markdown: "x" });
    expect(parseOlcSummary(raw).candor_notes).toEqual([]);
  });

  it("rejects a top-level array", () => {
    expect(() => parseOlcSummary("[1,2,3]")).toThrow(/top-level value is not an object/);
  });
});

// ============================================================================
// FRUS AI modes (PR 4r) — narrative synthesis (plan/execute, with hybrid +
// list output modes covering the three asymmetric flagships) + summarize-one.
//
// Same validator discipline as OLC. The FRUS-distinctive surface area:
//   - executor enforces FRUS_SCOPE_LITERAL_LIMIT (corpus is 314K so scope
//     can plausibly exceed the inline cap; OLC's 2K corpus can't);
//   - summarize builder folds in volume metadata, classification, persons,
//     and FRUS editorial footnotes — none of which OLC has.
// ============================================================================

describe("normalizeFrusScope", () => {
  it("treats missing scope as full-corpus", () => {
    const s = normalizeFrusScope(undefined);
    expect(s.is_full_db).toBe(true);
    expect(s.document_ids).toBe(null);
  });

  it("treats empty document_ids as full-corpus", () => {
    const s = normalizeFrusScope({ document_ids: [] });
    expect(s.is_full_db).toBe(true);
    expect(s.document_ids).toBe(null);
  });

  it("keeps a valid numeric document_ids list", () => {
    const s = normalizeFrusScope({ document_ids: [10, 20, 30] });
    expect(s.is_full_db).toBe(false);
    expect(s.document_ids).toEqual([10, 20, 30]);
    expect(s.count).toBe(3);
  });

  it("drops nullish + non-finite values", () => {
    const s = normalizeFrusScope({ document_ids: [1, null, "x", 2, undefined, NaN, "3"] });
    expect(s.document_ids).toEqual([1, 2, 3]);
  });
});

describe("parseFrusPlan", () => {
  const validPlan = JSON.stringify({
    output_mode: "narrative",
    approach_summary: "Pull docs about the Cuban Missile Crisis chronologically.",
    candor_notes: ["Date range 1962-09 through 1962-12; persons jsonb queried for Kennedy and Khrushchev."],
    queries: [{
      label: "missile crisis docs by date",
      sql: "SELECT id, title, doc_date, place_name, classification FROM frus_documents WHERE fts @@ websearch_to_tsquery('english', 'Cuba missile') AND doc_date BETWEEN '1962-09-01' AND '1962-12-31' ORDER BY doc_date ASC LIMIT 200"
    }],
    estimated_cost_cents: 12,
    wants_synthesis: true
  });

  it("accepts a well-formed plan", () => {
    const p = parseFrusPlan(validPlan);
    expect(p.output_mode).toBe("narrative");
    expect(p.queries).toHaveLength(1);
  });

  it("strips code fences", () => {
    const fenced = "```json\n" + validPlan + "\n```";
    expect(parseFrusPlan(fenced).output_mode).toBe("narrative");
  });

  it("rejects an unknown output_mode", () => {
    const bad = JSON.stringify({ output_mode: "timeline", queries: [] });
    expect(() => parseFrusPlan(bad)).toThrow(/output_mode/);
  });

  it("rejects non-array queries", () => {
    const bad = JSON.stringify({ output_mode: "hybrid", queries: "SELECT 1" });
    expect(() => parseFrusPlan(bad)).toThrow(/queries must be an array/);
  });

  it("coerces estimated_cost_cents to non-negative", () => {
    const negative = JSON.stringify({ output_mode: "list", queries: [], estimated_cost_cents: -10 });
    expect(parseFrusPlan(negative).estimated_cost_cents).toBe(0);
  });
});

describe("parseFrusSynthesis", () => {
  it("accepts a hybrid synthesis with document_ids and citations", () => {
    const raw = JSON.stringify({
      answer_markdown: "Yes — see the [frus-ref:101] cable.",
      document_ids: [101, 202],
      candor_notes: []
    });
    const s = parseFrusSynthesis(raw, "hybrid");
    expect(s.document_ids).toEqual([101, 202]);
    expect(s.answer_markdown).toMatch(/frus-ref:101/);
  });

  it("forces document_ids = null for narrative mode regardless of model output", () => {
    const raw = JSON.stringify({
      answer_markdown: "Narrative answer.",
      document_ids: [1, 2, 3], // model returned ids even though mode is narrative
      candor_notes: []
    });
    const s = parseFrusSynthesis(raw, "narrative");
    expect(s.document_ids).toBe(null);
  });

  it("downgrades empty list/hybrid to narrative with a candor note", () => {
    const raw = JSON.stringify({
      answer_markdown: "No matching documents.",
      document_ids: [],
      candor_notes: []
    });
    const s = parseFrusSynthesis(raw, "list");
    expect(s.document_ids).toEqual([]);
    expect(s.candor_notes.join(" ")).toMatch(/returned none/);
  });

  it("drops nullish ids before Number conversion", () => {
    const raw = JSON.stringify({
      answer_markdown: "x",
      document_ids: ["42", null, 7, undefined, "not-a-number"],
      candor_notes: []
    });
    const s = parseFrusSynthesis(raw, "list");
    expect(s.document_ids).toEqual([42, 7]);
  });

  it("rejects empty answer_markdown", () => {
    const raw = JSON.stringify({ answer_markdown: "  ", document_ids: [] });
    expect(() => parseFrusSynthesis(raw, "narrative")).toThrow(/answer_markdown is empty/);
  });
});

describe("buildFrusPlanningUser", () => {
  it("describes the full-corpus scope and uses frus_documents", () => {
    const msg = buildFrusPlanningUser("Has the US ever invaded Iran?", normalizeFrusScope(undefined));
    expect(msg).toMatch(/full corpus/i);
    expect(msg).toMatch(/frus_documents/);
    expect(msg).not.toMatch(/scoped_frus_documents/);
  });

  it("describes a narrowed scope and uses scoped_frus_documents", () => {
    const msg = buildFrusPlanningUser(
      "Within these docs, what was said about Berlin?",
      normalizeFrusScope({ document_ids: [1, 2, 3], count: 3 })
    );
    expect(msg).toMatch(/3 document_ids/);
    expect(msg).toMatch(/scoped_frus_documents/);
    expect(msg).toMatch(/frus_volumes is still available/);
  });
});

describe("buildFrusSummarizeUser", () => {
  const doc = {
    title: "Memorandum of Conversation, Acheson and Lloyd",
    doc_date: "1958-10-17",
    place_name: "London",
    classification: "Secret",
    volume_title: "FRUS 1958-1960, Vol. XV",
    doc_number: "138",
    persons: [{ name: "Acheson" }, { name: "Lloyd" }, { name: "Eisenhower" }],
    text_content: "I. The Secretary opened by noting...",
    footnotes: [{ ref: "n1", text: "Source: NARA RG 59." }]
  };

  it("surfaces volume + classification + persons + footnotes in the prompt", () => {
    const u = buildFrusSummarizeUser(doc, false);
    expect(u).toMatch(/Memorandum of Conversation/);
    expect(u).toMatch(/1958-10-17/);
    expect(u).toMatch(/London/);
    expect(u).toMatch(/Secret/);
    expect(u).toMatch(/Vol\. XV/);
    expect(u).toMatch(/Acheson, Lloyd, Eisenhower/);
    expect(u).toMatch(/NARA RG 59/);
    expect(u).not.toMatch(/TRUNCATED/);
  });

  it("flags + truncates oversize text", () => {
    // No footnotes on this fixture — the footnotes JSON contains literal
    // `"text":` keys, which would inflate the x-count and make the cap
    // assertion brittle. Truncation-of-text_content is what's being pinned.
    const huge = { ...doc, footnotes: null, text_content: "x".repeat(FRUS_SUMMARIZE_TEXT_CAP + 1000) };
    const u = buildFrusSummarizeUser(huge, true);
    expect(u).toMatch(/TRUNCATED to/);
    const textStart = u.indexOf("DOCUMENT TEXT");
    const textBlock = u.slice(textStart);
    const xCount = (textBlock.match(/x/g) || []).length;
    expect(xCount).toBe(FRUS_SUMMARIZE_TEXT_CAP);
  });

  it("caps persons list and indicates overflow", () => {
    const many = { ...doc, persons: Array.from({ length: 50 }, (_, i) => ({ name: `Person${i}` })) };
    const u = buildFrusSummarizeUser(many, false);
    expect(u).toMatch(/Person0/);
    expect(u).toMatch(/Person39/);
    expect(u).toMatch(/\+10 more/);
  });

  it("handles missing optional metadata gracefully", () => {
    const sparse = {
      title: null,
      doc_date: null,
      place_name: null,
      classification: null,
      volume_title: null,
      volume_id: "frus1958-60v15",
      doc_number: null,
      persons: null,
      text_content: "Body.",
      footnotes: null
    };
    const u = buildFrusSummarizeUser(sparse, false);
    expect(u).toMatch(/no title/);
    expect(u).toMatch(/frus1958-60v15/);
    expect(u).not.toMatch(/Persons \(TEI-extracted\)/);
    expect(u).not.toMatch(/FOOTNOTES/);
  });
});

describe("parseFrusSummary", () => {
  it("accepts a well-formed summary", () => {
    const raw = JSON.stringify({
      summary_markdown: "**Provenance.** ...",
      candor_notes: []
    });
    const s = parseFrusSummary(raw);
    expect(s.summary_markdown).toMatch(/Provenance/);
  });

  it("rejects empty summary_markdown", () => {
    const raw = JSON.stringify({ summary_markdown: " ", candor_notes: [] });
    expect(() => parseFrusSummary(raw)).toThrow(/summary_markdown is empty/);
  });

  it("defaults candor_notes to []", () => {
    const raw = JSON.stringify({ summary_markdown: "x" });
    expect(parseFrusSummary(raw).candor_notes).toEqual([]);
  });

  it("strips code fences", () => {
    const fenced = "```json\n" + JSON.stringify({ summary_markdown: "x", candor_notes: [] }) + "\n```";
    expect(parseFrusSummary(fenced).summary_markdown).toBe("x");
  });
});

describe("executeFrusPlan scope cap", () => {
  it("refuses scopes above FRUS_SCOPE_LITERAL_LIMIT with a clear error", async () => {
    const oversize = Array.from({ length: FRUS_SCOPE_LITERAL_LIMIT + 1 }, (_, i) => i + 1);
    const scope = normalizeFrusScope({ document_ids: oversize });
    const plan = { queries: [{ label: "x", sql: "SELECT 1 FROM scoped_frus_documents" }] };
    // env is unused — the cap check fires before any DB call.
    await expect(executeFrusPlan({}, plan, scope)).rejects.toThrow(/too large to inline/);
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
// checkIpRateLimit — per-IP request/min ceiling shared by all corpus endpoints.
// Bounds anonymous abuse on the public surface. Authed users (valid Supabase
// JWT) bypass the cap: signed-in users are already bounded by the per-account
// cap on the paid path, and the legitimate parallel flows (e.g. Read fires
// 4 parallel batches) would otherwise blow past 10/min on the first big action.
// ============================================================================
describe("checkIpRateLimit", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockKV(initial = {}) {
    const store = { ...initial };
    return {
      store,
      get: vi.fn(async (k) => (k in store ? store[k] : null)),
      put: vi.fn(async (k, v) => { store[k] = v; })
    };
  }
  const ctx = { waitUntil: (p) => p };
  function reqFrom(ip, headers = {}) {
    return new Request("https://w.test/x", {
      method: "POST",
      headers: { "CF-Connecting-IP": ip, ...headers }
    });
  }
  // Build a real ES256-signed JWT + matching JWKS payload. verifyJwt does real
  // ECDSA crypto, so a fake signature won't bypass — we need a working keypair.
  async function makeSignedJwt({ sub = "u-authed", exp = Math.floor(Date.now() / 1000) + 3600, kid = "test-kid" } = {}) {
    const { publicKey, privateKey } = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
    );
    const jwkPub = await crypto.subtle.exportKey("jwk", publicKey);
    jwkPub.kid = kid; jwkPub.use = "sig"; jwkPub.alg = "ES256";
    const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const header = { alg: "ES256", kid, typ: "JWT" };
    const payload = { sub, exp };
    const signingInput = `${b64u(header)}.${b64u(payload)}`;
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      privateKey,
      new TextEncoder().encode(signingInput)
    );
    const sigB64 = Buffer.from(sig).toString("base64url");
    return { token: `${signingInput}.${sigB64}`, jwk: jwkPub };
  }
  // Stub fetch to serve a JWKS payload at any Supabase JWKS URL. Each test uses
  // a unique SUPABASE_URL so the module-level jwksCache misses cleanly.
  function stubJwks(jwk) {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).endsWith("/auth/v1/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("not stubbed", { status: 500 });
    }));
  }

  it("allows and increments the per-minute counter when under the cap (anonymous)", async () => {
    const QUOTA = mockKV();
    const res = await checkIpRateLimit(reqFrom("1.1.1.1"), { QUOTA }, ctx);
    expect(res).toBeNull();
    // One KV write was scheduled for the per-minute counter.
    expect(QUOTA.put).toHaveBeenCalledTimes(1);
    const [key, val] = QUOTA.put.mock.calls[0];
    expect(key).toMatch(/^ip:1\.1\.1\.1:\d{12}$/);
    expect(val).toBe("1");
  });

  it("returns 429 at the cap (anonymous)", async () => {
    // Find the current minute key the function will use and pre-load it at 10.
    const ip = "2.2.2.2";
    const QUOTA = mockKV();
    // Seed every minute-key for the IP at the cap via a synthetic store hit.
    QUOTA.get = vi.fn(async (k) => (k.startsWith(`ip:${ip}:`) ? "10" : null));
    const res = await checkIpRateLimit(reqFrom(ip), { QUOTA }, ctx);
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
    const payload = await res.json();
    expect(payload.error.message).toMatch(/Rate limit exceeded/);
    // Does not increment past the cap.
    expect(QUOTA.put).not.toHaveBeenCalled();
  });

  it("bypasses the cap for a request with a valid JWT", async () => {
    const ip = "3.3.3.3";
    const { token, jwk } = await makeSignedJwt({ sub: "authed-user" });
    stubJwks(jwk);
    const QUOTA = mockKV();
    // Pre-load over the cap; bypass should still let it through.
    QUOTA.get = vi.fn(async (k) => (k.startsWith(`ip:${ip}:`) ? "99" : null));
    const env = { QUOTA, SUPABASE_URL: "https://supa-bypass.test" };
    const res = await checkIpRateLimit(
      reqFrom(ip, { Authorization: `Bearer ${token}` }),
      env, ctx
    );
    expect(res).toBeNull();
    // Bypass means we never read or wrote the IP counter.
    expect(QUOTA.get).not.toHaveBeenCalled();
    expect(QUOTA.put).not.toHaveBeenCalled();
  });

  it("bypasses the cap when a valid JWT is in X-Session-Token (demo/BYOK signed-in path)", async () => {
    // demo/BYOK requests carry their credential in the body (password /
    // user_api_key) and therefore can't put the JWT in Authorization without
    // changing auth resolution. They advertise the session via X-Session-Token
    // instead, which the Worker honors ONLY for anti-abuse bypass.
    const ip = "5.5.5.5";
    const { token, jwk } = await makeSignedJwt({ sub: "demo-signed-in", kid: "k-demo" });
    stubJwks(jwk);
    const QUOTA = mockKV();
    QUOTA.get = vi.fn(async (k) => (k.startsWith(`ip:${ip}:`) ? "99" : null));
    const env = { QUOTA, SUPABASE_URL: "https://supa-xsession.test" };
    const res = await checkIpRateLimit(
      reqFrom(ip, { "X-Session-Token": token }),
      env, ctx
    );
    expect(res).toBeNull();
    expect(QUOTA.get).not.toHaveBeenCalled();
    expect(QUOTA.put).not.toHaveBeenCalled();
  });

  it("does NOT bypass when X-Session-Token is bogus (invalid JWT → IP cap still applies)", async () => {
    const ip = "6.6.6.6";
    const QUOTA = mockKV();
    QUOTA.get = vi.fn(async (k) => (k.startsWith(`ip:${ip}:`) ? "10" : null));
    const env = { QUOTA, SUPABASE_URL: "https://supa-bogus-xst.test" };
    const res = await checkIpRateLimit(
      reqFrom(ip, { "X-Session-Token": "not.a.valid.jwt" }),
      env, ctx
    );
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
  });

  it("does NOT bypass when the Authorization header is bogus (invalid JWT → IP cap still applies)", async () => {
    const ip = "4.4.4.4";
    // No fetch stub: if verifyJwt did try to resolve a JWK it would fail. But
    // the token is malformed (only two segments), so verifyJwt rejects before
    // any crypto / JWKS fetch.
    const QUOTA = mockKV();
    QUOTA.get = vi.fn(async (k) => (k.startsWith(`ip:${ip}:`) ? "10" : null));
    const env = { QUOTA, SUPABASE_URL: "https://supa-nobypass.test" };
    const res = await checkIpRateLimit(
      reqFrom(ip, { Authorization: "Bearer not.a.valid.jwt" }),
      env, ctx
    );
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
  });
});

// ============================================================================
// withStatementTimeoutRetry — wraps a corpus query call with one retry when
// Postgres returns 57014 (canceling statement due to statement_timeout). Models
// the empirically-observed "fails first, succeeds second" cold-buffer-cache
// pattern on the FTS GIN index. Only retries on 57014 — every other error
// passes through immediately.
// ============================================================================
describe("withStatementTimeoutRetry", () => {
  it("returns the value when fn succeeds first try (no retry)", async () => {
    const fn = vi.fn(async () => ["ok"]);
    const out = await withStatementTimeoutRetry(fn);
    expect(out).toEqual(["ok"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on 57014 and returns the second-call value", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error('run_query 500: {"code":"57014","message":"canceling statement due to statement timeout"}');
      return [{ cl_id: 42 }];
    });
    const out = await withStatementTimeoutRetry(fn);
    expect(out).toEqual([{ cl_id: 42 }]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("re-throws the last error when both attempts time out", async () => {
    const fn = vi.fn(async () => {
      throw new Error('run_query 500: {"code":"57014","message":"canceling statement due to statement timeout"}');
    });
    await expect(withStatementTimeoutRetry(fn)).rejects.toThrow(/57014/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on non-57014 errors (e.g. syntax error, permission denied)", async () => {
    const fn = vi.fn(async () => {
      throw new Error('run_query 400: {"code":"42601","message":"syntax error at or near \\"FORM\\""}');
    });
    await expect(withStatementTimeoutRetry(fn)).rejects.toThrow(/42601/);
    expect(fn).toHaveBeenCalledTimes(1);
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
