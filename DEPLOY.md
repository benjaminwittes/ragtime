# Deploying RAGtime

RAGtime has two independently deployed pieces: the **frontend** (static HTML on GitHub Pages) and the **Worker** (Cloudflare). The database, auth, and payments live in managed services (Supabase, Stripe) configured out-of-band.

> The canonical operational reference — full architecture, the Worker environment manifest, Stripe/Supabase configuration, and operational gotchas — is the project handoff document held outside this repo. This file covers the mechanics a contributor needs to ship a change.

## Frontend (GitHub Pages)

The frontend is the single file `index.html`, served from `main` via GitHub Pages. Deploy = commit to `main`; Pages republishes within ~30 seconds. Cache-busting is via the `APP_VERSION` constant in the source (shown in the UI, so a hard refresh confirms the deploy landed).

## Worker (Cloudflare, via wrangler)

The Worker (`ragtimeproxy`) deploys from `worker/` using `wrangler`, driven by `.github/workflows/deploy-worker.yml`:

| Trigger | Result |
|---|---|
| PR touching `worker/**` | `wrangler deploy --dry-run` — CI validation only; never touches live |
| Push to `main` touching `worker/**` | `wrangler deploy` — the real deploy |
| Manual run (Actions tab → "Deploy Worker") | dry-run or real, per the `dry_run` input |

After a push to `main` that changes the Worker, the live Worker matches `main`. Rollback = `git revert` + push.

### Required CI credentials

- **`CLOUDFLARE_API_TOKEN`** (repo *secret*) — an account-scoped Cloudflare API token with **Workers Scripts: Edit** *and* **Workers KV Storage: Edit**. The KV write permission is required because the Worker binds a KV namespace; without it, deploys fail with `code: 10023 — kv bindings require kv write perms`.
- **`CLOUDFLARE_ACCOUNT_ID`** (repo *variable*) — the Cloudflare account ID. Not a secret, so it's a variable (visible in workflow logs for debugging).

### Configuration (non-secret bindings)

Non-secret bindings live in `worker/wrangler.toml`: the `QUOTA` KV namespace, the public Supabase URL, the app base URL, and the three Stripe price IDs. Edit them there and merge to `main` to redeploy. When the frontend moves to a Lawfare-branded domain, update `APP_BASE_URL` there.

### Secrets

Secrets are **not** in `wrangler.toml` or anywhere in this repo, and `wrangler deploy` does **not** touch existing secret bindings. The Worker requires these secret bindings:

- `ANTHROPIC_API_KEY` — Lawfare-org Anthropic key
- `STRIPE_SECRET_KEY` — Stripe live-mode secret
- `STRIPE_WEBHOOK_SECRET` — Stripe live-mode webhook signing secret
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Secret API Key (admin scope)

To set or rotate one:

```bash
cd worker
wrangler secret put ANTHROPIC_API_KEY   # prompts for the value, hidden
```

(or use the Cloudflare dashboard → the `ragtimeproxy` Worker → Settings → Variables and Secrets). After rotating an upstream credential at Stripe / Supabase / Anthropic, update the matching Worker secret the same way.

Optional bindings the code respects (defaults apply if unset): `DEMO_PASSWORD`, `BALANCE_FLOOR_CENTS` (default 5), `MARKUP` (default 1.35), `PER_USER_PER_MIN` (paid per-account requests/min, default 30; also settable in `wrangler.toml`). The legacy `SUPABASE_JWT_SECRET` (old HS256 JWT fallback) is **no longer read by any code** — the verifier is ES256-only — so if it's still bound on the Worker it can be deleted.

### Secret-rotation runbook

`SUPABASE_SERVICE_ROLE_KEY` is the highest-value secret: it has full, RLS-bypassing admin over the APP (billing/PII) database. It lives only as a Worker secret binding (never in the client or this repo) and the Worker code never logs it, but if it is ever exposed, rotate immediately. Each `wrangler secret put` updates the binding atomically with **zero downtime** (the new value applies to subsequent requests; in-flight requests finish on the old isolate), so rotation is safe to do live.

**Rotate the Supabase service-role key:**

1. In the Supabase dashboard (the **APP** project) → **Settings → API Keys**, create a new secret key (`sb_secret_…`).
2. Push it to the Worker: `cd worker && wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (paste the new value).
3. Smoke-test the paid path (sign in → `/api/balance` returns 200; run one paid query → it charges). If anything 500s with a Supabase auth error, the new key is wrong — re-do step 2 with a correct key before proceeding.
4. **Revoke the old key** in the Supabase dashboard. Confirm the app still works (you're now on the new key).

**Same pattern for the others:** rotate the upstream credential first (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` at Stripe, `ANTHROPIC_API_KEY` at Anthropic), then `wrangler secret put <NAME>`, smoke-test, then revoke the old upstream credential. For `STRIPE_WEBHOOK_SECRET`, roll the endpoint's signing secret in the Stripe dashboard and update the binding in the same window (a brief mismatch makes webhooks 400 and Stripe retries, so no events are lost).

A periodic rotation drill (even just the service-role key) is worth running once before launch so the procedure is proven, not theoretical.

## Database, Auth, Payments (managed services)

- **Supabase (PostgreSQL 17)** hosts the litigation corpus and the RAGtime billing tables (`accounts`, `ledger`, `processed_stripe_events`). The `apply_balance_change` RPC is the single write path for balance changes (atomic ledger insert + balance update). Sign-in is Supabase Auth magic-link; the Worker verifies user JWTs via Supabase's JWKS endpoint (ES256).
- **Stripe (live mode)** handles prepaid checkout. The Worker's `/api/stripe/webhook` endpoint receives `checkout.session.completed` (credit) and `charge.refunded` (debit); idempotency is enforced via the `processed_stripe_events` table.

Detailed schema, key management, and Stripe webhook setup are in the handoff document.

## Monitoring & alerts

All alerts go to Slack via the `SLACK_ALERT_WEBHOOK_URL` Worker secret (the `notify()` helper no-ops if it's unset). Sources:

- **Billing anomalies** (in request handlers): webhook handler errors, query-debit failures, chargebacks.
- **Weekly reconciliation** (cron `0 13 * * 1`): alerts if any account's `balance_cents` ≠ `sum(ledger)`.
- **Off-box pipeline liveness** (cron `*/30 * * * *`): alerts if the corpus has received no new documents within `PIPELINE_STALE_MINUTES` (default 120). This runs on Cloudflare, independent of Mac2 — so unlike the pipeline's own on-box watchdog, it still fires if the whole machine dies. Tune the threshold via the `PIPELINE_STALE_MINUTES` var if the harvest cadence changes.

Worker request/error logs: Cloudflare **Workers Observability** (enabled in `wrangler.toml`).

## Smoke-testing a Worker deploy

No-cost checks that the deployed code is live (no LLM calls, no billing):

```bash
# CORS preflight → 204
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS https://<worker-url>/ask

# unknown route → 404 {"error":{"message":"Not found"}}
curl -s https://<worker-url>/nonexistent
```
