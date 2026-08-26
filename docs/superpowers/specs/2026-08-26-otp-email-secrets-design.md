# OTP Registration Verification, Order Emails, and AWS Secrets Hardening

Date: 2026-08-26
Status: Approved for planning

## 1. Overview

Three related changes, prompted by a review of FNB Aqua's AWS/Razorpay/email/OTP
setup ahead of opening the site to real customer testing:

1. **OTP email verification at registration** — accounts currently activate
   immediately (`RegisterView` returns JWT tokens straight away) with no proof
   the customer owns the email address they registered with.
2. **Transactional order emails** — customers currently receive no email at
   all for an order; only staff get in-app admin notifications. Add order
   confirmation and order-status-update emails.
3. **AWS secrets hardening** — Razorpay keys and DB credentials currently live
   in a plain `.env` file on the EC2 box (`backend/config/settings/base.py:7-8`).
   Move these, plus the new SES config, to SSM Parameter Store, read via an
   EC2 IAM instance role.

These ship together because (1) and (2) both need the same SES sending
infrastructure, and (3) is the natural moment to lock down the Razorpay
secrets already in `.env` rather than adding OTP/email secrets to the same
insecure file and revisiting this later.

## 2. Decisions already made (from brainstorming)

- **OTP channel is email only**, via AWS SES — no SMS. SMS delivery in India
  requires TRAI DLT business-entity registration (multi-day paperwork,
  template pre-approval), out of scope for this round.
- **No domain exists yet** (client hasn't confirmed final branding), so **SES
  stays in sandbox mode** — one verified sender address, manually verified
  recipient addresses for testing. Domain verification, DKIM/SPF, and SES
  production-access request are documented as a later upgrade path (§8), not
  built now. **HTTPS/ALB/domain work is explicitly deferred** to a separate
  round for the same reason.
- **OTP storage is a plain DB table**, not Redis/ElastiCache — avoids
  provisioning new infra for a single-EC2 staging box at current scale.
- **Order-status-update emails piggyback on the existing admin
  status-transition endpoint** (`AdminOrderStatusUpdateSerializer`,
  `backend/orders/serializers.py:32`), mirroring the `notify_restock` pattern
  already used for in-app customer notifications
  (`backend/notifications/services.py:6-16`).
- **Password reset and login 2FA are out of scope** this round — only
  registration verification.
- **Secrets move to SSM Parameter Store** (not Secrets Manager) — same
  IAM-gated encrypted-read pattern via boto3, but free for standard
  parameters; no rotation requirement here to justify Secrets Manager's
  per-secret cost.

## 3. Backend: `accounts` app — OTP registration verification

### 3.1 New model (`backend/accounts/models.py`)

```python
import random
from datetime import timedelta

from django.utils import timezone


class OTPVerification(models.Model):
    PURPOSE_CHOICES = [("registration", "Registration")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="otp_verifications"
    )
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default="registration")
    code = models.CharField(max_length=6)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose", "consumed_at"])]

    @classmethod
    def issue(cls, user, purpose="registration"):
        cls.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).delete()
        code = f"{random.randint(0, 999999):06d}"
        return cls.objects.create(
            user=user, purpose=purpose, code=code,
            expires_at=timezone.now() + timedelta(minutes=10),
        )

    def is_valid(self, code):
        return self.consumed_at is None and timezone.now() < self.expires_at and self.code == code
```

`purpose` is a real field (not hardcoded) so the same table/mechanism can be
reused for a future password-reset OTP without a new model — only
`"registration"` is wired up this round.

New migration `backend/accounts/migrations/0002_otpverification.py`.

### 3.2 `RegisterView` change (`backend/accounts/views.py:13-25`)

`RegisterSerializer.create()` (`serializers.py:31-40`) sets `is_active=False`
on the created user. Django's `ModelBackend` and `TokenObtainPairSerializer`
both reject inactive users automatically, so login (`core/auth_urls.py:7`,
`TokenObtainPairView`) stays blocked with no extra check needed.

`RegisterView.post` then calls `OTPVerification.issue(user)` and
`send_otp_email(user, otp.code)` (§5), and returns
`{"detail": "Verification code sent to your email.", "user_id": user.id}`
with `201` — **no JWT tokens** until verified. This is the one behavioral
change to existing registration: today's immediate-login response goes away.

### 3.3 New endpoints

New views in `backend/accounts/views.py`, registered in
`backend/accounts/urls.py` alongside the existing router:

- `POST /api/v1/auth/verify-otp/` — body `{"user_id", "code"}`. Loads the
  latest unconsumed `OTPVerification` for that user+purpose (404 if none);
  400 ("This code has expired, request a new one.") if `is_valid()` fails
  on expiry; increments `attempts` and 400s ("Incorrect code.") on mismatch,
  locking out further attempts past 5 (400 "Too many attempts, request a new
  code."); on match, stamps `consumed_at`, sets `user.is_active = True`,
  saves both, and returns the same `{"access", "refresh"}` shape
  `RegisterView` returns today.
- `POST /api/v1/auth/resend-otp/` — body `{"user_id"}`. Re-issues via
  `OTPVerification.issue()` (which deletes the prior unconsumed row first)
  and re-sends. Throttled `AnonRateThrottle` scope `"resend_otp"`, rate
  `"3/hour"` added to `REST_FRAMEWORK.DEFAULT_THROTTLE_RATES`
  (`base.py:98-101`), mirroring `RegisterThrottle` (`accounts/throttles.py`).

### 3.4 Frontend

`frontend/src/pages/public/Register.jsx`: on submit success, instead of
navigating straight to `/account/addresses` (current line 34), navigate to a
new `/verify-otp` route, passing `user_id` via router state.

New `frontend/src/pages/public/VerifyOtp.jsx`: 6-digit code input, "Verify"
button (`POST /verify-otp/` → on success, the existing `persistSession` flow
`AuthContext.jsx` already exposes for login/register), "Resend code" link
with a 60s client-side cooldown calling `/resend-otp/`.

`AuthContext.jsx`'s `register()` (`AuthContext.jsx:202-206`) changes to NOT
call `persistSession` — the register response no longer contains tokens. It
returns `{ userId }` instead, which `Register.jsx` passes to the `/verify-otp`
navigation.

## 4. Backend: order emails

### 4.1 `core/email.py` (new file)

Lives in `core` — already the shared, dependency-free app (`auth_urls.py`,
`auth_views.py`, no models) that `accounts`, `orders`, and `notifications` can
all safely import from without creating a cross-app import cycle (an OTP
email needs no `Order`; an order email needs no `accounts` internals; neither
should live inside the other's app).

```python
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send(subject, message, recipient):
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [recipient])
    except Exception:
        logger.exception("Failed to send email: %s", subject)


def send_otp_email(user, code):
    _send(
        "Your FNB Aqua verification code",
        f"Your verification code is {code}. It expires in 10 minutes.",
        user.email,
    )


def send_order_confirmation_email(order):
    _send(
        f"Order #{order.id} confirmed — FNB Aqua",
        f"Thanks for your order! Order #{order.id}, total ₹{order.total_amount}.",
        order.user.email,
    )


def send_order_status_email(order):
    _send(
        f"Order #{order.id} update — {order.get_status_display()}",
        f"Your order #{order.id} is now: {order.get_status_display()}.",
        order.user.email,
    )
```

`_send` swallows and logs exceptions — an SES throttle or bad address must
never break order creation, the admin status update, or registration itself
(the write to the DB is what has to succeed; the email is best-effort).

### 4.2 Call sites

- `backend/orders/views.py:177-207` (`RazorpayWebhookView`, right after
  `Order.objects.create`) and `backend/orders/views.py:90-132`
  (`_place_cod_order`) — both call `send_order_confirmation_email(order)`
  once the order row is committed.
- `backend/orders/views.py:252` (admin status-update view, after
  `AdminOrderStatusUpdateSerializer(...).save()` succeeds) — calls
  `send_order_status_email(order)`.
- `backend/accounts/views.py` (`RegisterView.post`, §3.2) — calls
  `send_otp_email(user, otp.code)`.

All three call sites stay synchronous, matching the webhook's existing
synchronous style — no Celery/queue introduced (none exists in the codebase
today).

## 5. Django email backend: `django-ses`

`backend/requirements.txt`: add `django-ses>=4.0,<5.0`.

`backend/config/settings/base.py`, appended near the existing `RAZORPAY_*`
settings (`base.py:113-115`):

```python
EMAIL_BACKEND = "django_ses.SESBackend"
AWS_SES_REGION_NAME = env("AWS_SES_REGION_NAME", default="ap-south-1")
AWS_SES_REGION_ENDPOINT = f"email.{AWS_SES_REGION_NAME}.amazonaws.com"
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")
```

No explicit AWS access key/secret settings — `django-ses` uses the same
boto3 credential chain already relied on for S3 (`production.py:12-14`),
which on EC2 resolves through the instance's IAM role (§6). `backend/config/settings/dev.py` (currently just `DEBUG = True` on top of
`base.py`) gets one line added, `EMAIL_BACKEND =
"django.core.mail.backends.console.EmailBackend"`, so OTP/order emails print
to the terminal locally instead of requiring real AWS credentials for
development. `staging.py` and `production.py` inherit the SES backend from
`base.py` unchanged.

## 6. AWS: SES sandbox + SSM secrets

### 6.1 SES setup (manual console steps, documented in the implementation plan)

1. In SES console (region `ap-south-1` or wherever the EC2 box is), verify a
   single sender email address — any real inbox you control works, since no
   domain is needed for sandbox mode.
2. Manually verify the handful of recipient addresses used for testing
   (your own + testers') — sandbox mode only sends to verified recipients,
   200/day cap.
3. Note the exact upgrade path for later (not executed now): once the
   client-approved domain exists, verify the domain instead of an address,
   add the DKIM CNAME + SPF TXT records SES provides, then request SES
   production access via the console (turnaround ~1-2 business days).

### 6.2 IAM + SSM (manual console/CLI steps, documented in the implementation plan)

1. Create SSM `SecureString` parameters under a `/fnb-aqua/staging/` prefix:
   `/fnb-aqua/staging/SECRET_KEY`, `/fnb-aqua/staging/DATABASE_URL`,
   `/fnb-aqua/staging/RAZORPAY_KEY_ID`, `/fnb-aqua/staging/RAZORPAY_KEY_SECRET`,
   `/fnb-aqua/staging/RAZORPAY_WEBHOOK_SECRET`,
   `/fnb-aqua/staging/DEFAULT_FROM_EMAIL`.
2. Create an IAM policy granting `ssm:GetParameter`/`ssm:GetParametersByPath`
   scoped to `arn:aws:ssm:*:*:parameter/fnb-aqua/staging/*` plus
   `kms:Decrypt` on the key used for the `SecureString`s (the default
   `alias/aws/ssm` key is fine at this scale).
3. Attach that policy to an IAM role, attach the role to the EC2 instance
   (no access keys stored anywhere).
4. `AWS SES` sending also needs `ses:SendEmail`/`ses:SendRawEmail` on the same
   instance role.

### 6.3 Django-side loading (`backend/config/settings/base.py:7-8`)

Replace the plain `environ.Env.read_env(BASE_DIR / ".env")` call with a
startup fetch that populates `os.environ` from SSM before `env(...)` calls
run, so every existing `env("X")` call in `base.py` is untouched:

```python
import os
import boto3

if os.environ.get("LOAD_SECRETS_FROM_SSM") == "true":
    ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
    paginator = ssm.get_paginator("get_parameters_by_path")
    for page in paginator.paginate(Path="/fnb-aqua/staging/", WithDecryption=True):
        for param in page["Parameters"]:
            os.environ[param["Name"].rsplit("/", 1)[-1]] = param["Value"]
else:
    environ.Env.read_env(BASE_DIR / ".env")
```

`LOAD_SECRETS_FROM_SSM` is unset (falls back to `.env`) for local dev and
CI, and set `true` only in the EC2 deployment's environment — so local
development and tests need no AWS credentials at all.

## 7. Out of scope

- SMS OTP / any TRAI DLT registration.
- Password reset flow (email or otherwise).
- Login 2FA.
- Real HTTPS, ALB, ACM, or domain purchase/DNS — deferred until the client
  confirms final branding.
- SES production access request, domain verification, DKIM/SPF — documented
  as a later step, not executed this round.
- Async/queued email sending (Celery) — stays synchronous, matching the
  existing webhook handler's style.
- Rate limiting on `/verify-otp/` beyond the 5-attempt lockout baked into
  `OTPVerification` itself (no separate DRF throttle needed there since the
  model-level `attempts` counter already caps abuse per code).

## 8. Testing

Backend:
- `backend/accounts/tests/test_views.py`: extend/add —
  `RegisterView` no longer returns tokens, creates an inactive user, creates
  an `OTPVerification`, and triggers `send_otp_email` (mock/assert call);
  `verify-otp` happy path activates the user and returns tokens; wrong code
  increments `attempts` and eventually locks out after 5; expired code is
  rejected; already-consumed code is rejected; `resend-otp` invalidates the
  prior code and issues a new one; throttle on `resend-otp` engages after 3
  requests in an hour.
- `backend/accounts/tests/test_models.py` (new or extended): `OTPVerification.issue()` deletes prior unconsumed rows for the same user+purpose; `is_valid()` correctly rejects wrong code / expired / already-consumed.
- `backend/orders/tests/test_views.py`: extend the existing webhook and COD
  tests to assert `send_order_confirmation_email` is called (mock
  `core.email.send_mail` or the wrapper) once per successful order creation,
  and not called when the webhook is a no-op (duplicate delivery, wrong
  event type). Extend the admin status-update tests to assert
  `send_order_status_email` fires on each valid transition.
- `backend/core/tests/` (new `test_email.py`): `_send` swallows an exception
  from `send_mail` (e.g. patched to raise) without propagating — proves a
  broken SES call can't break a caller.

Frontend:
- `Register.test.jsx` (extend): successful submit navigates to `/verify-otp`
  with `user_id` in state, no longer to `/account/addresses`.
- `VerifyOtp.test.jsx` (new): correct code submits and redirects into the
  app authenticated; wrong code shows an inline error; resend button
  disables for the cooldown window then re-enables.

Manual verification (dev server, console `EMAIL_BACKEND`):
- Register a new account, confirm the OTP prints to the console log, enter
  it on `/verify-otp`, confirm login succeeds afterward and fails before.
- Place a COD order and a Razorpay test-mode order, confirm both print an
  order-confirmation email to console; change an order's status as staff,
  confirm a status-update email prints.
