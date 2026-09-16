# Serving the RAGtime app

The runbook for the box that serves the single-page app. It replaces GitHub Pages,
which cannot send a response header, cannot return a deep link as anything but a
404, and cannot cache a content-hashed asset for longer than ten minutes.

Nothing here is secret. The deploy key lives in repository secrets; the box holds
no application credentials at all, because the app is static and every credential
it uses is the Worker's.

## The shape of the box

| Piece | Where |
|---|---|
| VM | Hetzner `cpx11` (2 vCPU / 2 GB), Ubuntu 24.04, **Ashburn** |
| TLS edge | Caddy from its own apt repository, config at `/etc/caddy/Caddyfile` |
| Site root | `/srv/ragtime-app/current` → a symlink into `releases/<commit-sha>/` |
| Deploy account | unprivileged, owns `/srv/ragtime-app`, no sudo |
| Firewall | Hetzner cloud firewall, inbound 22 / 80 / 443 only |

**Ashburn, not a European region.** The readership is US. GitHub Pages serves them
from a US edge today, and a European box would add roughly 90–110 ms per round trip
to a cold app boot that makes several. Note `cx` server types are EU-only, so a US
box is `cpx` or `ccx`.

**Its own box.** It does not share with anything else. A public surface and an
internal one have different audiences and different blast radius, and a shared
Caddy couples their uptime for the sake of a few euros a month.

## One-time setup

```bash
# 1. Provision (firewall first, so the box is never briefly open).
hcloud firewall create --name ragtime-app-fw
for p in 22 80 443; do
  hcloud firewall add-rule ragtime-app-fw --direction in --protocol tcp --port $p \
    --source-ips 0.0.0.0/0 --source-ips ::/0
done
hcloud server create --name ragtime-app-01 --type cpx11 --image ubuntu-24.04 \
  --location ash --firewall ragtime-app-fw --ssh-key <your-key>

# 2. On the box: the deploy account and the tree it owns.
adduser --disabled-password --gecos "" deploy
install -d -o deploy -g deploy /srv/ragtime-app /srv/ragtime-app/releases
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
# put the deploy key's PUBLIC half in /home/deploy/.ssh/authorized_keys

# 3. Caddy, from its own repository rather than the distribution's.
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# 4. Configuration. SITE_HOST is the only thing that differs between staging
#    and production; API_ORIGIN moves when the API leaves workers.dev.
cat >/etc/default/caddy <<'EOF'
SITE_HOST=ragtime-app.lawfaremedia.org
API_ORIGIN=https://ragtimeproxy.benjamin-wittes.workers.dev
EOF
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl restart caddy
```

Caddy gets its certificate over HTTP-01, which works because the DNS record is
grey cloud. **If the record is ever proxied, HTTP-01 stops working** — behind a
proxy Caddy needs DNS-01 or a Cloudflare Origin CA certificate instead. Decide
that before flipping the cloud, not after.

## DNS, and the order that keeps a way back

Stage on a second hostname first. `ragtime.lawfaremedia.org` keeps pointing at
GitHub Pages until the box is proven on its own name.

1. `A ragtime-app.lawfaremedia.org → <box ip>`, **DNS only / grey cloud**.
2. Deploy, then check the box on that hostname: headers present, a deep link
   returns 200, `/assets/*` is immutable, `/legacy.html` still resolves.
3. Lower the TTL on `ragtime.lawfaremedia.org` well ahead of the move.
4. Repoint `ragtime.lawfaremedia.org` at the box.

**Do not delete the GitHub Pages site.** Rollback is repointing that record back
at `benjaminwittes.github.io`, and it only works while Pages is still publishing.

## Deploying

`.github/workflows/deploy-app.yml` builds and ships on every push to `main` that
touches the app. It is inert until `DEPLOY_ENABLED` is set, so it can merge long
before the box exists.

| Setting | Kind | Value |
|---|---|---|
| `DEPLOY_ENABLED` | variable | `true` to arm it |
| `DEPLOY_HOST` | variable | the hostname |
| `DEPLOY_USER` | variable | `deploy` |
| `DEPLOY_KNOWN_HOSTS` | variable | output of `ssh-keyscan <host>` |
| `DEPLOY_SSH_KEY` | **secret** | private half of the deploy key |

The host key is pinned deliberately. Never swap it for
`StrictHostKeyChecking=no`.

Each deploy lands in `releases/<commit-sha>/` and then moves the `current`
symlink, so the swap is atomic and no visitor sees a half-copied tree. The five
most recent releases are kept.

## Rolling back

```bash
ls -1dt /srv/ragtime-app/releases/*/          # newest first
ln -sfn /srv/ragtime-app/releases/<sha> /srv/ragtime-app/current.tmp
mv -Tf /srv/ragtime-app/current.tmp /srv/ragtime-app/current
```

No rebuild, no CI run, no Caddy restart. If the box itself is the problem, the
bigger rollback is the DNS record.

## Checking what is actually live

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/oauth/consent   # 200, not 404
curl -sSI https://<host>/ | grep -iE 'strict-transport|content-security|x-frame|cache-control'
curl -sSI https://<host>/assets/<hashed>.js | grep -i cache-control      # immutable
```

## The content policy, and why most of it is not enforced yet

`frame-ancestors 'none'` ships **enforced**, on its own header. It is the control
the OAuth consent page needs — a consent screen inside someone else's iframe
takes a grant from a user who cannot see what they granted — and it cannot break a
page nothing legitimately frames. `X-Frame-Options: DENY` covers older clients.

The rest of the policy ships as `Content-Security-Policy-Report-Only`. A policy
derived by reading the source and shipped enforced is how a working app goes
blank. Watch the reports, then promote it and drop the single-directive header.

Two notes for whoever promotes it. `style-src` needs `'unsafe-inline'` because
React `style={{...}}` props are inline style attributes; removing it means
removing those from the app. Stripe needs no allowance at all — checkout is a
top-level redirect, not embedded Stripe.js.

Self-hosting the two web fonts would let `style-src` and `font-src` drop their
Google origins, and would stop a third party seeing the IP of every visitor to a
Lawfare research tool. Worth doing before the policy is enforced.
