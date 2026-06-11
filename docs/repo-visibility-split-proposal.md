# RAGtime repo-visibility split — transition proposal

**Status:** proposal (for review)
**Related:** issue #108 (security posture review), recommendation #6
**Author:** Thomas Kavanagh

## Goal

Split the single public `benjaminwittes/ragtime` repo into two, so that backend
logic and prompt IP stop being anonymously readable while the live product and
its transparency model are unaffected:

- **`ragtime` (stays public)** — the frontend (`app/`), served by GitHub Pages.
  Unchanged for users.
- **`ragtime-worker` (new, private)** — the Cloudflare Worker (`worker/`), the
  DB migrations (`migrations/`), and the internal docs (`CLAUDE.md`,
  `DEPLOY.md`). Transparency to qualified journalists is delivered by
  *individually granting* repo access (collaborator/team), which is only
  meaningful on a private repo.

This mirrors the existing `ragtime` / `ragtime-pipeline` split, extended one
step: as scraping infra is already private, so too should be the backend auth
logic and the planner/synthesis prompts.

## Invariants (must hold throughout the transition)

1. **Zero user-facing downtime** — the live site (`ragtime.lawfaremedia.org`,
   Pages) and the deployed Worker (`ragtimeproxy`) keep serving continuously.
2. **No secret values committed** — history is already verified secret-free
   (issue #108); this stays true.
3. **Worker history preserved** — `worker/` + `migrations/` carry their full
   blame/provenance into the private repo (subdirectory history filter).
4. **Defense-in-depth, not the fix** — this split does not remediate the
   auth-boundary findings (#108 #1–#5). Those land in code regardless; the
   shipped bundle and the reachable Worker expose plenty even with a fully
   private repo.

## What moves where

| Path | Destination | Note |
|---|---|---|
| `app/` | `ragtime` (public) | Frontend; Pages source; unchanged |
| `worker/` | `ragtime-worker` (private) | Backend; auth logic + prompt IP |
| `migrations/` | `ragtime-worker` (private) | `run_query` SQL-sandbox hardening; worker-coupled |
| `CLAUDE.md`, `DEPLOY.md` | `ragtime-worker` (private) | Internal architecture / secret-binding manifest |
| `.github/workflows/deploy-worker.yml` | `ragtime-worker` (private) | Worker deploy pipeline |
| `.github/workflows/*` (app/Pages) | `ragtime` (public) | Stays |
| `supabase/.temp/` | — (neither) | Untracked CLI scratch; add to `.gitignore` |

## Cutover sequence (ordered for zero downtime)

### Phase 0 — stand up the private repo (public repo untouched)

1. Create empty private repo `benjaminwittes/ragtime-worker`.
2. From a fresh clone of `ragtime`, produce a history-preserving subset:
   ```bash
   git filter-repo \
     --path worker/ --path migrations/ \
     --path CLAUDE.md --path DEPLOY.md
   ```
   (`git-filter-repo` keeps only those paths with their full history.)
3. Push the rewritten history to `ragtime-worker`.
4. Move the worker deploy workflow into `ragtime-worker`. Adjust its trigger
   (the `worker/**` path filter is no longer needed if the repo *is* the
   worker; or preserve the `worker/` subdir layout and keep it). Recreate the
   repo secrets/vars the Action reads: `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID` (plus any others in the workflow).
5. Trigger a deploy from `ragtime-worker` and confirm a **green wrangler
   deploy** of `ragtimeproxy`. Because the code is identical, this is a no-op
   redeploy — no behavior change, no downtime. **The live Worker is now
   deployed from the private repo.**

### Phase 1 — verify parity, then freeze the old deploy path

6. Confirm the live Worker still serves (health probe + a free-tier read) and
   that the private repo's Action is the deployer.
7. **Disable the public repo's worker deploy workflow** (so the two Actions
   can't race to deploy the same Worker). From here, worker changes go only to
   the private repo.

### Phase 2 — remove backend from public (only after Phase 1 is green)

8. One PR against public `ragtime`: delete `worker/`, `migrations/`, the moved
   internal docs, and the (now-disabled) worker workflow; add `supabase/.temp/`
   to `.gitignore`; replace `CLAUDE.md` with a slim public `README`/pointer (see
   *Decisions*). Merge to `main`.
9. Verify Pages still serves `app/` unchanged post-merge.

### Phase 3 — access model + optional history scrub

10. Set up journalist access on `ragtime-worker`: individual collaborator
    invites, or a read-only `journalists` team. Document the qualification bar.
11. *(Optional)* Scrub `worker/`/`migrations/` from the **public** repo's
    history too. This removes the backend from public history entirely but
    rewrites public history (breaks existing clones/forks). **Recommended
    default: skip it** — the public history is already verified secret-free
    (#108); the only residual is IP exposure of *past* code, and development
    continues privately. Revisit only if past-prompt-IP disclosure matters.

## Rollback

- **Before Phase 2:** trivial — the public repo is untouched and still holds the
  backend. If the private deploy misbehaves, re-enable the public worker
  workflow and continue as before.
- **After Phase 2:** the backend files are recoverable from git history (and
  live in the private repo); re-adding them to public is a revert. Low risk.

The one race to avoid is two deploy workflows firing on the same Worker — Phase
1 step 7 (disable the public workflow once the private one is green) closes it.

## Decisions needed

1. **`CLAUDE.md`:** full doc private + a minimal public `README`, or keep a
   *redacted* public `CLAUDE.md` (strip the secret-binding manifest / internal
   ops, keep contributor-facing frontend context)?
2. **Public history scrub** (Phase 3 step 11): skip (recommended) or perform?
3. **Access model:** individual invites vs a read-only `journalists` team; and
   the qualification bar for granting access.
4. **Repo name:** `ragtime-worker` (vs `ragtime-backend`).

## Relationship to #108

This implements recommendation #6 of issue #108. It is **defense-in-depth + IP
protection**; the auth-boundary fixes (#1–#5) are independent and tracked in
that issue.
