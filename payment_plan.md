# Payment Implementation Plan

## Context

Checkout currently fails with a 500 (`BadRequestError: Authentication failed`)
because `backend/.env` holds placeholder Razorpay credentials
(`RAZORPAY_KEY_ID=rzp_test_placeholder_key_id`), not real ones. Before fixing
that, we compared three ways to actually handle payment for FNB Aquatic
Studio, given the business already does in-person consultation/installation
visits for custom tank builds (see the "Our Process" section on the
homepage) and already collects phone + delivery address per order.

## Options compared

### 1. Razorpay (or similar gateway) — already ~80% built

`orders/razorpay_client.py`, `CheckoutView`, and `RazorpayWebhookView` already
implement this: customer pays via Razorpay's checkout widget (card/UPI/
netbanking/wallets), Razorpay's webhook confirms payment, and the webhook
handler auto-marks the order paid.

- Fully automated — no manual reconciliation, order confirms itself instantly.
- Customers can pay any way they like.
- Handles refunds, retries, and payment failures through Razorpay's API.
- ~2% fee per transaction once live (test mode is free).
- Needs KYC/business verification to go live (a few days).
- Most integration work is already done in this codebase.

### 2. Static UPI QR (own UPI ID) + manual confirmation

Generate a QR from the owner's UPI ID + order amount; customer scans and pays
directly into the business bank account; staff manually mark the order paid
in admin after checking the payment arrived.

- Completely free — no gateway, no % fee, money lands directly in the account.
- Very little backend work — just QR generation, no webhook/signature
  verification needed.
- No automatic confirmation — relies on staff checking the bank/UPI app and
  manually approving each order.
- Doesn't scale past low order volume; a customer could falsely claim "I paid".
- No refund automation, no retry handling.

### 3. Cash on Delivery / Pay on Pickup — no online payment

Order goes straight to "placed"; customer pays cash (or hands over UPI in
person) at delivery or pickup — fits naturally since custom builds already
involve an in-person visit.

- Zero integration work, zero fees, zero payment-gateway risk.
- Fits this business's actual model well (installs/custom builds already
  involve a visit).
- No upfront commitment — higher no-show/cancellation risk after stock is
  already prepped.
- Cash handling risk for staff; doesn't work for orders shipped without an
  in-person visit.
- No working capital upfront for custom builds needing materials bought in
  advance.

## Recommendation

- **Primary path — Razorpay** for standard product orders: automated,
  trustworthy confirmation, and it's nearly finished already. Blocked only on
  getting real Razorpay **test-mode** API keys (free, from
  dashboard.razorpay.com → Settings → API Keys) to replace the placeholders
  in `backend/.env`.
- **Fallback — Cash on Delivery / Pay on Pickup** for local custom-build
  orders where an in-person visit happens anyway.
- **Skip the static-QR route** — the ~2% fee saved isn't worth the manual
  reconciliation burden and fraud risk, especially with Razorpay this close
  to done.

## Status

- [ ] Get real Razorpay test-mode API keys and update `backend/.env`
      (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`)
- [ ] Verify the existing Razorpay checkout flow end-to-end with test keys
- [ ] Add a Cash on Delivery / Pay on Pickup option at checkout as a fallback
      payment method
