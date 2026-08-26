# AWS Production Deployment Guide — FNB Aqua

This document is the readiness assessment and step-by-step runbook for taking
FNB Aqua from the free-tier test deployment to the real client production
launch — including Razorpay **live-mode** payments, transactional email
(order confirmation/status updates), and OTP email verification at
registration.

**Important — what this document is:** a precise runbook for *you* (or
whoever holds the AWS account and domain) to execute. It cannot be run by an
AI agent on your behalf — provisioning real AWS resources costs real money,
takes payment/email credentials that should never be pasted into a chat
session, and (for the domain/SES/Razorpay-live steps) needs decisions only
you can make. Steps marked ✋ are things you do yourself, in the AWS
Console/CLI, your domain registrar, or the Razorpay dashboard.

## 0. Supersedes note (read this first)

An earlier version of this document specified a different target
architecture: ECS Fargate + RDS + S3/CloudFront + a GitHub Actions OIDC
pipeline. **That was never actually built** — `backend/ecs-task-definition.json`
and `.github/workflows/deploy.yml` don't exist in this repo. Instead, the
team stood up the $0/month EC2 + Docker Compose + Caddy box documented in
`AWS_FREE_TIER_TEST_DEPLOY.md`, and it's the setup actually serving traffic
today (see `AWS_DEPLOYMENT_LOG.md` for the real instance details).

This document now targets **hardening that same proven setup** for
production, rather than resurrecting the ECS plan — it's cheaper, it's
already tested end-to-end (including a real Razorpay checkout), and nothing
about it needs to change to add live payments, email, or OTP. If traffic or
uptime needs ever genuinely outgrow a single EC2 instance, ECS/RDS remains a
valid future migration — but that's a from-scratch project to revisit later,
not a next step from here.

**This document assumes you've read `AWS_FREE_TIER_TEST_DEPLOY.md` first** —
it explains the base architecture (one EC2 instance, three Docker Compose
containers: `db`/`backend`/`frontend`, Caddy handling HTTPS) in full; this
doc only covers what's *different* for production.

---

## 1. TL;DR Readiness Verdict

Recommended: **stand up a second, fresh EC2 instance for production**,
identical in shape to the test box (`AWS_FREE_TIER_TEST_DEPLOY.md §1-§6`),
rather than converting the live testers' box in place. Reasons: real
customer orders/payments must never mingle with test junk, and the test box
stays available for its actual job (letting testers click around) without
downtime risk from production changes.

What changes for that new instance, covered in this document:
- §2: real domain instead of `nip.io` (Caddy config barely changes).
- §3: `.env` replaced by AWS Secrets/SSM Parameter Store, read via an EC2
  IAM instance role — no more hand-edited secrets on the box.
- §4: switch to `config.settings.production` + S3 for media storage
  (already-written code, `production.py` — just needs a bucket and IAM
  permissions, no Django changes).
- §5: Razorpay live-mode keys and webhook (KYC required first).
- §6: AWS SES for order confirmation/status emails and OTP codes — this
  needs the real domain from §2 to get out of SES sandbox mode.
- §7: OTP email verification at registration — this is application code,
  not infrastructure; see the design spec (§7 below) for what to build.
- §8: automated database backups (no RDS, so no automatic backups exist
  today — this closes that gap with a simple cron job).

## 2. Domain & HTTPS

1. ✋ Buy a domain once the client confirms final branding (any registrar —
   Route 53, Namecheap, GoDaddy all work identically here).
2. ✋ Point an A record at the new instance's Elastic IP (same mechanism as
   `AWS_FREE_TIER_TEST_DEPLOY.md §1`'s Elastic IP allocation).
3. 💻 Update `frontend/Caddyfile`'s site block: replace the
   `fnbaqua.13.50.60.19.nip.io, http://...` host list with the real domain
   (e.g. `fnbaqua.com, www.fnbaqua.com`) — everything else in that file
   (the `/static/`, `/media/`, `/api/`, `/django-admin/`, and SPA-fallback
   `handle` blocks) is unchanged. Caddy automatically requests and renews a
   real Let's Encrypt certificate for the new hostname the same way it does
   for `nip.io` today.
4. ✋ Update `backend/.env` (or, once §3 is done, the SSM parameters)
   `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` to the real domain.
5. ✋ Security group: same rules as the test box (`AWS_FREE_TIER_TEST_DEPLOY.md §1`)
   — SSH from your IP only, HTTP 80 + HTTPS 443 from anywhere.

## 3. Secrets: SSM Parameter Store + IAM Instance Role

Replaces the hand-edited `backend/.env` (`SERVER_OPERATIONS.md §5`'s "edit
directly on the server" pattern) with encrypted, IAM-gated parameters
fetched automatically at container startup — no secret ever needs to be
typed into a file on the box by hand again after initial setup.

### 3.1 Create the parameters ✋
```bash
aws ssm put-parameter --name /fnbaqua/prod/SECRET_KEY --type SecureString --value "<new random 50+ char value>"
aws ssm put-parameter --name /fnbaqua/prod/DATABASE_URL --type SecureString --value "postgres://fnbaqua:fnbaqua@db:5432/fnbaqua"
aws ssm put-parameter --name /fnbaqua/prod/ALLOWED_HOSTS --type String --value "fnbaqua.com,www.fnbaqua.com"
aws ssm put-parameter --name /fnbaqua/prod/CORS_ALLOWED_ORIGINS --type String --value "https://fnbaqua.com"
aws ssm put-parameter --name /fnbaqua/prod/RAZORPAY_KEY_ID --type SecureString --value "<live key id, §5>"
aws ssm put-parameter --name /fnbaqua/prod/RAZORPAY_KEY_SECRET --type SecureString --value "<live key secret, §5>"
aws ssm put-parameter --name /fnbaqua/prod/RAZORPAY_WEBHOOK_SECRET --type SecureString --value "<live webhook secret, §5>"
aws ssm put-parameter --name /fnbaqua/prod/AWS_STORAGE_BUCKET_NAME --type String --value "fnbaqua-media-prod"
aws ssm put-parameter --name /fnbaqua/prod/AWS_S3_REGION_NAME --type String --value "ap-south-1"
aws ssm put-parameter --name /fnbaqua/prod/AWS_SES_REGION_NAME --type String --value "ap-south-1"
aws ssm put-parameter --name /fnbaqua/prod/DEFAULT_FROM_EMAIL --type String --value "orders@fnbaqua.com"
```
Non-secret values use plain `String` (free, same read call) rather than
`SecureString` — no operational difference for this project's scale, just
avoids paying for KMS `Decrypt` calls on values that were never sensitive.

### 3.2 IAM instance role ✋
Create an IAM role (e.g. `fnbaqua-prod-ec2-role`) with:
- `ssm:GetParametersByPath` on `arn:aws:ssm:*:*:parameter/fnbaqua/prod/*`
- `kms:Decrypt` on the key backing the `SecureString` parameters (the
  default `alias/aws/ssm` key is fine at this scale)
- `ses:SendEmail`, `ses:SendRawEmail` (for §6)
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` scoped
  to the media bucket ARN (for §4)

Attach this role to the new EC2 instance (EC2 → Instance settings → Attach/
Replace IAM role) — no access keys stored on the box or in `.env`, ever.

### 3.3 Django-side loading (`backend/config/settings/base.py:7-8`) 💻
Replace the unconditional `environ.Env.read_env(BASE_DIR / ".env")` with a
guarded fetch that populates `os.environ` from SSM before any `env(...)`
call runs, leaving every existing `env("X")` line in `base.py` untouched:

```python
import os
import boto3

if os.environ.get("LOAD_SECRETS_FROM_SSM") == "true":
    ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
    paginator = ssm.get_paginator("get_parameters_by_path")
    for page in paginator.paginate(Path="/fnbaqua/prod/", WithDecryption=True):
        for param in page["Parameters"]:
            os.environ[param["Name"].rsplit("/", 1)[-1]] = param["Value"]
else:
    environ.Env.read_env(BASE_DIR / ".env")
```

`backend/.env` on the production box then only needs one line:
`LOAD_SECRETS_FROM_SSM=true` — everything else comes from SSM. Local dev,
CI, and the *test* box are unaffected (they don't set that variable, so they
keep reading `.env` exactly as today).

## 4. Switch to `config.settings.production` + S3 media storage

The test box runs `DJANGO_SETTINGS_MODULE=config.settings.staging`
(`backend/.env.docker.example`), which keeps media on the container's local
disk (an EBS-backed Docker volume — fine for testers, but a single point of
failure for real product/category images with no offsite copy). Production
switches to `config.settings.production`, which is **already fully
written** (`backend/config/settings/production.py:1-19`) — HSTS, secure
cookies, `SECURE_SSL_REDIRECT` (works correctly behind Caddy, which already
sets `X-Forwarded-Proto` on its `reverse_proxy` calls), and S3-backed media
via `django-storages`/`boto3` (both already in `requirements.txt`). No
Django code changes needed — only the two SSM parameters from §3.1
(`AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`) and the bucket itself:

1. ✋ S3 → **Create bucket** `fnbaqua-media-prod`, region `ap-south-1`. Keep
   Block Public Access ON at the bucket level; grant public read narrowly
   via a bucket policy instead:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicReadMedia", "Effect": "Allow", "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::fnbaqua-media-prod/*"
     }]
   }
   ```
2. ✋ CORS: allow `GET` from `https://fnbaqua.com` (same shape as the
   original ECS-plan draft's §5.3, just re-applied here).
3. Writes (uploads from the admin panel) go through the EC2 instance role's
   S3 permissions from §3.2 — no access keys.
4. ✋ One-time: copy existing product/category images from the test box's
   volume into the new bucket (`aws s3 sync` from a mounted copy, or
   re-upload the handful of images through the admin panel — whichever is
   less effort for the actual image count).

## 5. Razorpay: going live

Full detail already in `backend/RAZORPAY_SETUP.md`'s "Going live later"
section — summarized here with the SSM tie-in:

1. ✋ Complete Razorpay KYC/business verification (Settings → Account &
   Settings in the dashboard).
2. ✋ Generate **Live** mode API keys (Settings → API Keys, with the mode
   toggle set to Live) — never reuse the `rzp_test_...` keys.
3. ✋ Create a **Live** mode webhook pointed at
   `https://fnbaqua.com/api/v1/payments/webhook/` (the real domain from §2),
   event `payment.captured` (the only event `RazorpayWebhookView`
   currently handles, `backend/orders/views.py:135-209`), with a newly
   chosen webhook secret — not the test-mode one.
4. ✋ Store all three live values in SSM (§3.1) — no code changes; the
   signature-verification and idempotency logic in
   `RazorpayWebhookView`/`CheckoutSession.razorpay_order_id` already work
   identically in live mode.

## 6. AWS SES: production email

Covers order confirmation, order-status-update, and OTP emails once the
application code from the design spec (§7 below) exists. This is the one
piece that's blocked on §2 (the real domain) — SES sandbox mode (usable
today, before a domain exists) only sends to manually pre-verified
recipient addresses, which doesn't work for real customers.

1. ✋ SES console (region `ap-south-1`) → **Verified identities** → **Create
   identity** → **Domain** → `fnbaqua.com`.
2. ✋ Add the DKIM CNAME records SES generates to your domain's DNS (at
   whichever registrar/DNS provider holds §2's domain).
3. ✋ Add an SPF TXT record: `v=spf1 include:amazonses.com ~all` (or merge
   into an existing SPF record if one already exists for the domain).
4. ✋ Once DKIM shows "Verified" (can take a few hours for DNS propagation),
   request **SES production access** via the console (Account dashboard →
   "Request production access") — describe the use case (transactional
   order/OTP emails for an e-commerce site); typically approved within 1-2
   business days.
5. ✋ Optional but recommended: create an SNS topic subscribed to SES
   bounce/complaint notifications, so a string of bounces doesn't silently
   tank sender reputation.
6. 💻 Django side: `EMAIL_BACKEND = "django_ses.SESBackend"` and the
   `AWS_SES_REGION_NAME`/`DEFAULT_FROM_EMAIL` settings — this is application
   code from the design spec (§7), not a separate production-only change;
   it works identically once the domain is verified.

## 7. OTP registration verification & transactional email — application code

Sections 3-6 of this document are infrastructure; the actual OTP model,
`verify-otp`/`resend-otp` endpoints, `core/email.py` sending functions, and
the `django-ses` settings are **application code**, fully designed in
[`docs/superpowers/specs/2026-08-26-otp-email-secrets-design.md`](docs/superpowers/specs/2026-08-26-otp-email-secrets-design.md).
That spec's §6 ("AWS: SES sandbox + SSM secrets") targeted the *test* box
specifically (SES sandbox, no domain) — this document's §3 and §6 are the
production versions of those same two pieces, once a real domain exists.
**Status: designed, not yet implemented** — build it via
`superpowers:writing-plans` → `superpowers:subagent-driven-development` off
that spec before this checklist's OTP/email items can be checked off.

## 8. Database backups

No RDS in this architecture, so there are no automatic managed backups —
this closes that gap with a daily `pg_dump` to S3 instead of a bigger
architecture change:

1. Reuse the media bucket (§4) or create a small separate `fnbaqua-backups`
   bucket with a lifecycle rule expiring objects after e.g. 30 days.
2. ✋ On the production instance, a cron entry:
   ```bash
   0 3 * * * cd ~/fnbaqua && docker compose exec -T db pg_dump -U fnbaqua fnbaqua | gzip | aws s3 cp - s3://fnbaqua-backups/db/$(date +\%F).sql.gz
   ```
   The instance role (§3.2) needs `s3:PutObject` on that bucket added to its
   policy.
3. ✋ Periodically (e.g. monthly) test a restore into a scratch database —
   an untested backup is not a backup.
4. EBS snapshots of the whole volume are a coarser, easier-to-set-up
   supplement (AWS Console → EC2 → Volumes → the instance's volume →
   Actions → Create snapshot, or schedule via Data Lifecycle Manager) —
   worth turning on too since it also covers uploaded-media-before-S3 and
   the instance's own filesystem state, not just the database.

## 9. Deploy process for production

Follow `AWS_FREE_TIER_TEST_DEPLOY.md §1-§6` on a **new** instance (not the
existing test one) to get the base stack running, then apply §2-§6 above.
Ongoing deploys use the same manual process documented in
`SERVER_OPERATIONS.md §5-6` (`git pull` + `docker compose build && docker
compose up -d`), pointed at a dedicated `production` branch kept separate
from the `phase-1`/test branch, so a work-in-progress test-box push can
never accidentally reach real customers. Adapting
`.github/workflows/deploy-test.yml` into a second `deploy-production.yml`
targeting the new instance (mirroring §10.1-10.4 of
`AWS_FREE_TIER_TEST_DEPLOY.md` with a separate deploy key/secrets pair) is a
reasonable follow-up once the manual process has been exercised a few times
by hand — not required for the first launch.

## 10. Pre-Launch Checklist

Infrastructure:
- [ ] New production EC2 instance provisioned (separate from the test box), Docker Compose + Caddy running (`AWS_FREE_TIER_TEST_DEPLOY.md §1-§6`)
- [ ] Real domain purchased, DNS pointed at the instance's Elastic IP, Caddy serving real HTTPS (§2)
- [ ] IAM instance role attached, scoped to SSM/S3/SES only — no access keys on the box (§3.2)
- [ ] All secrets in SSM Parameter Store under `/fnbaqua/prod/`, `LOAD_SECRETS_FROM_SSM=true` set, `backend/.env` reduced to that one line (§3)
- [ ] `DJANGO_SETTINGS_MODULE=config.settings.production`, S3 media bucket created and serving uploads (§4)
- [ ] Razorpay live-mode KYC complete, live keys + live webhook created and stored in SSM (§5)
- [ ] SES domain verified (DKIM + SPF), production access approved — not sandbox (§6)
- [ ] OTP registration + order emails implemented per the design spec and verified end-to-end against real SES (§7)
- [ ] Daily `pg_dump`-to-S3 cron running, one test restore performed; EBS snapshots scheduled (§8)
- [ ] Deployed from a dedicated `production` branch, separate from the test box's branch (§9)

Config/security:
- [ ] New random `SECRET_KEY` for production (never the dev/test value) — stored only in SSM
- [ ] `DEBUG=False` (default in `production.py`) confirmed
- [ ] `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` set to the real domain only
- [ ] `createsuperuser` run once against the production database
- [ ] Security group: SSH from your IP only, 80+443 public, 5432 never exposed (matches the test box)

## 11. Rough Cost Estimate (ap-south-1, low traffic)

Much cheaper than the original ECS/RDS plan, since it's the same single-box
architecture as the test deployment, just with a domain and a few managed
services layered on:

- EC2 `t3.micro` (past the 12-month free-tier window): ~$8-9/mo
- Elastic IP (attached, running): free; ~$3.60/mo if ever left unattached
- Domain registration: ~$10-15/year (~$1/mo)
- S3 media + backups bucket: a few dollars/mo at low traffic/storage
- SES: functionally free at this volume — $0.10 per 1,000 emails after the
  (region-dependent) free tier
- SSM Parameter Store (standard params): free

Total: roughly **$12-18/month** — this is a ballpark for planning, not a
quote; confirm against current AWS pricing for your exact instance/region
choices. If traffic or uptime needs later outgrow this single instance,
revisit the ECS/RDS path from scratch at that point (§0).
