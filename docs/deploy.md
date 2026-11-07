# Deploying Wallt

One container (API + static web export + scheduler) with one `/data` volume, behind the nginx that
already runs on the host. nginx terminates TLS and rate-limits `/auth/*`; the app sends the security
headers (CSP, HSTS, frame-ancestors, ...). Public URL: `https://wallt.franciscoliveira.com`.

```
Internet ──443──▶ host nginx ──▶ 127.0.0.1:3000 ──▶ wallt container (/data volume)
```

## 1. Run the container

```bash
cp .env.example .env        # then edit: ENCRYPTION_KEY (required), SETUP_TOKEN (first start), APP_URL
docker compose up -d --build
curl -fsS http://127.0.0.1:3000/health
```

- The container starts with **only the `/data` volume and env vars**. `/data` holds `wallt.db`
  (+ WAL files), `backups/` (pre-migration snapshots), and later `attachments/` and `secrets/`.
- The port is published on `127.0.0.1` only; nothing is reachable from the internet except through nginx.
- Hardening in compose: non-root user, read-only root filesystem, all capabilities dropped,
  `no-new-privileges`, `init: true`, healthcheck on `/health`.
- Back up the `wallt-data` volume (encrypted Drive backups arrive with #13). Upgrades: `git pull && docker compose up -d --build`;
  migrations run on boot and write a snapshot to `/data/backups` first.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | host port on 127.0.0.1 |
| `TZ` | `Europe/Lisbon` | job schedules |
| `LOG_LEVEL` | `info` | pino JSON logs (`docker compose logs -f`) |
| `APP_URL` | `https://wallt.franciscoliveira.com` | public URL |
| `ENCRYPTION_KEY` | **required** | base64, >= 32 bytes (`openssl rand -base64 32`). Encrypts TOTP secrets and derives the token-signing key. Keep a separate offline copy: without it nobody can log in |
| `SETUP_TOKEN` | empty | >= 16 chars. Needed once to create the first account (see "First account"); remove afterwards |
| `TRUSTED_PROXIES` | `127.0.0.1,::1,172.16.0.0/12` | IPs/CIDRs whose `X-Real-IP` is trusted (see below) |

### First account

The server is public, so account creation is guarded. With `SETUP_TOKEN` set, call (once, ideally from the app's setup screen):

```bash
curl -sS https://wallt.franciscoliveira.com/auth/setup -H 'content-type: application/json' \
  -d '{"setupToken":"<SETUP_TOKEN>","email":"you@example.com","password":"<12+ chars>"}'
```

The response holds an `otpauthUri` / `secret` for your authenticator app; confirm with `POST /auth/2fa/confirm`
(`enrolToken`, the 6-digit code, `deviceName`, `platform`). That activates 2FA, returns **10 single-use recovery
codes (shown once, store them offline)** and logs the device in. Setup is closed for good once a user exists;
then remove `SETUP_TOKEN` from `.env` and `docker compose up -d`.

Login is two steps (`/auth/login` then `/auth/login/verify`); 2FA cannot be skipped. After 5 wrong passwords or codes
the account locks for 15 minutes, and each client IP is limited to 10 attempts per 15 minutes (nginx adds its own limit).

### Devices and sensitive actions

With a valid access token: `GET /auth/devices` lists signed-in devices, `DELETE /auth/devices/:id` signs one out
(its access and refresh tokens stop working), `POST /auth/logout` signs out the current device.
These re-ask **password + a fresh TOTP code** in the request body (`{"password","code"}`):

- `POST /auth/recovery-codes/regenerate`: new set of 10 codes; the old ones stop working.
- `POST /auth/2fa/reset` then `POST /auth/2fa/reset/confirm` (`enrolToken` + a code from the NEW authenticator):
  swaps the authenticator, issues new recovery codes and signs out every other device. Until confirmed, the
  current authenticator keeps working. There is deliberately no way to turn 2FA off.

## 2. nginx

The app trusts `X-Real-IP` **only if the TCP peer is in `TRUSTED_PROXIES`**; any other peer's header is ignored.
nginx must therefore *set* `X-Real-IP` itself (overwriting what the client sent) and must be the only thing
in front of the app. If another proxy/CDN sits in front of nginx, configure nginx's `real_ip` module first.

```nginx
# /etc/nginx/conf.d/wallt.conf
limit_req_zone $binary_remote_addr zone=wallt_auth:10m rate=5r/m;

server {
    listen 80;
    server_name wallt.franciscoliveira.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name wallt.franciscoliveira.com;

    ssl_certificate     /etc/letsencrypt/live/wallt.franciscoliveira.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wallt.franciscoliveira.com/privkey.pem;

    client_max_body_size 25m;          # file imports / attachments

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Login / 2FA / token endpoints: 5 requests per minute per IP, small burst.
    location /auth/ {
        limit_req zone=wallt_auth burst=10 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Do not add HSTS/CSP in nginx; the app sends them (duplicate headers would conflict).

## 3. TLS certificates

Certificates are out of scope for the repo: provide them however you already do. Example with certbot:

```bash
sudo certbot certonly --nginx -d wallt.franciscoliveira.com
sudo nginx -t && sudo systemctl reload nginx
```

HSTS is sent by the app (`max-age=31536000; includeSubDomains`), so only enable the site once HTTPS works.

## 4. Checks after deploy

```bash
curl -fsS https://wallt.franciscoliveira.com/health          # {"status":"ok","schemaVersion":N}
curl -sI  https://wallt.franciscoliveira.com/ | grep -i -E 'content-security|strict-transport|x-frame'
docker compose logs wallt | tail                              # request logs show the real client IP
```
