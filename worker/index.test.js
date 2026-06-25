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
  buildLawfareFilterWhere,
  corsHeaders,
  buildUsageLogSuccessRow,
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
  buildPlanningSystem,
  buildUscPlanningSystem,
  buildCfrPlanningSystem,
  buildOlcPlanningSystem,
  buildLawfarePlanningSystem,
  buildFrusPlanningSystem,
  withStatementTimeoutRetry,
  supabaseGetAccount,
  verifyJwt,
  pipelineStaleness,
  livenessAlertDecision,
  humanDuration,
  LIVENESS_BACKOFF_MIN,
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
  buildPresidentialFilterWhere,
  normalizePresidentialScope,
  parsePresidentialPlan,
  parsePresidentialSynthesis,
  parsePresidentialSummary,
  buildPresidentialPlanningUser,
  buildPresidentialPlanningSystem,
  buildPresidentialSummarizeUser,
  PRESIDENTIAL_SUMMARIZE_TEXT_CAP,
  buildHubQueriesPresidential,
  buildClemencyFilterWhere,
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
  SEMANTIC_CORPORA,
  parseSemanticSearchRequest,
  vecLiteral,
  stripChunkHeader,
  rrfFuse,
  buildSemanticMetaSql,
  ITEMS_BY_IDS_CAP,
  parseItemsByIdsRequest,
  buildItemsByIdsSql,
  salvageTruncatedSynthesis,
  buildSalvagedSynthesis,
  parseOlcSynthesis,
  parseFrusSynthesis,
  parseUscSynthesis,
  parseCfrSynthesis,
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
  usageLogAuthorized,
  usageLoggingAllowed,
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
  const prodEnv = { APP_BASE_URL: "https://ragtime.lawfaremedia.org" };

  it("falls back to APP_BASE_URL when no request is provided", () => {
    expect(pickCheckoutReturnOrigin(undefined, prodEnv)).toBe(
      "https://ragtime.lawfaremedia.org",
    );
    expect(pickCheckoutReturnOrigin("", prodEnv)).toBe(
      "https://ragtime.lawfaremedia.org",
    );
  });

  it("honors a request that matches the production origin (with path)", () => {
    expect(
      pickCheckoutReturnOrigin(
        "https://ragtime.lawfaremedia.org/",
        prodEnv,
      ),
    ).toBe("https://ragtime.lawfaremedia.org");
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
    ).toBe("https://ragtime.lawfaremedia.org");
  });

  it("rejects non-allowlisted localhost ports (only :5173)", () => {
    expect(
      pickCheckoutReturnOrigin("http://localhost:3000/", prodEnv),
    ).toBe("https://ragtime.lawfaremedia.org");
  });

  it("rejects malformed URLs", () => {
    expect(pickCheckoutReturnOrigin("not-a-url", prodEnv)).toBe(
      "https://ragtime.lawfaremedia.org",
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

  it("filters by the CFR part via the normalized part_num column (punchlist #3)", () => {
    // `part` is stored as a verbose label ("PART 164—…"), so a bare
    // `part = '164'` always returned zero rows. Scoping must hit the
    // generated part_num column instead.
    expect(buildCfrFilterWhere({ part: "164" })).toBe(" WHERE part_num = '164'");
    expect(buildCfrFilterWhere({ part: "164" })).not.toMatch(/\bpart = '/);
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
    expect(where).toContain("part_num = '164'");
    expect(where).toContain("reserved = false");
    // Four predicates separated by three ANDs.
    expect((where.match(/ AND /g) || []).length).toBe(3);
  });
});

// ============================================================================
// Structural-identifier scoping regression (punchlist #3).
// part/chapter columns store VERBOSE LABELS ("PART 160—…", "CHAPTER II—…"),
// so the planners must scope via the normalized generated part_num/chapter_num
// columns — never bare part/chapter, which silently returned zero rows and
// caused the model to emit a FALSE "corpus may be incomplete" candor note.
// These guard the AMA-path fix (the manual-filter fix is covered above).
// ============================================================================
describe("structural-identifier scoping (punchlist #3)", () => {
  const cfrSys = buildCfrPlanningSystem();
  const uscSys = buildUscPlanningSystem();

  it("CFR planner scopes parts via part_num (HIPAA + Reg Z examples)", () => {
    expect(cfrSys).toMatch(/part_num IN \('160','164'\)/);
    expect(cfrSys).toMatch(/part_num='1026'/);
  });

  it("CFR planner scopes the NEPA range via part_num BETWEEN", () => {
    expect(cfrSys).toMatch(/part_num BETWEEN '1500' AND '1508'/);
  });

  it("CFR planner routes agencies via chapter_num (Fed example)", () => {
    expect(cfrSys).toMatch(/chapter_num='II'/);
  });

  it("USC planner scopes the UCMJ chapter via chapter_num", () => {
    expect(uscSys).toMatch(/chapter_num='47'/);
  });

  it("both planners document the normalized columns in their schema", () => {
    expect(cfrSys).toContain("part_num");
    expect(cfrSys).toContain("chapter_num");
    expect(uscSys).toContain("chapter_num");
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
// buildLawfareFilterWhere — Lawfare commentary filter. Axes: q (FTS),
// author_slug / topic_slug (array @> membership), content_type, series, date
// range, and include_suppressed. The defining behavior is the DEFAULT
// exclusion of roundup digests (search_tier='suppressed') unless the caller
// opts in — the accuracy guardrail that keeps secondary tables-of-contents out
// of plain search.
// ============================================================================
describe("buildLawfareFilterWhere", () => {
  it("excludes suppressed by default even with no other fields", () => {
    expect(buildLawfareFilterWhere({})).toBe(" WHERE search_tier <> 'suppressed'");
  });

  it("includes suppressed only when include_suppressed is true", () => {
    expect(buildLawfareFilterWhere({ include_suppressed: true })).toBe("");
    // Anything other than strict true keeps the default exclusion.
    expect(buildLawfareFilterWhere({ include_suppressed: "yes" })).toBe(
      " WHERE search_tier <> 'suppressed'",
    );
    expect(buildLawfareFilterWhere({ include_suppressed: 1 })).toBe(
      " WHERE search_tier <> 'suppressed'",
    );
  });

  it("supports FTS with single-quote escaping", () => {
    expect(buildLawfareFilterWhere({ q: "executive privilege" })).toContain(
      "websearch_to_tsquery('english', 'executive privilege')",
    );
    expect(buildLawfareFilterWhere({ q: "O'Brien" })).toContain(
      "websearch_to_tsquery('english', 'O''Brien')",
    );
  });

  it("filters by author_slug and topic_slug with array membership", () => {
    expect(buildLawfareFilterWhere({ author_slug: "benjamin-wittes" })).toContain(
      "author_slugs @> ARRAY['benjamin-wittes']",
    );
    expect(buildLawfareFilterWhere({ topic_slug: "executive-power" })).toContain(
      "topic_slugs @> ARRAY['executive-power']",
    );
  });

  it("escapes single quotes in slug membership (injection guard)", () => {
    // A crafted slug must not break out of the array literal.
    const w = buildLawfareFilterWhere({ author_slug: "x') OR true OR ('" });
    expect(w).toContain("author_slugs @> ARRAY['x'') OR true OR (''']");
    expect(w).not.toContain("OR true OR ('']"); // the raw single-quote form must not survive
  });

  it("filters by author_name as a case-insensitive substring over author_names", () => {
    // The reachable path for any author outside the top-authors dropdown — and
    // resilient to the opaque slug scheme (e.g. 'alapatina' for Lapatina).
    expect(buildLawfareFilterWhere({ author_name: "Lapatina" })).toContain(
      "EXISTS (SELECT 1 FROM unnest(author_names) AS _an WHERE _an ILIKE '%Lapatina%')",
    );
  });

  it("escapes single quotes in author_name (injection guard)", () => {
    const w = buildLawfareFilterWhere({ author_name: "x%' OR '1'='1" });
    expect(w).toContain("ILIKE '%x%'' OR ''1''=''1%'");
    expect(w).not.toContain("OR '1'='1%'"); // the raw single-quote form must not survive
  });

  it("filters by content_type and series with exact match", () => {
    expect(buildLawfareFilterWhere({ content_type: "podcast" })).toContain(
      "content_type = 'podcast'",
    );
    expect(buildLawfareFilterWhere({ series: "The Lawfare Podcast" })).toContain(
      "series = 'The Lawfare Podcast'",
    );
  });

  it("accepts ISO YYYY-MM-DD date bounds on published_date", () => {
    const w = buildLawfareFilterWhere({ date_from: "2025-01-01", date_to: "2025-12-31" });
    expect(w).toContain("published_date >= '2025-01-01'");
    expect(w).toContain("published_date <= '2025-12-31'");
  });

  it("rejects malformed dates silently", () => {
    // Malformed dates drop out; only the default suppressed-exclusion remains.
    expect(buildLawfareFilterWhere({ date_from: "not-a-date" })).toBe(
      " WHERE search_tier <> 'suppressed'",
    );
    expect(buildLawfareFilterWhere({ date_to: "2025/01/01" })).toBe(
      " WHERE search_tier <> 'suppressed'",
    );
    expect(buildLawfareFilterWhere({ date_from: "2025-1-1" })).toBe(
      " WHERE search_tier <> 'suppressed'",
    );
  });

  it("AND-joins multiple axes plus the default suppressed exclusion", () => {
    const w = buildLawfareFilterWhere({
      q: "birthright citizenship",
      author_slug: "jane-doe",
      content_type: "article",
      date_from: "2025-01-01",
    });
    expect(w.startsWith(" WHERE ")).toBe(true);
    expect(w).toContain("fts @@");
    expect(w).toContain("author_slugs @> ARRAY['jane-doe']");
    expect(w).toContain("content_type = 'article'");
    expect(w).toContain("published_date >= '2025-01-01'");
    expect(w).toContain("search_tier <> 'suppressed'");
    // Five predicates (4 axes + the suppressed exclusion) separated by four ANDs.
    expect((w.match(/ AND /g) || []).length).toBe(4);
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
// Lawfare AI modes — narrative synthesis (plan/execute) + summarize-one over
// the COMMENTARY corpus. Validators mirror OLC discipline (opinion_ids →
// article_ids). The defining accuracy property is verified at the executor
// level (the view lawfare_ama_source / scoped_lawfare_documents excludes
// suppressed roundup digests) — these tests pin the JSON validators.
// ============================================================================

describe("normalizeLawfareScope", () => {
  it("treats missing / undefined scope as full-corpus", () => {
    const s = normalizeLawfareScope(undefined);
    expect(s.is_full_db).toBe(true);
    expect(s.article_ids).toBe(null);
    expect(s.count).toBe(0);
  });

  it("treats empty article_ids as full-corpus (so the executor doesn't IN ())", () => {
    const s = normalizeLawfareScope({ article_ids: [] });
    expect(s.is_full_db).toBe(true);
    expect(s.article_ids).toBe(null);
  });

  it("keeps a valid numeric article_ids list and computes count", () => {
    const s = normalizeLawfareScope({ article_ids: [10, 20, 30] });
    expect(s.is_full_db).toBe(false);
    expect(s.article_ids).toEqual([10, 20, 30]);
    expect(s.count).toBe(3);
  });

  it("drops non-finite values from article_ids without throwing", () => {
    const s = normalizeLawfareScope({ article_ids: [1, "x", null, 2, NaN, "3"] });
    expect(s.article_ids).toEqual([1, 2, 3]);
  });

  it("honors caller-supplied count + description", () => {
    const s = normalizeLawfareScope({
      article_ids: [1, 2, 3],
      count: 3,
      description: "3 pieces on birthright citizenship"
    });
    expect(s.description).toBe("3 pieces on birthright citizenship");
  });
});

describe("parseLawfarePlan", () => {
  const validPlan = JSON.stringify({
    output_mode: "hybrid",
    approach_summary: "Fan out FTS over the topic and pull authored pieces by date.",
    candor_notes: ["Counts are of original authored pieces; roundup digests are excluded."],
    queries: [{ label: "topic FTS", sql: "SELECT id, title, author_names, published_date, canonical_url FROM lawfare_ama_source WHERE fts @@ websearch_to_tsquery('english', 'X') LIMIT 200" }],
    estimated_cost_cents: 9,
    wants_synthesis: true
  });

  it("accepts a well-formed plan", () => {
    const p = parseLawfarePlan(validPlan);
    expect(p.output_mode).toBe("hybrid");
    expect(p.queries).toHaveLength(1);
    expect(p.estimated_cost_cents).toBe(9);
  });

  it("strips code fences before parsing", () => {
    const fenced = "```json\n" + validPlan + "\n```";
    expect(parseLawfarePlan(fenced).output_mode).toBe("hybrid");
  });

  it("rejects an unknown output_mode", () => {
    const bad = JSON.stringify({ output_mode: "graph", queries: [] });
    expect(() => parseLawfarePlan(bad)).toThrow(/output_mode/);
  });

  it("rejects non-array queries", () => {
    const bad = JSON.stringify({ output_mode: "narrative", queries: "SELECT 1" });
    expect(() => parseLawfarePlan(bad)).toThrow(/queries must be an array/);
  });

  it("rejects a top-level array (only objects allowed)", () => {
    expect(() => parseLawfarePlan("[1,2,3]")).toThrow(/top-level value is not an object/);
  });

  it("coerces estimated_cost_cents to a non-negative integer", () => {
    const negative = JSON.stringify({ output_mode: "narrative", queries: [], estimated_cost_cents: -50 });
    expect(parseLawfarePlan(negative).estimated_cost_cents).toBe(0);
  });

  it("defaults candor_notes to [] when missing", () => {
    const noNotes = JSON.stringify({ output_mode: "narrative", queries: [] });
    expect(parseLawfarePlan(noNotes).candor_notes).toEqual([]);
  });
});

describe("parseLawfareSynthesis", () => {
  it("accepts a list-mode synthesis with valid article_ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "In 'X' (2025), Doe argued Y.",
      article_ids: [42, 73],
      candor_notes: []
    });
    const s = parseLawfareSynthesis(raw, "list");
    expect(s.article_ids).toEqual([42, 73]);
  });

  it("rejects empty answer_markdown", () => {
    const raw = JSON.stringify({ answer_markdown: "  ", article_ids: [] });
    expect(() => parseLawfareSynthesis(raw, "narrative")).toThrow(/answer_markdown is empty/);
  });

  it("downgrades to narrative + candor note when list mode returns no article_ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "No pieces matched the criterion.",
      article_ids: [],
      candor_notes: []
    });
    const s = parseLawfareSynthesis(raw, "list");
    expect(s.article_ids).toEqual([]);
    expect(s.candor_notes.join(" ")).toMatch(/returned none/);
  });

  it("forces article_ids = null on narrative output_mode regardless of model output", () => {
    const raw = JSON.stringify({
      answer_markdown: "Narrative-only answer.",
      article_ids: [1, 2, 3],
      candor_notes: []
    });
    const s = parseLawfareSynthesis(raw, "narrative");
    expect(s.article_ids).toBe(null);
  });

  it("coerces article_ids strings to numbers and drops non-finite values", () => {
    const raw = JSON.stringify({
      answer_markdown: "x",
      article_ids: ["42", 7, "not-a-number", null],
      candor_notes: []
    });
    const s = parseLawfareSynthesis(raw, "list");
    expect(s.article_ids).toEqual([42, 7]);
  });
});

describe("parseLawfareSummary", () => {
  it("accepts a well-formed summary", () => {
    const raw = JSON.stringify({ summary_markdown: "**Thesis** — the author argues X.", candor_notes: [] });
    const s = parseLawfareSummary(raw);
    expect(s.summary_markdown).toMatch(/Thesis/);
    expect(s.candor_notes).toEqual([]);
  });

  it("rejects empty summary_markdown", () => {
    const raw = JSON.stringify({ summary_markdown: "  ", candor_notes: [] });
    expect(() => parseLawfareSummary(raw)).toThrow(/summary_markdown is empty/);
  });

  it("defaults candor_notes to [] when missing", () => {
    const raw = JSON.stringify({ summary_markdown: "x" });
    expect(parseLawfareSummary(raw).candor_notes).toEqual([]);
  });
});

// ============================================================================
// USC AI modes (PR 4s) — three flagships (legality / authority / topical) +
// read-a-section, served through one claude_ama mode whose planner picks
// output_mode per question shape. Validators mirror OLC/FRUS discipline.
// ============================================================================

describe("normalizeUscScope", () => {
  it("treats missing scope as full-corpus", () => {
    const s = normalizeUscScope(undefined);
    expect(s.is_full_db).toBe(true);
    expect(s.section_ids).toBe(null);
  });

  it("treats empty section_ids as full-corpus", () => {
    const s = normalizeUscScope({ section_ids: [] });
    expect(s.is_full_db).toBe(true);
    expect(s.section_ids).toBe(null);
  });

  it("keeps a valid numeric section_ids list", () => {
    const s = normalizeUscScope({ section_ids: [101, 202, 303] });
    expect(s.is_full_db).toBe(false);
    expect(s.section_ids).toEqual([101, 202, 303]);
    expect(s.count).toBe(3);
  });

  it("drops nullish + non-finite values", () => {
    const s = normalizeUscScope({ section_ids: [1, null, "x", 2, undefined, NaN, "3"] });
    expect(s.section_ids).toEqual([1, 2, 3]);
  });
});

describe("parseUscPlan", () => {
  const validPlan = JSON.stringify({
    output_mode: "hybrid",
    approach_summary: "Pull Title 18 sections about whistleblower retaliation.",
    candor_notes: ["Title 18 is positive-law; current as of release 119-93."],
    queries: [{
      label: "whistleblower retaliation sections",
      sql: "SELECT id, citation, heading FROM usc_sections WHERE title_num = 18 AND fts @@ websearch_to_tsquery('english', 'whistleblower retaliation') LIMIT 100"
    }],
    estimated_cost_cents: 9,
    wants_synthesis: true
  });

  it("accepts a well-formed plan", () => {
    const p = parseUscPlan(validPlan);
    expect(p.output_mode).toBe("hybrid");
  });

  it("strips code fences", () => {
    const fenced = "```json\n" + validPlan + "\n```";
    expect(parseUscPlan(fenced).output_mode).toBe("hybrid");
  });

  it("rejects an unknown output_mode", () => {
    const bad = JSON.stringify({ output_mode: "outline", queries: [] });
    expect(() => parseUscPlan(bad)).toThrow(/output_mode/);
  });

  it("rejects non-array queries", () => {
    const bad = JSON.stringify({ output_mode: "list", queries: "SELECT 1" });
    expect(() => parseUscPlan(bad)).toThrow(/queries must be an array/);
  });

  it("coerces negative estimated_cost_cents to 0", () => {
    const negative = JSON.stringify({ output_mode: "narrative", queries: [], estimated_cost_cents: -25 });
    expect(parseUscPlan(negative).estimated_cost_cents).toBe(0);
  });
});

describe("parseUscSynthesis", () => {
  it("accepts a hybrid synthesis with section_ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "Under [usc-ref:42] the rule is X.",
      section_ids: [42, 73],
      candor_notes: []
    });
    const s = parseUscSynthesis(raw, "hybrid");
    expect(s.section_ids).toEqual([42, 73]);
    expect(s.answer_markdown).toMatch(/usc-ref:42/);
  });

  it("forces section_ids = null for narrative mode regardless of model output", () => {
    const raw = JSON.stringify({
      answer_markdown: "Narrative analytical answer.",
      section_ids: [1, 2, 3], // model returned ids even though mode is narrative
      candor_notes: []
    });
    const s = parseUscSynthesis(raw, "narrative");
    expect(s.section_ids).toBe(null);
  });

  it("downgrades empty list/hybrid to narrative with a candor note", () => {
    const raw = JSON.stringify({
      answer_markdown: "No matching sections.",
      section_ids: [],
      candor_notes: []
    });
    const s = parseUscSynthesis(raw, "list");
    expect(s.section_ids).toEqual([]);
    expect(s.candor_notes.join(" ")).toMatch(/returned none/);
  });

  it("drops nullish ids before Number conversion", () => {
    const raw = JSON.stringify({
      answer_markdown: "x",
      section_ids: ["42", null, 7, undefined, "not-a-number"],
      candor_notes: []
    });
    const s = parseUscSynthesis(raw, "list");
    expect(s.section_ids).toEqual([42, 7]);
  });

  it("rejects empty answer_markdown", () => {
    const raw = JSON.stringify({ answer_markdown: "  ", section_ids: [] });
    expect(() => parseUscSynthesis(raw, "narrative")).toThrow(/answer_markdown is empty/);
  });
});

describe("buildUscPlanningUser", () => {
  it("describes the full-corpus scope and uses usc_sections", () => {
    const msg = buildUscPlanningUser("Is it lawful to retaliate against whistleblowers?", normalizeUscScope(undefined));
    expect(msg).toMatch(/full USC corpus/);
    expect(msg).toMatch(/usc_sections/);
    expect(msg).not.toMatch(/scoped_usc_sections/);
  });

  it("describes a narrowed scope and uses scoped_usc_sections", () => {
    const msg = buildUscPlanningUser(
      "Within these sections, which require notice?",
      normalizeUscScope({ section_ids: [1, 2, 3], count: 3 })
    );
    expect(msg).toMatch(/3 section_ids/);
    expect(msg).toMatch(/scoped_usc_sections/);
  });
});

describe("buildUscSummarizeUser", () => {
  const section = {
    citation: "18 U.S.C. § 1112",
    title_num: 18,
    title_name: "Crimes and Criminal Procedure",
    structure_path: "18/I/51/1112",
    heading: "Manslaughter",
    status: "active",
    is_positive_law: true,
    release_point: "119-93",
    source_credit: "Pub. L. 85-768, § 1, 72 Stat. 921.",
    text_content: "(a) Manslaughter is the unlawful killing of a human being without malice. It is of two kinds — voluntary and involuntary."
  };

  it("surfaces citation + hierarchy + status + positive-law in the prompt", () => {
    const u = buildUscSummarizeUser(section, false);
    expect(u).toMatch(/18 U\.S\.C\. § 1112/);
    expect(u).toMatch(/Crimes and Criminal Procedure/);
    expect(u).toMatch(/Manslaughter/);
    expect(u).toMatch(/Positive law: yes/);
    expect(u).toMatch(/119-93/);
    expect(u).toMatch(/72 Stat\. 921/);
    expect(u).not.toMatch(/TRUNCATED/);
  });

  it("annotates non-positive-law titles with the restatement caveat", () => {
    const nonPositive = { ...section, title_num: 26, title_name: "Internal Revenue Code", is_positive_law: false };
    const u = buildUscSummarizeUser(nonPositive, false);
    expect(u).toMatch(/Positive law: no/);
    expect(u).toMatch(/restatement of the underlying Statutes at Large/);
  });

  it("flags + truncates oversize text", () => {
    // No `notes` on the fixture — `notes` may contain "text" letters that
    // perturb the x-count assertion. Truncation-of-text_content is what's
    // being pinned.
    const huge = { ...section, notes: null, text_content: "x".repeat(USC_SUMMARIZE_TEXT_CAP + 1000) };
    const u = buildUscSummarizeUser(huge, true);
    expect(u).toMatch(/TRUNCATED to/);
    const textStart = u.indexOf("SECTION TEXT");
    const textBlock = u.slice(textStart);
    const xCount = (textBlock.match(/x/g) || []).length;
    expect(xCount).toBe(USC_SUMMARIZE_TEXT_CAP);
  });
});

describe("parseUscSummary", () => {
  it("accepts a well-formed summary", () => {
    const raw = JSON.stringify({
      summary_markdown: "**What it does.** ...",
      candor_notes: []
    });
    const s = parseUscSummary(raw);
    expect(s.summary_markdown).toMatch(/What it does/);
  });

  it("rejects empty summary_markdown", () => {
    const raw = JSON.stringify({ summary_markdown: " ", candor_notes: [] });
    expect(() => parseUscSummary(raw)).toThrow(/summary_markdown is empty/);
  });

  it("strips code fences", () => {
    const fenced = "```json\n" + JSON.stringify({ summary_markdown: "x", candor_notes: [] }) + "\n```";
    expect(parseUscSummary(fenced).summary_markdown).toBe("x");
  });

  it("defaults candor_notes to []", () => {
    const raw = JSON.stringify({ summary_markdown: "x" });
    expect(parseUscSummary(raw).candor_notes).toEqual([]);
  });
});

describe("executeUscPlan scope cap", () => {
  it("refuses scopes above USC_SCOPE_LITERAL_LIMIT with a clear error", async () => {
    const oversize = Array.from({ length: USC_SCOPE_LITERAL_LIMIT + 1 }, (_, i) => i + 1);
    const scope = normalizeUscScope({ section_ids: oversize });
    const plan = { queries: [{ label: "x", sql: "SELECT 1 FROM scoped_usc_sections" }] };
    await expect(executeUscPlan({}, plan, scope)).rejects.toThrow(/too large to inline/);
  });
});

// ============================================================================
// CFR AI modes (PR 4t) — three flagships (compliance / authority / framework
// synthesis) + read-a-section, served through one claude_ama mode whose
// planner picks output_mode per question shape.
// ============================================================================

describe("normalizeCfrScope", () => {
  it("treats missing scope as full-corpus", () => {
    const s = normalizeCfrScope(undefined);
    expect(s.is_full_db).toBe(true);
    expect(s.section_ids).toBe(null);
  });

  it("treats empty section_ids as full-corpus", () => {
    const s = normalizeCfrScope({ section_ids: [] });
    expect(s.is_full_db).toBe(true);
    expect(s.section_ids).toBe(null);
  });

  it("keeps a valid numeric section_ids list", () => {
    const s = normalizeCfrScope({ section_ids: [100, 200, 300] });
    expect(s.section_ids).toEqual([100, 200, 300]);
    expect(s.count).toBe(3);
  });

  it("drops nullish + non-finite values", () => {
    const s = normalizeCfrScope({ section_ids: [1, null, "x", 2, undefined, NaN, "3"] });
    expect(s.section_ids).toEqual([1, 2, 3]);
  });
});

describe("parseCfrPlan", () => {
  const validPlan = JSON.stringify({
    output_mode: "hybrid",
    approach_summary: "Pull HIPAA Privacy Rule sections (45 CFR Parts 160 & 164).",
    candor_notes: ["Per-section currency varies; reserved sections excluded."],
    queries: [{
      label: "HIPAA Privacy Rule",
      sql: "SELECT id, citation, heading, up_to_date_as_of FROM cfr_sections WHERE title_num = 45 AND part IN ('160','164') AND NOT reserved LIMIT 200"
    }],
    estimated_cost_cents: 11,
    wants_synthesis: true
  });

  it("accepts a well-formed plan", () => {
    const p = parseCfrPlan(validPlan);
    expect(p.output_mode).toBe("hybrid");
  });

  it("strips code fences", () => {
    const fenced = "```json\n" + validPlan + "\n```";
    expect(parseCfrPlan(fenced).output_mode).toBe("hybrid");
  });

  it("rejects an unknown output_mode", () => {
    const bad = JSON.stringify({ output_mode: "framework", queries: [] });
    expect(() => parseCfrPlan(bad)).toThrow(/output_mode/);
  });

  it("rejects non-array queries", () => {
    const bad = JSON.stringify({ output_mode: "list", queries: "SELECT 1" });
    expect(() => parseCfrPlan(bad)).toThrow(/queries must be an array/);
  });

  it("coerces negative estimated_cost_cents to 0", () => {
    const negative = JSON.stringify({ output_mode: "narrative", queries: [], estimated_cost_cents: -5 });
    expect(parseCfrPlan(negative).estimated_cost_cents).toBe(0);
  });
});

describe("parseCfrSynthesis", () => {
  it("accepts a hybrid synthesis with section_ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "Under [cfr-ref:42] the rule is X.",
      section_ids: [42, 73],
      candor_notes: []
    });
    const s = parseCfrSynthesis(raw, "hybrid");
    expect(s.section_ids).toEqual([42, 73]);
    expect(s.answer_markdown).toMatch(/cfr-ref:42/);
  });

  it("forces section_ids = null for narrative mode regardless of model output", () => {
    const raw = JSON.stringify({
      answer_markdown: "Narrative analytical answer.",
      section_ids: [1, 2, 3],
      candor_notes: []
    });
    const s = parseCfrSynthesis(raw, "narrative");
    expect(s.section_ids).toBe(null);
  });

  it("downgrades empty list/hybrid to narrative with a candor note", () => {
    const raw = JSON.stringify({
      answer_markdown: "No matching regs.",
      section_ids: [],
      candor_notes: []
    });
    const s = parseCfrSynthesis(raw, "list");
    expect(s.section_ids).toEqual([]);
    expect(s.candor_notes.join(" ")).toMatch(/returned none/);
  });

  it("drops nullish ids", () => {
    const raw = JSON.stringify({
      answer_markdown: "x",
      section_ids: ["42", null, 7, undefined, "not-a-number"],
      candor_notes: []
    });
    const s = parseCfrSynthesis(raw, "list");
    expect(s.section_ids).toEqual([42, 7]);
  });

  it("rejects empty answer_markdown", () => {
    const raw = JSON.stringify({ answer_markdown: "  ", section_ids: [] });
    expect(() => parseCfrSynthesis(raw, "narrative")).toThrow(/answer_markdown is empty/);
  });
});

describe("buildCfrPlanningUser", () => {
  it("describes the full-corpus scope and uses cfr_sections", () => {
    const msg = buildCfrPlanningUser("What regs apply to a brewery startup?", normalizeCfrScope(undefined));
    expect(msg).toMatch(/full CFR corpus/);
    expect(msg).toMatch(/cfr_sections/);
    expect(msg).not.toMatch(/scoped_cfr_sections/);
  });

  it("describes a narrowed scope and uses scoped_cfr_sections", () => {
    const msg = buildCfrPlanningUser(
      "Within these sections, which require notice?",
      normalizeCfrScope({ section_ids: [1, 2, 3], count: 3 })
    );
    expect(msg).toMatch(/3 section_ids/);
    expect(msg).toMatch(/scoped_cfr_sections/);
  });
});

describe("buildCfrSummarizeUser", () => {
  const section = {
    citation: "45 CFR § 164.502",
    title_num: 45,
    title_name: "Public Welfare",
    structure_path: "45/A/164/E/164.502",
    heading: "Uses and disclosures of protected health information: general rules",
    reserved: false,
    source: "eCFR",
    up_to_date_as_of: "2026-05-21",
    latest_amended_on: "2024-04-26",
    text_content: "(a) Standard. A covered entity or business associate may not use or disclose protected health information..."
  };

  it("surfaces citation + hierarchy + currency + amendment date in the prompt", () => {
    const u = buildCfrSummarizeUser(section, false);
    expect(u).toMatch(/45 CFR § 164\.502/);
    expect(u).toMatch(/Public Welfare/);
    expect(u).toMatch(/Reserved: no/);
    expect(u).toMatch(/2026-05-21/);
    expect(u).toMatch(/2024-04-26/);
    expect(u).not.toMatch(/TRUNCATED/);
  });

  it("annotates reserved-placeholder sections", () => {
    const reserved = { ...section, reserved: true, text_content: "" };
    const u = buildCfrSummarizeUser(reserved, false);
    expect(u).toMatch(/Reserved: yes/);
    expect(u).toMatch(/placeholder; no operative text/);
  });

  it("flags + truncates oversize text", () => {
    const huge = { ...section, text_content: "x".repeat(CFR_SUMMARIZE_TEXT_CAP + 1000) };
    const u = buildCfrSummarizeUser(huge, true);
    expect(u).toMatch(/TRUNCATED to/);
    const textStart = u.indexOf("SECTION TEXT");
    const textBlock = u.slice(textStart);
    const xCount = (textBlock.match(/x/g) || []).length;
    expect(xCount).toBe(CFR_SUMMARIZE_TEXT_CAP);
  });
});

describe("parseCfrSummary", () => {
  it("accepts a well-formed summary", () => {
    const raw = JSON.stringify({
      summary_markdown: "**What it does.** ...",
      candor_notes: []
    });
    const s = parseCfrSummary(raw);
    expect(s.summary_markdown).toMatch(/What it does/);
  });

  it("rejects empty summary_markdown", () => {
    const raw = JSON.stringify({ summary_markdown: " ", candor_notes: [] });
    expect(() => parseCfrSummary(raw)).toThrow(/summary_markdown is empty/);
  });

  it("strips code fences", () => {
    const fenced = "```json\n" + JSON.stringify({ summary_markdown: "x", candor_notes: [] }) + "\n```";
    expect(parseCfrSummary(fenced).summary_markdown).toBe("x");
  });

  it("defaults candor_notes to []", () => {
    const raw = JSON.stringify({ summary_markdown: "x" });
    expect(parseCfrSummary(raw).candor_notes).toEqual([]);
  });
});

describe("executeCfrPlan scope cap", () => {
  it("refuses scopes above CFR_SCOPE_LITERAL_LIMIT with a clear error", async () => {
    const oversize = Array.from({ length: CFR_SCOPE_LITERAL_LIMIT + 1 }, (_, i) => i + 1);
    const scope = normalizeCfrScope({ section_ids: oversize });
    const plan = { queries: [{ label: "x", sql: "SELECT 1 FROM scoped_cfr_sections" }] };
    await expect(executeCfrPlan({}, plan, scope)).rejects.toThrow(/too large to inline/);
  });
});

// ============================================================================
// Hub cross-corpus keyword search (PR 4u) — five parallel FTS queries.
//
// The handler itself touches the live DB so we test it integration-style
// from the React app (and via the deploy pipeline's smoke check). Here we
// pin the per-corpus query builders: they construct the FTS clause + ORDER
// BY shape, escape single quotes correctly, exclude reserved CFR sections,
// and target the right table per corpus.
// ============================================================================

describe("HUB_CORPORA", () => {
  it("lists exactly the seven loaded corpora (incl. presidential)", () => {
    expect(HUB_CORPORA).toEqual(["litigation", "usc", "cfr", "olc", "frus", "lawfare", "presidential"]);
  });
  it("declares a small results-per-corpus cap", () => {
    expect(HUB_RESULTS_PER_CORPUS).toBeGreaterThanOrEqual(3);
    expect(HUB_RESULTS_PER_CORPUS).toBeLessThanOrEqual(10);
  });
});

describe("buildHubQueriesLitigation", () => {
  it("targets the cases table via the docket_entries FTS spine", () => {
    const { rowsSql, countSql } = buildHubQueriesLitigation("habeas", 5);
    expect(rowsSql).toMatch(/FROM cases/);
    expect(rowsSql).toMatch(/docket_entries WHERE fts/);
    expect(rowsSql).toMatch(/websearch_to_tsquery\('english', 'habeas'\)/);
    expect(rowsSql).toMatch(/LIMIT 5/);
    expect(countSql).toMatch(/count\(DISTINCT cl_id\)/);
    expect(countSql).toMatch(/FROM docket_entries WHERE fts/);
  });
  it("orders by date_filed DESC (most-recent-first matches the other spokes' hub-card convention)", () => {
    const { rowsSql } = buildHubQueriesLitigation("x", 5);
    expect(rowsSql).toMatch(/ORDER BY c\.date_filed DESC NULLS LAST/);
  });
  it("interpolates the caller-supplied (already-escaped) literal verbatim — the SQL-injection guard lives in the handler", () => {
    // The handler runs escSqlLit BEFORE handing the literal to the builder
    // (so single quotes arrive as ''). The builder trusts that contract and
    // interpolates verbatim. We pin both halves: the builder must not
    // double-escape, AND the literal must end up inside the websearch
    // call body, not outside it.
    const { rowsSql, countSql } = buildHubQueriesLitigation("o''reilly", 5);
    expect(rowsSql).toMatch(/websearch_to_tsquery\('english', 'o''reilly'\)/);
    expect(countSql).toMatch(/websearch_to_tsquery\('english', 'o''reilly'\)/);
  });
});

describe("buildHubQueriesUsc", () => {
  it("targets usc_sections + uses ts_rank ordering", () => {
    const { rowsSql, countSql } = buildHubQueriesUsc("whistleblower", 5);
    expect(rowsSql).toMatch(/FROM usc_sections WHERE/);
    expect(rowsSql).toMatch(/ORDER BY ts_rank/);
    expect(countSql).toMatch(/count\(\*\)::bigint AS n FROM usc_sections/);
  });
  it("falls back to heading when citation is null + carries title_name into context", () => {
    const { rowsSql } = buildHubQueriesUsc("x", 5);
    expect(rowsSql).toMatch(/COALESCE\(citation, heading, '\(no title\)'\)/);
    expect(rowsSql).toMatch(/COALESCE\(heading, title_name\)/);
  });
});

describe("buildHubQueriesCfr", () => {
  it("targets cfr_sections AND excludes reserved placeholders", () => {
    const { rowsSql, countSql } = buildHubQueriesCfr("HIPAA", 5);
    expect(rowsSql).toMatch(/FROM cfr_sections WHERE NOT reserved AND/);
    expect(countSql).toMatch(/FROM cfr_sections WHERE NOT reserved AND/);
  });
  it("surfaces up_to_date_as_of as the date axis", () => {
    const { rowsSql } = buildHubQueriesCfr("x", 5);
    expect(rowsSql).toMatch(/up_to_date_as_of::text AS date/);
  });
  it("orders by ts_rank — relevance-first for regulatory queries", () => {
    const { rowsSql } = buildHubQueriesCfr("x", 5);
    expect(rowsSql).toMatch(/ORDER BY ts_rank/);
  });
});

describe("buildHubQueriesOlc", () => {
  it("targets olc_opinions and orders by date_issued DESC", () => {
    const { rowsSql, countSql } = buildHubQueriesOlc("executive privilege", 5);
    expect(rowsSql).toMatch(/FROM olc_opinions WHERE/);
    expect(rowsSql).toMatch(/ORDER BY date_issued DESC NULLS LAST/);
    expect(countSql).toMatch(/FROM olc_opinions WHERE/);
  });
  it("carries source as the context axis (DOJ vs Knight FOIA differentiator)", () => {
    const { rowsSql } = buildHubQueriesOlc("x", 5);
    expect(rowsSql).toMatch(/source AS context/);
  });
});

describe("buildHubQueriesFrus", () => {
  it("targets frus_documents and orders by doc_date DESC", () => {
    const { rowsSql, countSql } = buildHubQueriesFrus("Cuban missile", 5);
    expect(rowsSql).toMatch(/FROM frus_documents WHERE/);
    expect(rowsSql).toMatch(/ORDER BY doc_date DESC NULLS LAST/);
    expect(countSql).toMatch(/FROM frus_documents WHERE/);
  });
  it("falls back to volume_id when place_name is null (context axis)", () => {
    const { rowsSql } = buildHubQueriesFrus("x", 5);
    expect(rowsSql).toMatch(/COALESCE\(place_name, volume_id\)/);
  });
});

describe("buildHubQueriesLawfare", () => {
  it("targets lawfare_documents, orders by published_date DESC, caps to the limit", () => {
    const { rowsSql, countSql } = buildHubQueriesLawfare("executive privilege", 5);
    expect(rowsSql).toMatch(/FROM lawfare_documents WHERE/);
    expect(rowsSql).toMatch(/websearch_to_tsquery\('english', 'executive privilege'\)/);
    expect(rowsSql).toMatch(/ORDER BY published_date DESC NULLS LAST/);
    expect(rowsSql).toMatch(/LIMIT 5/);
    expect(countSql).toMatch(/count\(\*\)/);
    expect(countSql).toMatch(/FROM lawfare_documents WHERE/);
  });
  it("excludes suppressed roundup digests from both rows and count (matches the spoke's default scope)", () => {
    const { rowsSql, countSql } = buildHubQueriesLawfare("x", 5);
    expect(rowsSql).toMatch(/search_tier <> 'suppressed'/);
    expect(countSql).toMatch(/search_tier <> 'suppressed'/);
  });
  it("surfaces content_type as the context axis", () => {
    const { rowsSql } = buildHubQueriesLawfare("x", 5);
    expect(rowsSql).toMatch(/content_type AS context/);
  });
});

// ============================================================================
// items-by-ids (PR 4v) — the AMA cited-result polish. AMA synthesis returns
// a list of <doc>_ids; the result panel hits items-by-ids to get metadata-
// rich display rows for each. parseItemsByIdsRequest is the shared input
// validator; buildItemsByIdsSql preserves caller order via array_position.
// ============================================================================

describe("parseItemsByIdsRequest", () => {
  it("rejects undefined / null with a clear error", () => {
    expect(parseItemsByIdsRequest(undefined)).toEqual({ error: "Missing ids" });
    expect(parseItemsByIdsRequest(null)).toEqual({ error: "Missing ids" });
  });
  it("rejects non-array input", () => {
    expect(parseItemsByIdsRequest("not an array")).toEqual({ error: "ids must be an array" });
    expect(parseItemsByIdsRequest(42)).toEqual({ error: "ids must be an array" });
    expect(parseItemsByIdsRequest({ ids: [1, 2] })).toEqual({ error: "ids must be an array" });
  });
  it("accepts empty array (handler short-circuits to [])", () => {
    expect(parseItemsByIdsRequest([])).toEqual({ ids: [] });
  });
  it("rejects oversize lists with the cap surfaced in the error", () => {
    const oversize = Array.from({ length: ITEMS_BY_IDS_CAP + 1 }, (_, i) => i + 1);
    const result = parseItemsByIdsRequest(oversize);
    expect(result.error).toMatch(/too large/);
    expect(result.error).toMatch(String(ITEMS_BY_IDS_CAP));
  });
  it("keeps valid positive integers and drops everything else", () => {
    const result = parseItemsByIdsRequest([1, 2, 3, null, undefined, NaN, -5, 0, "x", "7", 4.9, 5.0]);
    // Kept: 1, 2, 3, "7"→7, 4.9→4 (Math.floor), 5.0→5
    // Dropped: null/undefined (pre-Number filter), NaN/-5/0/"x" (post-Number filter — 0 is dropped because we require > 0)
    expect(result.ids).toEqual([1, 2, 3, 7, 4, 5]);
  });
  it("preserves caller order (the planner's ranking is meaningful)", () => {
    const result = parseItemsByIdsRequest([99, 1, 50, 3]);
    expect(result.ids).toEqual([99, 1, 50, 3]);
  });
});

describe("buildItemsByIdsSql", () => {
  it("uses the provided display columns and table", () => {
    const sql = buildItemsByIdsSql("id, title, foo", "my_table", [1, 2, 3]);
    expect(sql).toMatch(/SELECT id, title, foo FROM my_table/);
  });
  it("inlines ids as a bigint[] array literal (twice — once for WHERE, once for ORDER BY)", () => {
    const sql = buildItemsByIdsSql("id", "t", [10, 20, 30]);
    const arrayLiteral = "'{10,20,30}'::bigint[]";
    // Both occurrences must be present — WHERE uses it via unnest, ORDER BY
    // uses it via array_position to preserve caller order.
    const occurrences = sql.split(arrayLiteral).length - 1;
    expect(occurrences).toBe(2);
    expect(sql).toMatch(/WHERE id IN \(SELECT unnest\('\{10,20,30\}'::bigint\[\]\)\)/);
    expect(sql).toMatch(/ORDER BY array_position\('\{10,20,30\}'::bigint\[\], id\)/);
  });
  it("produces a single-statement SQL with no trailing semicolon", () => {
    const sql = buildItemsByIdsSql("id", "t", [1]);
    // Worker's corpusRunQuery doesn't accept multi-statement input; no semicolon.
    expect(sql).not.toMatch(/;/);
  });
});

// ============================================================================
// Synthesis salvage (PR 4w) — recover degraded narrative when the model's
// output truncated mid-JSON. Addresses Note 4 from the testing pass.
// ============================================================================

describe("salvageTruncatedSynthesis", () => {
  it("returns null when input has no answer_markdown key", () => {
    expect(salvageTruncatedSynthesis('{"foo": "bar"}')).toBeNull();
    expect(salvageTruncatedSynthesis("just garbage")).toBeNull();
    expect(salvageTruncatedSynthesis("")).toBeNull();
  });

  it("returns null when JSON is complete (closing structure present)", () => {
    // Has the closing `","candor_notes":` — not truncated; let the normal parser handle.
    const complete = '{"answer_markdown": "Hello world", "candor_notes": []}';
    expect(salvageTruncatedSynthesis(complete)).toBeNull();
    // Has the closing `","opinion_ids":` — also not truncated.
    const completeOlc = '{"answer_markdown": "Hello world", "opinion_ids": [1, 2]}';
    expect(salvageTruncatedSynthesis(completeOlc)).toBeNull();
    // Has just the closing brace — not truncated.
    const completeBare = '{"answer_markdown": "Hello world"}';
    expect(salvageTruncatedSynthesis(completeBare)).toBeNull();
  });

  it("recovers truncated markdown when no closing structure is found", () => {
    // Long enough recoverable content to be useful (>50 chars).
    const truncated =
      '{"answer_markdown": "The Eisenhower administration responded to the Suez Crisis through a series of diplomatic interventions';
    const result = salvageTruncatedSynthesis(truncated);
    expect(result).not.toBeNull();
    expect(result.answer_markdown).toMatch(/Eisenhower administration/);
    expect(result.answer_markdown).toMatch(/truncated/);
    expect(result.candor_note).toMatch(/truncated mid-generation/);
  });

  it("drops content shorter than 50 chars", () => {
    const tinyTruncation = '{"answer_markdown": "short';
    expect(salvageTruncatedSynthesis(tinyTruncation)).toBeNull();
  });

  it("unescapes JSON string-escape sequences in the recovered markdown", () => {
    // The model emitted \\n, \\", and \\\\ — we want them rendered as
    // literal newline, double-quote, backslash respectively.
    const truncated =
      '{"answer_markdown": "Line one.\\nLine two with a \\"quoted\\" word.\\nBackslash test: C:\\\\Users\\\\benji';
    const result = salvageTruncatedSynthesis(truncated);
    expect(result).not.toBeNull();
    expect(result.answer_markdown).toMatch(/Line one\.\nLine two/);
    expect(result.answer_markdown).toMatch(/"quoted"/);
    expect(result.answer_markdown).toMatch(/C:\\Users\\benji/);
  });

  it("drops a trailing partial escape (e.g. ends with single backslash)", () => {
    const truncated =
      '{"answer_markdown": "The cable from London reports a serious escalation. The Acheson memo argues that further action is needed\\';
    const result = salvageTruncatedSynthesis(truncated);
    expect(result).not.toBeNull();
    // Recovered content should NOT end with a dangling backslash.
    const markdownBeforeMarker = result.answer_markdown.split("\n\n*[")[0];
    expect(markdownBeforeMarker).not.toMatch(/\\$/);
  });
});

describe("buildSalvagedSynthesis", () => {
  const salvagePayload = {
    answer_markdown: "Partial narrative ...",
    candor_note: "Output was truncated.",
  };

  it("shapes the salvage into the spoke-specific schema (OLC = opinion_ids)", () => {
    const out = buildSalvagedSynthesis(salvagePayload, "narrative", "opinion_ids");
    expect(out.answer_markdown).toBe("Partial narrative ...");
    expect(out.candor_notes).toEqual(["Output was truncated."]);
    expect(out.opinion_ids).toBeNull();
  });

  it("forces list-mode ids to empty array (UI shouldn't try to render partial)", () => {
    const out = buildSalvagedSynthesis(salvagePayload, "list", "document_ids");
    expect(out.document_ids).toEqual([]);
  });

  it("forces hybrid-mode ids to empty array too", () => {
    const out = buildSalvagedSynthesis(salvagePayload, "hybrid", "section_ids");
    expect(out.section_ids).toEqual([]);
  });

  it("forces narrative-mode ids to null", () => {
    const out = buildSalvagedSynthesis(salvagePayload, "narrative", "section_ids");
    expect(out.section_ids).toBeNull();
  });
});

describe("parse<Spoke>Synthesis salvage integration", () => {
  // A truncated FRUS response: the planner's "tell me about the history of
  // discussions of whether the American embassy in Israel should be in Tel
  // Aviv or Jerusalem" exact failure mode — model emitted a long narrative,
  // hit the token cap before closing the JSON. PR 4v's parser threw "could
  // not find a JSON object" and the user got nothing; PR 4w salvages.
  const truncatedFrus =
    '{"answer_markdown": "The question of whether the American embassy in Israel should be located in Tel Aviv or Jerusalem occupied U.S. policy from 1948 onward. Initially Tel Aviv was chosen for diplomatic reasons related to international recognition. The Jerusalem Embassy Act of 1995 mandated relocation but included a presidential waiver';

  it("FRUS narrative-mode: salvage path returns degraded narrative instead of throwing", () => {
    const v = parseFrusSynthesis(truncatedFrus, "narrative");
    expect(v.answer_markdown).toMatch(/Tel Aviv/);
    expect(v.answer_markdown).toMatch(/Jerusalem/);
    expect(v.answer_markdown).toMatch(/truncated/);
    expect(v.document_ids).toBeNull();
    expect(v.candor_notes.join(" ")).toMatch(/truncated mid-generation/);
  });

  it("FRUS hybrid-mode: salvage forces document_ids = [] (no partial render)", () => {
    const v = parseFrusSynthesis(truncatedFrus, "hybrid");
    expect(v.document_ids).toEqual([]);
  });

  // Each spoke parser gets symmetric salvage behavior. One smoke test per.
  it("OLC: salvage path returns degraded narrative with opinion_ids = null", () => {
    const truncatedOlc =
      '{"answer_markdown": "OLC has opined on the recess-appointment power across several administrations. The 1979 opinion on intra-session recesses concluded';
    const v = parseOlcSynthesis(truncatedOlc, "narrative");
    expect(v.answer_markdown).toMatch(/recess-appointment/);
    expect(v.answer_markdown).toMatch(/truncated/);
    expect(v.opinion_ids).toBeNull();
  });

  it("USC: salvage path returns degraded narrative with section_ids = []", () => {
    const truncatedUsc =
      '{"answer_markdown": "Title 18 contains multiple sections addressing whistleblower retaliation, primarily through §1513 (retaliating against a witness) and §1514 (civil action to restrain harassment). Title 5 §2302 enumerates prohibited personnel practices';
    const v = parseUscSynthesis(truncatedUsc, "hybrid");
    expect(v.answer_markdown).toMatch(/whistleblower/);
    expect(v.answer_markdown).toMatch(/truncated/);
    expect(v.section_ids).toEqual([]);
  });

  it("CFR: salvage path returns degraded narrative with section_ids = []", () => {
    const truncatedCfr =
      '{"answer_markdown": "The HIPAA Privacy Rule, codified at 45 CFR Parts 160 and 164, establishes national standards for the protection of individually identifiable health information. §164.502 sets the general rules for uses and disclosures';
    const v = parseCfrSynthesis(truncatedCfr, "list");
    expect(v.answer_markdown).toMatch(/HIPAA/);
    expect(v.answer_markdown).toMatch(/truncated/);
    expect(v.section_ids).toEqual([]);
  });

  // PR 4y: litigation parity. Same salvage chain as the four spokes, but the
  // idsField is cl_ids and the parser is parseSynthesis (litigation predates
  // the per-spoke parsers).
  it("litigation: salvage path returns degraded narrative with cl_ids = null in narrative mode", () => {
    const truncatedLitigation =
      '{"answer_markdown": "Across the post-2025-01-20 docket, immigration TROs have clustered in the District of Maryland and the Northern District of California. Courts have repeatedly applied the four-factor test from Winter v. NRDC to evaluate the likelihood of irreparable harm';
    const v = parseSynthesis(truncatedLitigation, "narrative");
    expect(v.answer_markdown).toMatch(/immigration TROs/);
    expect(v.answer_markdown).toMatch(/truncated/);
    expect(v.cl_ids).toBeNull();
    expect(v.candor_notes.join(" ")).toMatch(/truncated mid-generation/);
  });

  it("litigation: salvage forces cl_ids = [] in hybrid mode (no partial cited rows)", () => {
    const truncatedLitigation =
      '{"answer_markdown": "Several recent cases have addressed the limits of executive authority over independent agencies';
    const v = parseSynthesis(truncatedLitigation, "hybrid");
    expect(v.cl_ids).toEqual([]);
  });

  it("does NOT salvage when the response was a well-formed empty-rows answer (regression guard)", () => {
    // Model returned a clean JSON answer saying "no results" — must NOT
    // trigger salvage; normal parser handles it.
    const cleanZeroResultUsc = JSON.stringify({
      answer_markdown:
        "I searched titles 16, 18, and 54 for the phrases 'National Park Service' OR 'National Park System' AND 'criminal'; zero matching sections. This may be a recall failure — try the phrasing 'Secretary of the Interior' AND 'rules and regulations'.",
      section_ids: [],
      candor_notes: ["Searched titles 16, 18, 54 with FTS fan: no matches."],
    });
    const v = parseUscSynthesis(cleanZeroResultUsc, "list");
    expect(v.answer_markdown).toMatch(/recall failure/);
    expect(v.candor_notes.length).toBeGreaterThan(0);
    expect(v.candor_notes.join(" ")).not.toMatch(/truncated mid-generation/);
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

// ============================================================================
// livenessAlertDecision — incident-aware paging. Encodes the fix for the
// 2026-06-17 incident: a sustained outage must page on a widening cadence
// (open → 30m → 2h → 6h → daily), NOT every 30-min cron tick, and must emit a
// single recovery note when documents resume. Pure function, KV-free.
// ============================================================================
describe("livenessAlertDecision", () => {
  const t0 = Date.parse("2026-06-17T00:00:00Z");
  const at = (min) => t0 + min * 60000;
  const bo = LIVENESS_BACKOFF_MIN; // [30, 120, 360, 1440]

  it("opens an incident and pages immediately on first down detection", () => {
    const d = livenessAlertDecision(null, true, t0, bo);
    expect(d.page).toBe(true);
    expect(d.recovered).toBe(false);
    expect(d.incident).toEqual({ firstMs: t0, lastMs: t0, count: 1 });
  });

  it("holds (no page) while still inside the current backoff window", () => {
    const open = { firstMs: t0, lastMs: t0, count: 1 };
    const d = livenessAlertDecision(open, true, at(29), bo); // < 30m since last page
    expect(d.page).toBe(false);
    expect(d.incident).toBe(open); // state unchanged
  });

  it("re-pages once the backoff for the current count has elapsed", () => {
    const open = { firstMs: t0, lastMs: t0, count: 1 };
    const d = livenessAlertDecision(open, true, at(30), bo); // exactly 30m → second page
    expect(d.page).toBe(true);
    expect(d.incident).toEqual({ firstMs: t0, lastMs: at(30), count: 2 });
  });

  it("widens the cadence as the incident persists (30m → 2h → 6h → daily)", () => {
    // After page #2, wait must be 120m; 119m holds, 120m pages.
    const c2 = { firstMs: t0, lastMs: at(30), count: 2 };
    expect(livenessAlertDecision(c2, true, at(30 + 119), bo).page).toBe(false);
    expect(livenessAlertDecision(c2, true, at(30 + 120), bo).page).toBe(true);
    // After page #4+, the cadence caps at the last backoff entry (daily).
    const c5 = { firstMs: t0, lastMs: at(1000), count: 5 };
    expect(livenessAlertDecision(c5, true, at(1000 + 1439), bo).page).toBe(false);
    expect(livenessAlertDecision(c5, true, at(1000 + 1440), bo).page).toBe(true);
  });

  it("announces recovery exactly once when an open incident clears, then closes it", () => {
    const open = { firstMs: t0, lastMs: at(30), count: 2 };
    const d = livenessAlertDecision(open, false, at(200), bo);
    expect(d.recovered).toBe(true);
    expect(d.page).toBe(false);
    expect(d.incident).toBeNull(); // closed
  });

  it("stays quiet when up and no incident is open (the healthy steady state)", () => {
    const d = livenessAlertDecision(null, false, t0, bo);
    expect(d.page).toBe(false);
    expect(d.recovered).toBe(false);
    expect(d.incident).toBeNull();
  });
});

describe("humanDuration", () => {
  it("formats minutes, hours, and days", () => {
    expect(humanDuration(95 * 60000)).toBe("1h 35m");
    expect(humanDuration(40 * 60000)).toBe("40m");
    expect(humanDuration((2 * 1440 + 10) * 60000)).toBe("2d 0h 10m");
  });
  it("is defensive about bad input", () => {
    expect(humanDuration(-5)).toBe("unknown");
    expect(humanDuration(NaN)).toBe("unknown");
  });
});


// ============================================================================
// PR 4z — Litigation defense-motion vocabulary refinements. Regression-pinning
// tests for the planner-prompt + Read-prompt language additions. These are
// behavioral guards: a future "minor prompt tidy-up" must not silently strip
// the vocabulary mappings that recovered the Comey/James/Broadview ground-
// truth set from Ben's 2026-05-26 grand-jury-disclosure failing query.
// ============================================================================

describe("litigation planner — defense-motion vocabulary", () => {
  const sys = buildPlanningSystem();

  it("names the defense-motion vocabulary failure mode explicitly", () => {
    expect(sys).toMatch(/Defense-motion vocabulary mismatch/);
  });

  it("maps prosecutorial-misconduct umbrella to specific doctrinal articulations", () => {
    expect(sys).toMatch(/Vindictive and Selective Prosecution/);
    expect(sys).toMatch(/Outrageous Government Conduct/);
    expect(sys).toMatch(/Grand Jury Violations/);
  });

  it("maps grand-jury-materials umbrella to the noun variants counsel uses", () => {
    // Counsel uses Records / Transcripts / Minutes; researchers usually say
    // 'materials'. The mapping is what recovered James + Broadview.
    expect(sys).toMatch(/Grand Jury Records/);
    expect(sys).toMatch(/Grand Jury Transcripts/);
    expect(sys).toMatch(/Grand Jury Minutes/);
    expect(sys).toMatch(/in camera review/);
  });

  it("warns about Rule 6 vs Rule 6(e) — counsel cites Rule 6 broadly", () => {
    expect(sys).toMatch(/counsel often cites Rule 6 broadly/i);
  });

  it("pins the Comey/James/Broadview worked example to the prompt", () => {
    // These three case captions are the ground-truth recovery set for the
    // 2026-05-26 failing query. Removing them would re-open the failure.
    expect(sys).toMatch(/United States v\. Comey/);
    expect(sys).toMatch(/United States v\. James/);
    expect(sys).toMatch(/United States v\. Rabbitt/);
  });

  it("contrasts a good plan against a bad plan in the worked example", () => {
    expect(sys).toMatch(/A good FTS plan/);
    expect(sys).toMatch(/A BAD plan/);
  });

  it("includes adjacent defense-motion vocabularies (speedy trial, suppression) for transfer", () => {
    // The point of the worked example is not just to memorize grand-jury;
    // it's to teach the pattern. Speedy-trial and suppression-motion
    // alternations are the test that the lesson generalizes.
    expect(sys).toMatch(/Speedy Trial/);
    expect(sys).toMatch(/Motion to Suppress|Fourth Amendment/);
  });
});

describe("litigation Read — functional-equivalence matching", () => {
  const sys = buildReadSystem(5);

  it("instructs the model to match by function not by literal phrase", () => {
    expect(sys).toMatch(/MATCH BY FUNCTION, NOT BY LITERAL PHRASE/);
  });

  it("explains the researcher-language vs lawyer-language gap explicitly", () => {
    expect(sys).toMatch(/researcher-language/);
    expect(sys).toMatch(/lawyer-language/);
  });

  it("pins the grand-jury-disclosure example so it can't silently drift", () => {
    // The worked example is what tells the model that 'sought disclosure
    // of grand jury materials due to prosecutorial misconduct' should match
    // 'MOTION to Dismiss for Rule 6 and Grand Jury Violations'.
    expect(sys).toMatch(/Rule 6 and Grand Jury Violations/);
    expect(sys).toMatch(/Disclosure of Certain Grand Jury Records/);
  });

  it("maps prosecutorial-misconduct umbrella to the doctrinal vocabulary", () => {
    expect(sys).toMatch(/Vindictive and Selective Prosecution/);
    expect(sys).toMatch(/Outrageous Government Conduct/);
    expect(sys).toMatch(/Brady violations|Brady/);
  });

  it("requires the reason field to name the specific docket-language match", () => {
    expect(sys).toMatch(/the 'reason' should name the specific docket-language match/);
  });
});

// ============================================================================
// PR 5a — Refinement series #2: motion→order chain queries. Pins the planner's
// COURT-ACTION-ON-MOTION pattern guidance + the synthesis's motion-order pair
// classification rule. Drives off the 2026-05-29 validation finding that PR 4z
// fixed the planner's vocabulary fan-out but left the synthesis too literal
// about "GRANTED" — Comey/James/Broadview (all with motion→order chains for
// grand jury disclosure) didn't surface in the cited list.
// ============================================================================

describe("litigation planner — motion→order chain queries (PR 5a)", () => {
  const sys = buildPlanningSystem();

  it("names the court-action-on-motion question shape explicitly", () => {
    expect(sys).toMatch(/COURT-ACTION-ON-MOTION/);
  });

  it("explains why a single-entry FTS can't answer chain questions", () => {
    expect(sys).toMatch(/the order entry frequently references the motion only by entry number/);
  });

  it("provides a within-case chain CTE template (motion CTE × order CTE JOIN)", () => {
    expect(sys).toMatch(/WITH gjmotions AS/);
    expect(sys).toMatch(/gjorders/);
    expect(sys).toMatch(/JOIN gjorders o USING \(cl_id\)/);
    expect(sys).toMatch(/order_entry > m\.motion_entry/i);
  });

  it("warns about running the chain query at full-corpus scale without scope narrowing", () => {
    expect(sys).toMatch(/Avoid this pattern over the FULL 1\.09M-case corpus/);
  });

  it("pins the empirically-validated recovery counts as the chain worked-example", () => {
    // Comey 27×77, James 26×59, Rabbitt 3×9 are the live-corpus probe results
    // that justify the chain pattern; if these numbers move materially the
    // worked example should be re-validated, not silently edited.
    expect(sys).toMatch(/Comey 27.{0,3}77/);
    expect(sys).toMatch(/James 26.{0,3}59/);
    expect(sys).toMatch(/Rabbitt 3.{0,3}9/);
  });
});

describe("litigation synthesis — motion-order pair classification (PR 5a)", () => {
  const sysHybrid = buildSynthesisSystem('hybrid');
  const sysList = buildSynthesisSystem('list');
  const sysNarrative = buildSynthesisSystem('narrative');

  it("names the classification rule across all three output modes", () => {
    [sysHybrid, sysList, sysNarrative].forEach((sys) => {
      expect(sys).toMatch(/MOTION→ORDER CHAIN CLASSIFICATION/);
    });
  });

  it("instructs the model to classify pairs by substance, not by literal 'GRANTED'", () => {
    expect(sysHybrid).toMatch(/Don't over-narrow on the literal word "GRANTED"/);
  });

  it("names all six response patterns (full grant, in-camera-only, partial, denial, scheduling, unrelated)", () => {
    // The taxonomy is what stops the model from dropping James-style
    // in-camera-only orders + the Comey-style denial-on-different-grounds
    // edge case. Tests pin each label so silent edits don't erode the
    // coverage.
    expect(sysHybrid).toMatch(/Granted in full/);
    expect(sysHybrid).toMatch(/Granted for in camera review only/);
    expect(sysHybrid).toMatch(/Granted in part \/ denied in part/);
    expect(sysHybrid).toMatch(/\*\*Denied\*\*/);
    expect(sysHybrid).toMatch(/\*\*Scheduling/);
    expect(sysHybrid).toMatch(/\*\*Order on a different motion in the same case\*\*/);
  });

  it("specifically calls out the James pattern (in camera review IS a form of grant)", () => {
    expect(sysHybrid).toMatch(/in camera/);
    expect(sysHybrid).toMatch(/Government is directed to submit/);
    expect(sysHybrid).toMatch(/the court overcame the presumption of grand jury secrecy/);
  });

  it("requires synthesis to surface the distribution of response types in the answer markdown", () => {
    expect(sysHybrid).toMatch(/give the user a sense of the distribution/);
    expect(sysHybrid).toMatch(/the in-camera-only count/);
  });

  it("excludes pure scheduling orders from the cited list (regression guard)", () => {
    // A common failure mode would be padding cl_ids with cases that have
    // only scheduling/extension orders matching the chain. The rule is
    // explicit: don't pad. Tests pin the guidance.
    expect(sysHybrid).toMatch(/NOT responsive on its own — don't pad the cited list/);
  });
});

// ============================================================================
// parseUsageLogRequest — usage + annotation log (ragtime-usage-log-feedback).
// Validates the client-assembled interaction record before the Worker upserts
// it. interaction_id must be a uuid; strings are capped; rating is 1..5 or null.
// ============================================================================
describe("parseUsageLogRequest", () => {
  const validId = "11111111-2222-4333-8444-555555555555";

  it("rejects a missing/invalid interaction_id", () => {
    expect(parseUsageLogRequest({}).ok).toBe(false);
    expect(parseUsageLogRequest({ interaction_id: "nope" }).ok).toBe(false);
    expect(parseUsageLogRequest(null).ok).toBe(false);
  });

  it("accepts a valid uuid and passes through the core trace fields", () => {
    const r = parseUsageLogRequest({
      interaction_id: validId,
      surface: "cfr",
      mode: "ama",
      question: "Is projecting on the Washington Monument prosecutable?",
      output_mode: "hybrid",
      plan: { output_mode: "hybrid", queries: [{ label: "q", sql: "SELECT 1" }] },
      query_summary: [{ label: "q", total_rows: 8, was_truncated: false }],
      answer_markdown: "Yes — 36 CFR § 1.3 …",
      cited_ids: [101, 102],
      candor_notes: ["v1 does not cross-reference USC"],
      cost_cents: 26,
      provider: "anthropic",
      model: "claude-sonnet-4-6"
    });
    expect(r.ok).toBe(true);
    expect(r.value.surface).toBe("cfr");
    expect(r.value.query_summary[0].total_rows).toBe(8);
    expect(r.value.cited_ids).toEqual([101, 102]);
    expect(r.value.cost_cents).toBe(26);
    // un-annotated record has no rating/note
    expect(r.value.rating).toBe(null);
    expect(r.value.note).toBe(null);
  });

  it("keeps a 1..5 rating and drops out-of-range / non-integer ratings", () => {
    expect(parseUsageLogRequest({ interaction_id: validId, rating: 3 }).value.rating).toBe(3);
    expect(parseUsageLogRequest({ interaction_id: validId, rating: 0 }).value.rating).toBe(null);
    expect(parseUsageLogRequest({ interaction_id: validId, rating: 6 }).value.rating).toBe(null);
    expect(parseUsageLogRequest({ interaction_id: validId, rating: 2.5 }).value.rating).toBe(null);
  });

  it("preserves a free-text note (the human assessment)", () => {
    const r = parseUsageLogRequest({ interaction_id: validId, note: "nailed §1.3 but the Part 7 candor note is wrong" });
    expect(r.value.note).toContain("Part 7 candor note is wrong");
  });

  it("caps oversized strings so a logger can't blow up the row", () => {
    const huge = "x".repeat(200000);
    const r = parseUsageLogRequest({ interaction_id: validId, answer_markdown: huge, question: huge });
    expect(r.value.answer_markdown.length).toBe(100000);
    expect(r.value.question.length).toBe(8000);
  });

  it("coerces wrong-typed structured fields to null rather than trusting them", () => {
    const r = parseUsageLogRequest({
      interaction_id: validId,
      plan: "not-an-object",
      query_summary: "not-an-array",
      cited_ids: { nope: 1 },
      cost_cents: "free"
    });
    expect(r.value.plan).toBe(null);
    expect(r.value.query_summary).toBe(null);
    expect(r.value.cited_ids).toBe(null);
    expect(r.value.cost_cents).toBe(null);
  });
});

// ── Punchlist #6: Analyze + AI-SQL parse hardening ──────────────────────────
// Before this fix, parseAnalysis / parseSqlGen used a bare JSON.parse →
// extractFirstJsonObject chain with no quote-repair or truncation-salvage, so
// an unescaped quote in the analysis markdown (or a truncated tail) returned a
// 502. These mirror the synthesis recovery chain onto both paths.
describe("parseAnalysis — Punchlist #6 recovery chain", () => {
  it("parses clean analyze JSON", () => {
    const raw = JSON.stringify({
      markdown: "## Findings\n\nThe government lost in most cases.",
      annotations: [{ cl_id: 123, rank: 1, label: "lead case" }]
    });
    const r = parseAnalysis(raw);
    expect(r.markdown).toContain("The government lost");
    expect(r.annotations[123]).toEqual({ rank: 1, label: "lead case" });
  });

  it("strips ```json fences", () => {
    const raw = '```json\n{"markdown":"# Title\\n\\nBody text here is long enough.","annotations":[]}\n```';
    const r = parseAnalysis(raw);
    expect(r.markdown).toContain("Body text here");
  });

  it("recovers when the markdown field has an unescaped double-quote", () => {
    // The court called it a "vindictive" prosecution — raw quotes break JSON.parse.
    const raw = '{"markdown":"The court called it a "vindictive" prosecution, citing bad faith throughout the record.","annotations":[]}';
    const r = parseAnalysis(raw);
    expect(r.markdown).toContain("vindictive");
    expect(r.markdown).toContain("prosecution");
  });

  it("salvages a truncated analysis (cut off mid-markdown)", () => {
    const longBody = "The government is not prevailing. ".repeat(20);
    const raw = '{"markdown":"## Win/Loss Analysis\\n\\n' + longBody; // no closing quote/brace
    const r = parseAnalysis(raw);
    expect(r.markdown).toContain("Win/Loss Analysis");
    expect(r.markdown).toContain("truncated");
    expect(r.annotations).toEqual({});
  });

  it("still throws on genuinely unparseable garbage", () => {
    expect(() => parseAnalysis("not json at all, no markdown field")).toThrow();
  });

  it("salvageTruncatedAnalysis returns null when not truncated", () => {
    const raw = '{"markdown":"short and complete","annotations":[]}';
    expect(salvageTruncatedAnalysis(raw)).toBe(null);
  });

  it("salvageTruncatedAnalysis returns null when too little content", () => {
    const raw = '{"markdown":"tiny'; // < 50 chars, no closer
    expect(salvageTruncatedAnalysis(raw)).toBe(null);
  });

  it("repairAnalysisMarkdownQuotes is a no-op without a markdown field", () => {
    const s = '{"foo":"bar"}';
    expect(repairAnalysisMarkdownQuotes(s)).toBe(s);
  });
});

describe("parseSqlGen — Punchlist #6 quote repair", () => {
  it("parses clean sql-gen JSON", () => {
    const raw = '{"sql":"SELECT cl_id FROM cases WHERE court = \'dcd\'","label":"DC district cases"}';
    const v = parseSqlGen(raw);
    expect(v.sql).toContain("SELECT cl_id");
    expect(v.label).toBe("DC district cases");
  });

  it("recovers when the sql field has an unescaped double-quoted identifier", () => {
    // The model emitted a double-quoted identifier without escaping it.
    const raw = '{"sql":"SELECT "cl_id" FROM cases","label":"all cases"}';
    const v = parseSqlGen(raw);
    expect(v.sql).toContain("cl_id");
    expect(v.label).toBe("all cases");
  });

  it("does not fabricate sql from unparseable output", () => {
    expect(() => parseSqlGen("totally not json")).toThrow();
  });

  it("repairSqlGenQuotes is a no-op without a sql field", () => {
    const s = '{"label":"x"}';
    expect(repairSqlGenQuotes(s)).toBe(s);
  });
});

// ── Broad-AI-search hardening package (timeout guard + run-anyway) ───────────
describe("is57014 (statement_timeout detection)", () => {
  it("matches the Postgres 57014 code inside a run_query error body", () => {
    expect(is57014(new Error('run_query 500: {"code":"57014","message":"canceling statement due to statement timeout"}'))).toBe(true);
  });
  it("matches heavy-runner errors (same prefix)", () => {
    expect(is57014(new Error('run_query 400: {"code":"57014"}'))).toBe(true);
  });
  it("is false for unrelated errors", () => {
    expect(is57014(new Error("run_query 400: syntax error at or near"))).toBe(false);
    expect(is57014(null)).toBe(false);
    expect(is57014(undefined)).toBe(false);
  });
});

describe("parseExplainTotalCost", () => {
  it("reads the root node Total Cost from EXPLAIN FORMAT JSON output", () => {
    const plan = [{ Plan: { "Node Type": "Unique", "Total Cost": 157161.23 } }];
    expect(parseExplainTotalCost(plan)).toBeCloseTo(157161.23);
  });
  it("accepts an unwrapped object too", () => {
    expect(parseExplainTotalCost({ Plan: { "Total Cost": 42 } })).toBe(42);
  });
  it("returns null when the shape is missing or malformed (caller falls through to normal execution)", () => {
    expect(parseExplainTotalCost(null)).toBe(null);
    expect(parseExplainTotalCost([])).toBe(null);
    expect(parseExplainTotalCost([{ Plan: {} }])).toBe(null);
    expect(parseExplainTotalCost([{ Plan: { "Total Cost": "oops" } }])).toBe(null);
    expect(parseExplainTotalCost("not json")).toBe(null);
  });
});

describe("heavyCostThreshold", () => {
  it("defaults to 100000 when env is unset/blank/invalid", () => {
    expect(heavyCostThreshold({})).toBe(100000);
    expect(heavyCostThreshold({ HEAVY_COST_THRESHOLD: "" })).toBe(100000);
    expect(heavyCostThreshold({ HEAVY_COST_THRESHOLD: "abc" })).toBe(100000);
    expect(heavyCostThreshold({ HEAVY_COST_THRESHOLD: "0" })).toBe(100000);
    expect(heavyCostThreshold({ HEAVY_COST_THRESHOLD: "-5" })).toBe(100000);
  });
  it("honors a valid positive override (tune from the usage log without a deploy)", () => {
    expect(heavyCostThreshold({ HEAVY_COST_THRESHOLD: "120000" })).toBe(120000);
    expect(heavyCostThreshold({ HEAVY_COST_THRESHOLD: "50000" })).toBe(50000);
  });
  it("brackets the calibration data: metadata seq scan (58K) below, timeout class (157K) above", () => {
    const t = heavyCostThreshold({});
    expect(58011).toBeLessThan(t);   // full-corpus metadata ILIKE — fast, must NOT flag
    expect(157161).toBeGreaterThan(t); // reported timeout query — must flag
  });
});

// ============================================================================
// Usage-logging gate (public-no-logging posture). The public service ships
// with NO logging: both server-side logging paths require the shared secret
// USAGE_LOG_TOKEN, carried only by Ben's internal build as X-Usage-Log-Token.
// These pin that an unconfigured token, a missing header, or a wrong header
// all deny logging — so "our code does not log them" holds for public users.
// ============================================================================
describe("buildUsageLogSuccessRow (server-side trace capture)", () => {
  const base = {
    interaction_id: "11111111-2222-3333-4444-555555555555",
    authMode: "demo", userId: null, surface: "lawfare", mode: "ama",
    question: "what has Lapatina argued", output_mode: "narrative",
    plan: { queries: [{ sql: "SELECT 1" }] }, query_summary: [{ label: "q1", total_rows: 5 }],
    answer_markdown: "In ... she argued ...", cited_ids: [13, 84], candor_notes: ["caveat"],
    cost_cents: 4.2, provider: "anthropic", model: "claude-opus-4-8",
  };

  it("captures the full trace under the client's interaction_id", () => {
    const row = buildUsageLogSuccessRow(base);
    expect(row.interaction_id).toBe(base.interaction_id);
    expect(row.surface).toBe("lawfare");
    expect(row.mode).toBe("ama");
    expect(row.answer_markdown).toContain("she argued");
    expect(row.cited_ids).toEqual([13, 84]);
    expect(row.cost_cents).toBe(4.2);
  });

  it("NEVER includes rating/note/annotated_at — so it can't clobber a user annotation on merge-upsert", () => {
    const row = buildUsageLogSuccessRow(base);
    expect("rating" in row).toBe(false);
    expect("note" in row).toBe(false);
    expect("annotated_at" in row).toBe(false);
  });

  it("coerces malformed trace fields to null rather than emitting junk", () => {
    const row = buildUsageLogSuccessRow({
      interaction_id: base.interaction_id, surface: "lawfare", mode: "ama",
      plan: "not-an-object", query_summary: "nope", cited_ids: "nope", cost_cents: Infinity,
    });
    expect(row.plan).toBeNull();
    expect(row.query_summary).toBeNull();
    expect(row.cited_ids).toBeNull();
    expect(row.cost_cents).toBeNull();
  });
});

describe("corsHeaders (preflight allow-list)", () => {
  it("allows the X-Usage-Log-Token header so the browser annotation POST is not blocked", () => {
    // The client annotation save sends a custom X-Usage-Log-Token header; if it
    // is absent from Access-Control-Allow-Headers the browser blocks the request
    // at preflight (and the in-app "Save note" fails). Regression guard.
    const allow = corsHeaders()["Access-Control-Allow-Headers"];
    expect(allow).toContain("X-Usage-Log-Token");
    expect(allow).toContain("Content-Type");
    expect(allow).toContain("Authorization");
  });
});

describe("timingSafeStrEqual", () => {
  it("true only for equal-length identical strings", () => {
    expect(timingSafeStrEqual("abc123", "abc123")).toBe(true);
  });
  it("false on mismatch, length difference, or non-strings", () => {
    expect(timingSafeStrEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeStrEqual("abc", "abcd")).toBe(false);
    expect(timingSafeStrEqual("", "")).toBe(true);
    expect(timingSafeStrEqual(null, "x")).toBe(false);
    expect(timingSafeStrEqual("x", undefined)).toBe(false);
  });
});

describe("usageLogAuthorized (internal-only logging gate)", () => {
  const req = (headerVal) => ({
    headers: { get: (h) => (h === "X-Usage-Log-Token" && headerVal != null ? headerVal : null) },
  });
  it("denies when USAGE_LOG_TOKEN is unconfigured (public default)", () => {
    expect(usageLogAuthorized(req("anything"), {})).toBe(false);
    expect(usageLogAuthorized(req("anything"), { USAGE_LOG_TOKEN: "" })).toBe(false);
  });
  it("denies when the header is absent even with a configured token", () => {
    expect(usageLogAuthorized(req(null), { USAGE_LOG_TOKEN: "s3cret" })).toBe(false);
  });
  it("denies on a wrong token", () => {
    expect(usageLogAuthorized(req("nope"), { USAGE_LOG_TOKEN: "s3cret" })).toBe(false);
  });
  it("authorizes only on an exact token match", () => {
    expect(usageLogAuthorized(req("s3cret"), { USAGE_LOG_TOKEN: "s3cret" })).toBe(true);
  });
});

describe("usageLoggingAllowed (demo-mode is the primary gate)", () => {
  const req = (headerVal) => ({
    headers: { get: (h) => (h === "X-Usage-Log-Token" && headerVal != null ? headerVal : null) },
  });
  it("allows DEMO sessions regardless of any token", () => {
    expect(usageLoggingAllowed("demo", req(null), {})).toBe(true);
    expect(usageLoggingAllowed("demo", req(null), { USAGE_LOG_TOKEN: "s3cret" })).toBe(true);
  });
  it("does NOT log public paid/BYOK sessions (no token configured)", () => {
    expect(usageLoggingAllowed("paid", req(null), {})).toBe(false);
    expect(usageLoggingAllowed("byok", req("anything"), {})).toBe(false);
  });
  it("still honors the dev token path for a non-demo internal build", () => {
    expect(usageLoggingAllowed("paid", req("s3cret"), { USAGE_LOG_TOKEN: "s3cret" })).toBe(true);
    expect(usageLoggingAllowed("byok", req("wrong"), { USAGE_LOG_TOKEN: "s3cret" })).toBe(false);
  });
});

// ============================================================================
// Edge cache for read-only corpus queries. Key correctness: same (path, body)
// → same key; any difference → different key. Wrong keys would either serve a
// stale/incorrect response or never hit. (The cache.put/match flow uses the
// Workers Cache API, exercised in integration; here we pin the key + TTL map.)
// ============================================================================
describe("corpus edge cache key", () => {
  it("is deterministic for identical (path, body)", async () => {
    const a = await corpusCacheKeyUrl("/corpus/filter", '{"q":"x"}');
    const b = await corpusCacheKeyUrl("/corpus/filter", '{"q":"x"}');
    expect(a).toBe(b);
  });
  it("differs when the body differs", async () => {
    const a = await corpusCacheKeyUrl("/corpus/filter", '{"q":"x"}');
    const b = await corpusCacheKeyUrl("/corpus/filter", '{"q":"y"}');
    expect(a).not.toBe(b);
  });
  it("differs when the path differs (same body)", async () => {
    const a = await corpusCacheKeyUrl("/corpus/usc/filter", '{"q":"x"}');
    const b = await corpusCacheKeyUrl("/corpus/cfr/filter", '{"q":"x"}');
    expect(a).not.toBe(b);
  });
  it("produces a stable sha-256 hex digest", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("only whitelists read-only corpus paths (no AI/billing/logging)", () => {
    const paths = Object.keys(CORPUS_CACHE_TTL);
    expect(paths).toContain("/corpus/hub/keyword");
    expect(paths).toContain("/corpus/filter");
    for (const p of ["/corpus/execute", "/corpus/analyze", "/corpus/sql", "/corpus/feedback/log", "/ask"]) {
      expect(paths).not.toContain(p);
    }
    for (const ttl of Object.values(CORPUS_CACHE_TTL)) expect(ttl).toBeGreaterThan(0);
  });
});

// ============================================================================
// Hub fan-out concurrency limiter (load-test fix #4). Bounds how many per-corpus
// FTS queries run at once so a burst of searches doesn't over-subscribe the
// 2-core DB. Pin: order preserved, never exceeds the limit, env-tunable.
// ============================================================================
describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1, 10];
    const out = await mapWithConcurrency(delays, 2, (d, i) =>
      new Promise((res) => setTimeout(() => res(i), d)));
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });
  it("never runs more than `limit` at once", async () => {
    let running = 0, peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
  it("limit 1 is fully sequential (peak 1)", async () => {
    let running = 0, peak = 0;
    await mapWithConcurrency([1, 2, 3], 1, async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 3));
      running--;
    });
    expect(peak).toBe(1);
  });
  it("handles empty input", async () => {
    expect(await mapWithConcurrency([], 2, async () => 1)).toEqual([]);
  });
});

describe("hubFanoutConcurrency", () => {
  it("defaults to 2 when unset or invalid", () => {
    expect(hubFanoutConcurrency({})).toBe(2);
    expect(hubFanoutConcurrency({ HUB_FANOUT_CONCURRENCY: "nan" })).toBe(2);
    expect(hubFanoutConcurrency({ HUB_FANOUT_CONCURRENCY: "0" })).toBe(2);
  });
  it("honors a valid override (incl. 1 = fully serial)", () => {
    expect(hubFanoutConcurrency({ HUB_FANOUT_CONCURRENCY: "1" })).toBe(1);
    expect(hubFanoutConcurrency({ HUB_FANOUT_CONCURRENCY: "3" })).toBe(3);
  });
});

// ============================================================================
// resolveCorpusAuth — demo/internal key split. Internal (Lawfare-password) usage
// must bill ANTHROPIC_API_KEY_DEMO when present so Anthropic's per-key dashboard
// separates internal spend from external paid spend, falling back to the main
// ANTHROPIC_API_KEY when the demo key isn't set (safe to deploy before the key
// exists). Only the demo branch is exercised here — the paid branch needs a
// valid JWT + account and is covered by the auth/JWT tests.
// ============================================================================
describe("resolveCorpusAuth — internal/demo key split", () => {
  function mockKV(initial = {}) {
    const store = { ...initial };
    return {
      store,
      get: vi.fn(async (k) => (k in store ? store[k] : null)),
      put: vi.fn(async (k, v) => { store[k] = v; })
    };
  }
  const ctx = { waitUntil: (p) => p };
  // No Authorization header → password branch; CF-Connecting-IP for the IP limiter.
  const demoRequest = () =>
    new Request("https://worker.test/corpus/plan", {
      method: "POST",
      headers: { "CF-Connecting-IP": "9.9.9.9" }
    });

  it("uses the dedicated demo key when ANTHROPIC_API_KEY_DEMO is set", async () => {
    const env = {
      QUOTA: mockKV(),
      DEMO_PASSWORD: "sekret",
      ANTHROPIC_API_KEY: "sk-main",
      ANTHROPIC_API_KEY_DEMO: "sk-demo",
    };
    const auth = await resolveCorpusAuth(demoRequest(), env, ctx, "anthropic", { password: "sekret" });
    expect(auth.authMode).toBe("demo");
    expect(auth.apiKey).toBe("sk-demo");
  });

  it("falls back to the main key when ANTHROPIC_API_KEY_DEMO is unset", async () => {
    const env = {
      QUOTA: mockKV(),
      DEMO_PASSWORD: "sekret",
      ANTHROPIC_API_KEY: "sk-main",
      // ANTHROPIC_API_KEY_DEMO intentionally absent
    };
    const auth = await resolveCorpusAuth(demoRequest(), env, ctx, "anthropic", { password: "sekret" });
    expect(auth.authMode).toBe("demo");
    expect(auth.apiKey).toBe("sk-main");
  });
});

// ============================================================================
// LEGAL_ADVICE_CANDOR_NOTE — the ToS §3 "not legal advice" candor note, emitted
// by every AMA planner when a question reads like a request for legal advice.
// These tests guard (a) the EXACT note text (Ben/Scott-approved; must not drift
// — it's rendered verbatim to users and ties back to the ToS) and (b) that all
// six planner system prompts actually carry the trigger rule, so a future
// prompt refactor can't silently drop the note from a corpus. (Calibration —
// which questions fire vs stay silent — is an LLM behavior, exercised live, not
// unit-testable here.)
// ============================================================================
describe("LEGAL_ADVICE_CANDOR_NOTE (ToS §3 not-legal-advice note)", () => {
  it("matches the approved text verbatim", () => {
    expect(LEGAL_ADVICE_CANDOR_NOTE).toBe(
      "As stated in RAGtime's Terms of Service, this service does not provide legal advice. " +
      "This output is research. Nothing here creates an attorney-client relationship, or " +
      "provides legal representation or advice to any person. It is not a substitute for a " +
      "qualified attorney's judgment on any person's specific situation."
    );
  });

  const planners = {
    litigation: buildPlanningSystem,
    usc: buildUscPlanningSystem,
    cfr: buildCfrPlanningSystem,
    olc: buildOlcPlanningSystem,
    lawfare: buildLawfarePlanningSystem,
    frus: buildFrusPlanningSystem,
    presidential: buildPresidentialPlanningSystem,
  };

  for (const [name, build] of Object.entries(planners)) {
    it(`${name} planner carries the not-legal-advice trigger + verbatim note`, () => {
      const prompt = build();
      expect(prompt).toContain("NOT-LEGAL-ADVICE NOTE");
      expect(prompt).toContain("UNDER-fire");
      // The exact note must be embedded (JSON.stringify'd) so the planner emits it verbatim.
      expect(prompt).toContain(JSON.stringify(LEGAL_ADVICE_CANDOR_NOTE));
    });
  }
});

// ============================================================================
// Presidential documents spoke (brief #11)
// ============================================================================
describe("buildPresidentialFilterWhere", () => {
  it("returns empty string for empty fields", () => {
    expect(buildPresidentialFilterWhere({})).toBe("");
  });
  it("filters by search FTS with quote escaping", () => {
    const w = buildPresidentialFilterWhere({ search: "national 'emergency'" });
    expect(w).toContain("websearch_to_tsquery('english', 'national ''emergency''')");
  });
  it("filters by doc_type, president, and textQuality exactly", () => {
    const w = buildPresidentialFilterWhere({ docType: "executive_order", president: "joe-biden", textQuality: "metadata_only" });
    expect(w).toContain("doc_type = 'executive_order'");
    expect(w).toContain("president_slug = 'joe-biden'");
    expect(w).toContain("text_quality = 'metadata_only'");
  });
  it("filters by EO and proclamation number as integers (floors floats, ignores junk)", () => {
    expect(buildPresidentialFilterWhere({ eoNumber: 14239 })).toContain("eo_number = 14239");
    expect(buildPresidentialFilterWhere({ eoNumber: "12333.9" })).toContain("eo_number = 12333");
    expect(buildPresidentialFilterWhere({ eoNumber: "DROP TABLE" })).toBe("");
    expect(buildPresidentialFilterWhere({ proclamationNumber: 7647 })).toContain("proclamation_number = 7647");
  });
  it("filters agencies via EXISTS over unnest with escaping", () => {
    const w = buildPresidentialFilterWhere({ agency: "Homeland's" });
    expect(w).toContain("EXISTS (SELECT 1 FROM unnest(agencies)");
    expect(w).toContain("ILIKE '%Homeland''s%'");
  });
  it("applies signing_date bounds only for valid ISO dates", () => {
    const w = buildPresidentialFilterWhere({ from: "2025-01-20", to: "2026-01-01" });
    expect(w).toContain("signing_date >= '2025-01-20'");
    expect(w).toContain("signing_date <= '2026-01-01'");
    expect(buildPresidentialFilterWhere({ from: "garbage" })).toBe("");
  });
  it("joins multiple axes with AND", () => {
    const w = buildPresidentialFilterWhere({ docType: "proclamation", search: "tariff" });
    expect(w.split(" AND ").length).toBe(2);
  });
});

describe("normalizePresidentialScope", () => {
  it("treats missing/empty ids as full-db", () => {
    expect(normalizePresidentialScope({}).is_full_db).toBe(true);
    expect(normalizePresidentialScope({ document_ids: [] }).is_full_db).toBe(true);
  });
  it("keeps numeric ids and drops junk", () => {
    const s = normalizePresidentialScope({ document_ids: [1, "2", null, "x"] });
    expect(s.document_ids).toEqual([1, 2]);
    expect(s.is_full_db).toBe(false);
    expect(s.count).toBe(2);
  });
});

describe("buildPresidentialPlanningSystem", () => {
  it("documents both tables and the central caveats", () => {
    const p = buildPresidentialPlanningSystem();
    expect(p).toContain("presidential_documents");
    expect(p).toContain("presidential_dispositions");
    expect(p).toContain("COVERAGE ASYMMETRY");
    expect(p).toContain("metadata_only");
    expect(p).toContain("scoped_presidential_documents");
  });
  it("teaches the disposition query patterns (status + reversal matrix)", () => {
    const p = buildPresidentialPlanningSystem();
    expect(p).toContain("Is EO X still in effect?");
    expect(p).toContain("NO INBOUND REVOCATION");
    expect(p).toContain("REVERSAL-MATRIX QUESTIONS");
  });
});

describe("buildPresidentialPlanningUser", () => {
  it("describes the full-corpus scope and names presidential_documents", () => {
    const s = normalizePresidentialScope({});
    const u = buildPresidentialPlanningUser("is EO 12333 still in effect?", s);
    expect(u).toContain('use the table name "presidential_documents"');
  });
  it("describes a narrowed scope and names scoped_presidential_documents", () => {
    const s = normalizePresidentialScope({ document_ids: [1, 2, 3] });
    const u = buildPresidentialPlanningUser("count these", s);
    expect(u).toContain("scoped_presidential_documents");
    expect(u).toContain("3");
  });
});

describe("parsePresidentialPlan", () => {
  const good = { output_mode: "hybrid", approach_summary: "plan", candor_notes: [], queries: [{ label: "q", sql: "SELECT 1" }], estimated_cost_cents: 3, wants_synthesis: true };
  it("parses a clean plan and a code-fenced plan", () => {
    expect(parsePresidentialPlan(JSON.stringify(good)).output_mode).toBe("hybrid");
    expect(parsePresidentialPlan("```json\n" + JSON.stringify(good) + "\n```").queries.length).toBe(1);
  });
  it("rejects a bad output_mode", () => {
    expect(() => parsePresidentialPlan(JSON.stringify({ ...good, output_mode: "essay" }))).toThrow(/output_mode/);
  });
});

describe("parsePresidentialSynthesis", () => {
  it("returns document_ids for hybrid mode and nulls them for narrative", () => {
    const v = parsePresidentialSynthesis(JSON.stringify({ answer_markdown: "x", document_ids: [5, "6"], candor_notes: [] }), "hybrid");
    expect(v.document_ids).toEqual([5, 6]);
    const n = parsePresidentialSynthesis(JSON.stringify({ answer_markdown: "x", document_ids: [5], candor_notes: [] }), "narrative");
    expect(n.document_ids).toBe(null);
  });
  it("downgrades gracefully when hybrid synthesis returns no ids", () => {
    const v = parsePresidentialSynthesis(JSON.stringify({ answer_markdown: "x", document_ids: [], candor_notes: [] }), "hybrid");
    expect(v.document_ids).toEqual([]);
    expect(v.candor_notes.join(" ")).toContain("narrative only");
  });
  it("salvage path returns degraded narrative with document_ids = null", () => {
    const truncated =
      '{"answer_markdown": "Executive Order 12333 has been amended three times since 1981. The 2008 amendment restructured';
    const v = parsePresidentialSynthesis(truncated, "narrative");
    expect(v.document_ids).toBe(null);
    expect(v.answer_markdown).toMatch(/12333/);
  });
});

describe("parsePresidentialSummary", () => {
  it("parses a clean summary", () => {
    const v = parsePresidentialSummary(JSON.stringify({ summary_markdown: "ok", candor_notes: [] }));
    expect(v.summary_markdown).toBe("ok");
  });
  it("rejects an empty summary", () => {
    expect(() => parsePresidentialSummary(JSON.stringify({ summary_markdown: "", candor_notes: [] }))).toThrow();
  });
});

describe("buildPresidentialSummarizeUser", () => {
  const doc = { display_citation: "Executive Order 12333", title: "United States Intelligence Activities", doc_type: "executive_order", president_name: "Ronald Reagan", signing_date: "1981-12-04", fr_citation: "46 FR 59941", agencies: ["Central Intelligence Agency"], body_text: "x".repeat(100) };
  it("includes the disposition trail in both directions", () => {
    // Inbound 'amends' = EO 13470's own note "Amends: EO 12333" — forward
    // voice, so it lands under WHAT LATER DOCUMENTS DID (flipped passive).
    const u = buildPresidentialSummarizeUser(doc,
      [{ relationship: "revokes", target_raw: "EO 12036", target_citation: "Executive Order 12036" }],
      [{ relationship: "amends", source_citation: "Executive Order 13470", source_signing_date: "2008-07-30" }],
      false);
    expect(u).toContain("WHAT THIS DOCUMENT DID TO PRIOR INSTRUMENTS");
    expect(u).toContain("Executive Order 12036");
    expect(u).toContain("WHAT LATER DOCUMENTS DID TO THIS ONE");
    expect(u).toContain("amended_by — Executive Order 13470");
  });
  it("normalizes verb voice across both edge directions", () => {
    // Own row carries reverse-voice "Amended by: EO 13284" → something
    // done TO this document, not something it did. Inbound 'revoked_by'
    // = EO 12036's note "Revoked by: EO 12333" → this document revoked
    // 12036.
    const u = buildPresidentialSummarizeUser(doc,
      [{ relationship: "amended_by", target_raw: "EO 13284", target_citation: "Executive Order 13284" }],
      [{ relationship: "revoked_by", source_citation: "Executive Order 12036", source_signing_date: "1978-01-24" }],
      false);
    expect(u).toContain("WHAT LATER DOCUMENTS DID TO THIS ONE");
    expect(u).toContain("amended_by — Executive Order 13284");
    expect(u).toContain("WHAT THIS DOCUMENT DID TO PRIOR INSTRUMENTS");
    expect(u).toContain("revokes: Executive Order 12036");
  });
  it("flags truncation", () => {
    const big = { ...doc, body_text: "x".repeat(PRESIDENTIAL_SUMMARIZE_TEXT_CAP + 10) };
    const u = buildPresidentialSummarizeUser(big, [], [], true);
    expect(u).toContain("TRUNCATED");
    expect(u.length).toBeLessThan(PRESIDENTIAL_SUMMARIZE_TEXT_CAP + 5000);
  });
});

describe("buildHubQueriesPresidential", () => {
  it("returns the normalized hub shape with FTS + recency order", () => {
    const { rowsSql, countSql } = buildHubQueriesPresidential("tariff", 5);
    expect(rowsSql).toContain("FROM presidential_documents");
    expect(rowsSql).toContain("websearch_to_tsquery('english', 'tariff')");
    expect(rowsSql).toContain("display_citation AS context");
    expect(rowsSql).toContain("ORDER BY signing_date DESC NULLS LAST LIMIT 5");
    expect(countSql).toContain("count(*)::bigint");
  });
});

describe("buildClemencyFilterWhere", () => {
  it("returns empty for empty fields", () => {
    expect(buildClemencyFilterWhere({})).toBe("");
  });
  it("filters by clemency_type, president (ILIKE), topic, provenance exactly", () => {
    const w = buildClemencyFilterWhere({ clemencyType: "Commutation", president: "Biden", topic: "January 6", provenance: "wikipedia_derived" });
    expect(w).toContain("clemency_type = 'Commutation'");
    expect(w).toContain("president_name ILIKE '%Biden%'");
    expect(w).toContain("topic = 'January 6'");
    expect(w).toContain("provenance = 'wikipedia_derived'");
  });
  it("escapes single quotes in search and person", () => {
    expect(buildClemencyFilterWhere({ search: "O'Brien" })).toContain("''Brien");
    expect(buildClemencyFilterWhere({ person: "D'Angelo" })).toContain("ILIKE '%D''Angelo%'");
  });
  it("treats reoffended only as a true boolean flag", () => {
    expect(buildClemencyFilterWhere({ reoffended: true })).toContain("has_reoffended");
    expect(buildClemencyFilterWhere({ reoffended: false })).toBe("");
  });
  it("applies grant_date bounds only for valid ISO dates", () => {
    expect(buildClemencyFilterWhere({ from: "2025-01-20" })).toContain("grant_date >= '2025-01-20'");
    expect(buildClemencyFilterWhere({ to: "junk" })).toBe("");
  });
});

describe("presidential registry membership", () => {
  it("is in HUB_CORPORA and SEMANTIC_CORPORA", () => {
    expect(HUB_CORPORA).toContain("presidential");
    expect(SEMANTIC_CORPORA).toContain("presidential");
  });
  it("buildSemanticMetaSql returns the (id,title,context,date) shape", () => {
    const sql = buildSemanticMetaSql("presidential", ["12", "34"]);
    expect(sql).toContain("FROM presidential_documents WHERE id IN (12,34)");
    expect(sql).toContain("display_citation AS context");
    expect(sql).toContain("signing_date::text AS date");
  });
});

describe("service-health probes (30-min cron)", () => {
  describe("healthAlertLines", () => {
    it("returns no lines when every probe is healthy", () => {
      expect(healthAlertLines([
        { name: "corpus_db", ok: true, slow: false, ms: 120, detail: null },
        { name: "hub_keyword", ok: true, slow: false, ms: 900, detail: "MISS" }
      ])).toEqual([]);
    });

    it("flags a failed probe with its duration and detail", () => {
      const lines = healthAlertLines([
        { name: "corpus_db", ok: false, slow: false, ms: 30000, detail: "HTTP 503" }
      ]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("corpus_db");
      expect(lines[0]).toContain("FAILED after 30000ms");
      expect(lines[0]).toContain("HTTP 503");
    });

    it("flags a slow-but-successful probe", () => {
      const lines = healthAlertLines([
        { name: "hub_keyword", ok: true, slow: true, ms: 45000, detail: "MISS" }
      ]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("slow — 45000ms");
    });

    it("reports each unhealthy probe and skips the healthy ones", () => {
      const lines = healthAlertLines([
        { name: "corpus_db", ok: true, slow: false, ms: 100, detail: null },
        { name: "app_db", ok: false, slow: false, ms: 5000, detail: "HTTP 500" },
        { name: "hub_keyword", ok: true, slow: true, ms: 30000, detail: null }
      ]);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("app_db");
      expect(lines[1]).toContain("hub_keyword");
    });

    it("truncates a runaway error detail to 200 chars", () => {
      const lines = healthAlertLines([
        { name: "corpus_db", ok: false, slow: false, ms: 1, detail: "x".repeat(500) }
      ]);
      expect(lines[0].length).toBeLessThan(300);
    });
  });

  describe("runHealthProbe", () => {
    it("marks success under the slow threshold", async () => {
      const r = await runHealthProbe("p", 5000, async () => "HIT");
      expect(r).toMatchObject({ name: "p", ok: true, slow: false, detail: "HIT" });
      expect(r.ms).toBeGreaterThanOrEqual(0);
    });

    it("marks slow when fn exceeds the threshold", async () => {
      const r = await runHealthProbe("p", 0, async () => {
        await new Promise((res) => setTimeout(res, 5));
      });
      expect(r.ok).toBe(true);
      expect(r.slow).toBe(true);
    });

    it("captures a thrown error as ok:false without throwing", async () => {
      const r = await runHealthProbe("p", 5000, async () => {
        throw new Error("connection refused");
      });
      expect(r.ok).toBe(false);
      expect(r.detail).toBe("connection refused");
    });
  });

  describe("logRequest ({ev:'req'} per-request line)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("logs a content-free line with path, method, status, ms", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      logRequest(
        new Request("https://x.test/corpus/hub/keyword", { method: "POST" }),
        new Response("{}", { status: 200, headers: { "X-RT-Cache": "HIT" } }),
        42
      );
      const line = JSON.parse(log.mock.calls[0][0]);
      expect(line).toEqual({
        ev: "req", path: "/corpus/hub/keyword", method: "POST", status: 200, ms: 42, cache: "HIT"
      });
    });

    it("routes 5xx lines to console.error", () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      logRequest(
        new Request("https://x.test/ask", { method: "POST" }),
        new Response("oops", { status: 502 }),
        7
      );
      expect(JSON.parse(err.mock.calls[0][0]).status).toBe(502);
    });

    it("skips OPTIONS preflights and caps scanner-junk paths at 80 chars", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      logRequest(new Request("https://x.test/ask", { method: "OPTIONS" }), new Response(""), 1);
      expect(log).not.toHaveBeenCalled();
      logRequest(
        new Request("https://x.test/" + "a".repeat(300), { method: "GET" }),
        new Response("", { status: 404 }),
        1
      );
      expect(JSON.parse(log.mock.calls[0][0]).path.length).toBe(80);
    });
  });
});

describe("semantic search (pilot)", () => {
  describe("parseSemanticSearchRequest", () => {
    it("accepts a pilot corpus with defaults", () => {
      const p = parseSemanticSearchRequest({ corpus: "olc", query: "executive privilege scope" });
      expect(p).toEqual({ corpus: "olc", query: "executive privilege scope", k: 12, mode: "hybrid" });
    });
    it("accepts mode=semantic (vector-only, for the spoke segregated view)", () => {
      expect(parseSemanticSearchRequest({ corpus: "olc", query: "q", mode: "semantic" }).mode).toBe("semantic");
      expect(parseSemanticSearchRequest({ corpus: "olc", query: "q", mode: "hybrid" }).mode).toBe("hybrid");
    });
    it("rejects unknown modes", () => {
      expect(parseSemanticSearchRequest({ corpus: "olc", query: "q", mode: "fused" }).error).toMatch(/mode/i);
      expect(parseSemanticSearchRequest({ corpus: "olc", query: "q", mode: "keyword" }).error).toMatch(/mode/i);
    });
    it("rejects non-pilot corpora (litigation is deliberately out)", () => {
      expect(parseSemanticSearchRequest({ corpus: "litigation", query: "x" }).error).toMatch(/unsupported/i);
      expect(parseSemanticSearchRequest({ corpus: "usc", query: "x" }).error).toMatch(/unsupported/i);
      expect(parseSemanticSearchRequest({ query: "x" }).error).toBeTruthy();
    });
    it("semantic list is exactly olc/frus/lawfare/presidential", () => {
      expect(SEMANTIC_CORPORA).toEqual(["olc", "frus", "lawfare", "presidential"]);
    });
    it("rejects missing and oversize queries", () => {
      expect(parseSemanticSearchRequest({ corpus: "olc" }).error).toMatch(/missing/i);
      expect(parseSemanticSearchRequest({ corpus: "olc", query: "q".repeat(501) }).error).toMatch(/too long/i);
    });
    it("clamps k to [1, 50] and defaults junk to 12", () => {
      expect(parseSemanticSearchRequest({ corpus: "frus", query: "q", k: 999 }).k).toBe(50);
      expect(parseSemanticSearchRequest({ corpus: "frus", query: "q", k: 0 }).k).toBe(12);
      expect(parseSemanticSearchRequest({ corpus: "frus", query: "q", k: "nope" }).k).toBe(12);
      expect(parseSemanticSearchRequest({ corpus: "frus", query: "q", k: 5 }).k).toBe(5);
    });
  });

  describe("vecLiteral", () => {
    it("renders a pgvector input literal", () => {
      expect(vecLiteral([0.5, -1, 0.0000004])).toBe("[0.500000,-1.000000,0.000000]");
    });
  });

  describe("stripChunkHeader", () => {
    it("drops the structural header before the first blank line", () => {
      expect(stripChunkHeader("OLC Opinion: X\n2026-01-01\n\nThe body text.")).toBe("The body text.");
    });
    it("passes through header-less content", () => {
      expect(stripChunkHeader("just body")).toBe("just body");
    });
  });

  describe("rrfFuse", () => {
    it("ranks a doc found by both branches above single-branch docs", () => {
      const fused = rrfFuse(["a", "b", "c"], ["x", "a"], 10);
      expect(fused[0].id).toBe("a");
      expect(fused[0].matched).toBe("both");
      expect(fused.map((f) => f.id).sort()).toEqual(["a", "b", "c", "x"]);
    });
    it("labels single-branch provenance", () => {
      const fused = rrfFuse(["s1"], ["k1"], 10);
      const byId = Object.fromEntries(fused.map((f) => [f.id, f.matched]));
      expect(byId.s1).toBe("semantic");
      expect(byId.k1).toBe("keyword");
    });
    it("respects k", () => {
      const fused = rrfFuse(["a", "b", "c"], ["d", "e"], 2);
      expect(fused.length).toBe(2);
    });
    it("handles an empty branch (degraded mode)", () => {
      const fused = rrfFuse([], ["k1", "k2"], 10);
      expect(fused.map((f) => f.id)).toEqual(["k1", "k2"]);
    });
  });

  describe("buildSemanticMetaSql", () => {
    it("targets the right table per corpus", () => {
      expect(buildSemanticMetaSql("olc", ["1", "2"])).toContain("FROM olc_opinions");
      expect(buildSemanticMetaSql("frus", ["3"])).toContain("FROM frus_documents");
      expect(buildSemanticMetaSql("lawfare", ["4"])).toContain("FROM lawfare_documents");
    });
    it("sanitizes ids to integers (no injection through the id path)", () => {
      const sql = buildSemanticMetaSql("olc", ["7; DROP TABLE x", "abc", "42"]);
      expect(sql).toContain("IN (7,42)");
      expect(sql).not.toContain("DROP");
    });
    it("returns null when no valid ids remain", () => {
      expect(buildSemanticMetaSql("olc", ["abc"])).toBeNull();
      expect(buildSemanticMetaSql("olc", [])).toBeNull();
    });
  });
});
