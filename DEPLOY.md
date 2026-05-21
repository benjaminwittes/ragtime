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

Optional bindings the code respects (defaults apply if unset): `DEMO_PASSWORD`, `BALANCE_FLOOR_CENTS` (default 5), `MARKUP` (default 1.35), `SUPABASE_JWT_SECRET` (legacy HS256 fallback; unused).

## Database, Auth, Payments (managed services)

- **Supabase (PostgreSQL 17)** hosts the litigation corpus and the RAGtime billing tables (`accounts`, `ledger`, `processed_stripe_events`). The `apply_balance_change` RPC is the single write path for balance changes (atomic ledger insert + balance update). Sign-in is Supabase Auth magic-link; the Worker verifies user JWTs via Supabase's JWKS endpoint (ES256).
- **Stripe (live mode)** handles prepaid checkout. The Worker's `/api/stripe/webhook` endpoint receives `checkout.session.completed` (credit) and `charge.refunded` (debit); idempotency is enforced via the `processed_stripe_events` table.

Detailed schema, key management, and Stripe webhook setup are in the handoff document.

## Smoke-testing a Worker deploy

No-cost checks that the deployed code is live (no LLM calls, no billing):

```bash
# CORS preflight → 204
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS https://<worker-url>/ask

# unknown route → 404 {"error":{"message":"Not found"}}
curl -s https://<worker-url>/nonexistent
```
