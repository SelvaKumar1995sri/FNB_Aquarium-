---
name: resume-phase2-ecommerce
description: Use when resuming work on FNB Aqua's Phase 2 e-commerce implementation (customer accounts, cart, checkout, orders, notifications) after a break — picks up the subagent-driven-development execution exactly where it stopped, instead of re-deriving status from scratch.
---

# Resume Phase 2 E-Commerce

## Overview

FNB Aqua's Phase 2 (SRS: `docs/superpowers/specs/2026-08-17-phase2-srs-for-client-signature.docx`, design spec: `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md`) was delivered as 5 independent sub-plans, each executed via `superpowers:subagent-driven-development` in its own git worktree/branch off `phase-1`.

This is a project-specific resume pointer, not a general technique — it just tells you where things stand. Don't treat it as reference documentation for the SDD process itself; that lives in the `subagent-driven-development` skill.

## Status (as of 2026-08-18): Phase 2 is COMPLETE — all 5 sub-plans merged into `phase-1`

| Sub-plan | Status | Plan file |
|---|---|---|
| 1. Customer Accounts | ✅ Merged into `phase-1` | `docs/superpowers/plans/2026-08-17-phase2-accounts.md` |
| 2. Cart & Stock | ✅ Merged into `phase-1` | `docs/superpowers/plans/2026-08-17-phase2-cart-stock.md` |
| 3. Checkout & Payment (Razorpay) | ✅ Merged into `phase-1` | `docs/superpowers/plans/2026-08-17-phase2-checkout-payment.md` |
| 4. Order Management & Tracking | ✅ Merged into `phase-1` at `d334bc7` | `docs/superpowers/plans/2026-08-17-phase2-order-management.md` |
| 5. Notifications | ✅ Merged into `phase-1` at `fce144d` | `docs/superpowers/plans/2026-08-17-phase2-notifications.md` |

Also merged into `phase-1` outside the 5-sub-plan sequence: a bounded feature (`product-stock-merge`) adding admin create-time duplicate-product detection (case-insensitive name+category match → 409 → confirm-and-add-stock flow) and a stock-count line on the customer-facing product card.

`phase-1` currently passes 184 backend tests and 54 frontend tests. Local `phase-1` is 9 commits ahead of `origin/phase-1` (not yet pushed as of this writing).

## What Sub-plan 5 (Notifications) added

A staff-only admin notification system with no dedicated notification log table: a single `AdminNotificationState` row per staff user stores a `last_seen_at`/watermark timestamp; `GET /api/v1/admin/notifications/` compares it against `Order.created_at`/`Inquiry.created_at` to compute unread counts, an `as_of` timestamp, and the newest few of each; `POST /api/v1/admin/notifications/seen/` advances the watermark to a client-supplied `seen_up_to` (clamped to `<= now`, falling back to `now` on anything absent/malformed/future). The frontend polls the GET endpoint every ~30s via `AdminNotificationsContext.jsx` and renders a bell + dropdown + sidebar badges in `Header.jsx`. The final whole-branch review caught and a follow-up fix wave closed two real bugs before merge: a watermark race that could silently mark an order "seen" before it was ever shown, and the dropdown blanking itself mid-read because it rendered live poll state instead of a snapshot taken at open time. A third bug (an unhandled crash on a semantically-invalid timestamp string) surfaced in the fix wave's own re-review and was patched directly before merging, since the SDD skill doesn't run a second automated fix round for a final review.

## Known outstanding items (not sub-plan work; nothing is queued behind them since Phase 2 is done)

- `AWS_DEPLOYMENT.md` needs `RAZORPAY_*` env-var documentation before a real deploy (flagged during Sub-plan 3's final review, never yet acted on).
- `InquiriesManager.jsx` still lacks pagination, unlike `OrdersManager.jsx`/`OrderHistory.jsx` (flagged during Sub-plan 4's final review).
- Staff have no in-app way to correct a tracking number after an order reaches `transported` (only via Django admin) — flagged during Sub-plan 4's final review.
- Sub-plan 5's final review surfaced several deferred Minors, most notably: no test asserting one staff member's `seen` action doesn't affect another staff member's unread counts (the central invariant of the per-user `AdminNotificationState` design, currently unasserted); the notification dropdown has no click-outside/Escape-to-close handling; no `Header.test.jsx` despite `Header.jsx` now consuming four contexts with real conditional logic.
- Local `phase-1` has not been pushed to `origin/phase-1` since Sub-plan 4's merge — push (with the user's go-ahead) whenever that's next wanted.

## If a sixth sub-plan or new Phase 2 feature is ever requested

Follow the same pattern used for 1-5: `superpowers:using-git-worktrees` → `superpowers:writing-plans` (reuse the design spec and this skill's file as references) → `superpowers:subagent-driven-development` → `superpowers:finishing-a-development-branch`. There is currently no such work planned.
