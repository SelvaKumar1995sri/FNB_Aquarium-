---
name: aws-production-launch
description: Use when preparing FNB Aqua's real client production launch on AWS, or asked about production domain setup, moving secrets to SSM/Secrets Manager, S3 media storage, Razorpay live-mode keys, AWS SES for transactional/OTP email, or database backups — points to the current runbook and status instead of re-deriving AWS architecture from scratch.
---

# AWS Production Launch

## Overview

FNB Aqua's path to real production is fully documented — this skill is a
pointer to that documentation and its current status, not a general AWS
technique. Read the files below rather than re-deriving the architecture.

## Read these, in order

1. **`AWS_FREE_TIER_TEST_DEPLOY.md`** — the base architecture actually
   running today: one EC2 instance, Docker Compose (`db`/`backend`/
   `frontend`), Caddy for free HTTPS via `nip.io`. Production reuses this
   exact shape on a fresh instance.
2. **`AWS_DEPLOYMENT.md`** — the production-hardening runbook: real domain,
   SSM Parameter Store for secrets, S3 media storage, Razorpay live mode,
   AWS SES, database backups, pre-launch checklist, cost estimate.
3. **`docs/superpowers/specs/2026-08-26-otp-email-secrets-design.md`** — the
   application-code design (OTP model/endpoints, `core/email.py`,
   `django-ses` settings) that `AWS_DEPLOYMENT.md §7` depends on.
4. **`AWS_DEPLOYMENT_LOG.md`** / **`SERVER_OPERATIONS.md`** — history and
   day-to-day ops for the existing *test* box specifically (not production).

## Known superseded content — don't resurrect it

An earlier version of `AWS_DEPLOYMENT.md` specified ECS Fargate + RDS +
S3/CloudFront + a GitHub Actions OIDC pipeline. **It was never built** —
`backend/ecs-task-definition.json` and `.github/workflows/deploy.yml` don't
exist in this repo. If you see references to that architecture in old
context/memory, they're stale. The current and only active plan is
hardening the proven EC2+Docker Compose+Caddy box (see `AWS_DEPLOYMENT.md §0`
for the full explanation). Only revisit ECS/RDS if traffic/uptime needs
genuinely outgrow a single instance — that's a fresh project, not a next
step.

## Status (as of 2026-08-26)

| Item | Status |
|---|---|
| Test EC2 box (`fnbaqua-test-2`, `13.50.60.19`) | Live, serving testers, HTTPS via `nip.io`+Caddy |
| Razorpay | Implemented and tested (test mode) — `backend/orders/views.py`, webhook signature-verified + idempotent |
| OTP registration verification | **Designed, not implemented** — spec approved, no code written yet |
| Transactional email (order confirmation/status) | **Designed, not implemented** — same spec |
| Production EC2 instance | Not yet provisioned |
| Domain | Not yet purchased (waiting on client design sign-off) |
| SSM secrets, S3 media, SES, live Razorpay | Not started — blocked on domain (SES) and OTP/email code first |

## If asked to move this forward

- **Build the OTP/email app code** → `superpowers:writing-plans` off the
  design spec, then `superpowers:subagent-driven-development`, on the
  existing `phase-1` branch/worktree pattern (same as Phase 2 e-commerce —
  see the `resume-phase2-ecommerce` skill for that pattern).
- **Provision production infrastructure** → follow `AWS_DEPLOYMENT.md`
  section by section; every ✋-marked step needs the user's AWS
  console/domain-registrar/Razorpay-dashboard access, so hand those off
  explicitly rather than attempting them.
