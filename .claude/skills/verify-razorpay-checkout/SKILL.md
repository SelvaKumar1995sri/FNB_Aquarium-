---
name: verify-razorpay-checkout
description: Use when setting up real Razorpay test-mode API keys and webhook on FNB Aqua's live test box, or verifying that online checkout actually completes end-to-end — covers generating test keys, creating the webhook against the live HTTPS URL, safely updating the server's .env without pasting secrets into chat, and confirming a test payment marks the order paid.
---

# Verify Razorpay Checkout (Test Mode, Live Box)

## Overview

`backend/RAZORPAY_SETUP.md` documents the generic/local-dev version of this
(with `ngrok` for the webhook tunnel). This skill is the same setup, but
targeted at the actual live test box (`fnbaqua-test-2`,
`https://fnbaqua.13.50.60.19.nip.io/`, per `AWS_DEPLOYMENT_LOG.md`), which
already has a real public HTTPS URL — no tunnel needed.

**Status as of 2026-08-19 (last confirmed):** `backend/.env` on the live box
still held placeholder Razorpay keys (`AWS_DEPLOYMENT_LOG.md`) —
`payment_plan.md`'s checklist has "get real test-mode keys" and "verify
checkout end-to-end" both unchecked. Re-check this status before assuming
it's still true; it may have been completed since.

**Security rule:** the Key Secret and Webhook Secret are real credentials.
Never have them typed into or echoed by a chat/agent session — the user
enters them directly via `nano` on the server. An agent can guide the steps
and read back non-secret output (logs, HTTP status), but should not run
commands that embed the secret value in a tool call.

## Steps

### 1. Get test-mode keys (Razorpay dashboard)
1. `dashboard.razorpay.com/signup` (or log in), verify email.
2. Mode toggle (top-left) → **Test Mode**.
3. **Settings → API Keys → Generate Test Key** → copy the Key ID
   (`rzp_test_...`) and Key Secret (shown once).

### 2. Create the webhook (same dashboard)
1. **Settings → Webhooks → + Add New Webhook**.
2. URL: `https://fnbaqua.13.50.60.19.nip.io/api/v1/payments/webhook/`
   (swap in the current live URL if the box/domain has changed since).
3. Secret: any random string you invent (e.g. `openssl rand -hex 20`) — not
   provided by Razorpay.
4. Active events: `payment.captured` — the only event
   `RazorpayWebhookView` (`backend/orders/views.py:135-209`) handles.

### 3. Update the server's `.env` (user does this themselves, not the agent)
```powershell
ssh -i "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" ubuntu@13.50.60.19
```
On the box:
```bash
cd ~/fnbaqua
nano backend/.env   # set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
docker compose up -d backend
```

### 4. Verify end-to-end
Visit the live URL, add a product to cart, check out online, pay with test
card `4111 1111 1111 1111` (any future expiry/CVV) or UPI `success@razorpay`
— confirm the order shows paid. On failure, pull logs (safe to share, no
secrets):
```bash
docker compose logs --tail=50 backend
```

## Once confirmed working

Update `payment_plan.md`'s checklist (check off the two Razorpay items) and
`AWS_DEPLOYMENT_LOG.md`'s "Known follow-ups" note, since both currently
assert this is still pending.
