# AWS Test Deployment Log — FNB Aqua

A record of what was actually done to stand up the free-tier test deployment
described in `AWS_FREE_TIER_TEST_DEPLOY.md`, with the real values used, so
this doesn't need to be re-derived from chat history later. For day-to-day
operations (starting/stopping, updating code, restarting Docker), see
`SERVER_OPERATIONS.md` instead — this file is history, not a runbook.

## Purpose

A public link for ~3 testers to try the site (including online payment)
before a domain is purchased and the full production setup
(`AWS_DEPLOYMENT.md`) is built for the real client launch.

## AWS resources created

| Resource | Value |
|---|---|
| AWS account | "Developer-selva", on the AWS Free Plan (credits-based, not the classic 12-month Free Tier) — $100 credit / 176 days remaining as of 2026-08-19 |
| Region | Europe (Stockholm) — `eu-north-1` |
| Instance name | `fnbaqua-test-2` |
| Instance ID | `i-006dfe21fc25abea7` |
| Instance type | `t3.micro` (free-tier eligible) |
| AMI | Ubuntu Server 26.04 LTS, `ami-0aba19e56f3eaec05`, username `ubuntu` |
| Elastic IP | `13.50.60.19` (permanent — reattaches to whichever instance is current; survives stop/start) |
| Security group | `launch-wizard-1` — inbound: SSH (22) from the operator's IP only, HTTP (80) from anywhere; outbound: all |
| Key pair | `fnbaqua-test-key-2` (created in AWS) — the working local copy is `fnbaqua-key-clean.pem` in Downloads (see "Key pair gotcha" below) |

### Note: an earlier instance was scrapped

A first attempt (`fnbaqua-test`, `i-0145e8d46cb7b9190`) hit a cascade of AWS
console glitches during launch (a malformed-CIDR bug that caused a
duplicate, incorrectly-configured security group; SSH key auth failing even
with a correct key pair; EC2 Instance Connect also failing) and was
terminated rather than debugged further. `fnbaqua-test-2` is the instance
actually in use. If you see references to `fnbaqua-test` or
`i-0145e8d46cb7b9190` anywhere, they're stale.

### Key pair gotcha

A Windows `icacls` typo while fixing file permissions on
`fnbaqua-test-key-2.pem` (`$env:selva` instead of `$env:USERNAME`) left a
corrupted, unremovable `BUILTIN\BUILTIN` ACL entry that SSH refused to
accept ("bad permissions"), independent of the actual AWS-side key pair
being correct. The fix was copying the key's content into a fresh file
(`fnbaqua-key-clean.pem`), which gets a clean ACL with nothing to fix. Use
`fnbaqua-key-clean.pem` for all SSH access — it's the same private key,
just in a file without the corrupted permissions history.

## What's deployed

- Repo cloned to `~/fnbaqua` on the instance, on branch `phase-1`.
- `backend/.env` created from `backend/.env.docker.example` with:
  - `SECRET_KEY` — a real random value (not a placeholder)
  - `ALLOWED_HOSTS=13.50.60.19`, `CORS_ALLOWED_ORIGINS=http://13.50.60.19`
  - `DATABASE_URL=postgres://fnbaqua:fnbaqua@db:5432/fnbaqua` (unchanged from the template — `db` is the Docker Compose service name)
  - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` — **still placeholders as of this writing**. Online payment (Razorpay checkout) will not work until these are replaced with real test-mode values per `backend/RAZORPAY_SETUP.md`. Cash on Delivery checkout works regardless.
- `docker compose up -d` running three containers: `fnbaqua-db-1` (Postgres 16), `fnbaqua-backend-1` (Django/gunicorn), `fnbaqua-frontend-1` (nginx serving the React build + reverse-proxying `/api/`, `/admin/`, `/static/`, `/media/` to the backend).
- Local dev data was copied over so testers see the real catalog rather than an empty shop:
  - Database: dumped locally with `pg_dump -F p` (plain SQL — the default custom format wasn't restorable because the local client is PostgreSQL 17 and the server container is Postgres 16; the archive format version wasn't compatible) and loaded with `psql`. The first load attempt collided with the schema Django's own `migrate` had already created on first boot (duplicate tables, FK errors on partial data) — the working fix was to `DROP DATABASE fnbaqua` / recreate it empty, then reload the plain SQL dump into a genuinely empty database.
  - Media: `backend/media/` (product/category images) copied via `scp` then `docker cp` into the backend container's volume.

## Known follow-ups

- **Razorpay real keys not yet set** — needed before online payment can be tested end-to-end.
- **CI/CD workflow watches `main`, not `phase-1`** — `.github/workflows/deploy-test.yml` auto-deploys on push to `main`, but this live instance was deployed manually from `phase-1` and that's still the active branch. A push to `main` will NOT update this server; a push to `phase-1` will not auto-deploy either. See `SERVER_OPERATIONS.md` for how to update the server manually, or change the workflow's branch trigger if `phase-1`-driven auto-deploy is wanted.
- No domain or HTTPS yet — reachable only via `http://13.50.60.19/`. Domain purchase and the full production setup are covered separately in `AWS_DEPLOYMENT.md`.
