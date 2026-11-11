# Security policy

Wallt handles personal financial data, so security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting: go to the repository's **Security** tab → **Report a vulnerability**
(<https://github.com/fmgoliveira/wallt/security/advisories/new>). Include what you found, how to reproduce it, and the
version (`/health` on your server, or the app's Settings screen).

You can expect an acknowledgement within a few days. This is a volunteer-run project, so there is no formal SLA, but
confirmed issues are fixed and disclosed in the release notes (with credit if you want it).

## Scope

In scope: the server (auth, 2FA, sync, backups, attachments), the Android app and the web app.
Out of scope: problems that need a compromised host or an already-authenticated attacker with full device access, and
the security of your own reverse proxy, TLS setup or host (see [`docs/deploy.md`](docs/deploy.md) for the recommended one).

## Supported versions

Only the latest release receives fixes.

## Operating your own instance

- Keep `ENCRYPTION_KEY` backed up separately and **never commit `.env`**.
- Remove `SETUP_TOKEN` after creating your account.
- Expose the server only behind TLS, as described in [`docs/deploy.md`](docs/deploy.md).
