---
name: resume-phase2-ecommerce
description: Use when resuming work on FNB Aqua's Phase 2 e-commerce implementation (customer accounts, cart, checkout, orders, notifications) after a break — picks up the subagent-driven-development execution exactly where it stopped, instead of re-deriving status from scratch.
---

# Resume Phase 2 E-Commerce

## Overview

FNB Aqua's Phase 2 (SRS: `docs/superpowers/specs/2026-08-17-phase2-srs-for-client-signature.docx`, design spec: `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md`) is delivered as 5 independent sub-plans, each executed via `superpowers:subagent-driven-development` in its own git worktree/branch off `phase-1`.

This is a project-specific resume pointer, not a general technique — it just tells you where things stand and what to do next. Don't treat it as reference documentation for the SDD process itself; that lives in the `subagent-driven-development` skill.

## Status (as of 2026-08-18, Sub-plans 1-4 merged; Sub-plan 5 not started)

| Sub-plan | Status | Branch/worktree | Plan file |
|---|---|---|---|
| 1. Customer Accounts | ✅ Merged into `phase-1` | (worktree removed after merge) | `docs/superpowers/plans/2026-08-17-phase2-accounts.md` |
| 2. Cart & Stock | ✅ Merged into `phase-1` | (worktree removed after merge) | `docs/superpowers/plans/2026-08-17-phase2-cart-stock.md` |
| 3. Checkout & Payment (Razorpay) | ✅ Merged into `phase-1` | (worktree removed after merge) | `docs/superpowers/plans/2026-08-17-phase2-checkout-payment.md` |
| 4. Order Management & Tracking | ✅ Merged into `phase-1` at `d334bc7` | (worktree removed after merge) | `docs/superpowers/plans/2026-08-17-phase2-order-management.md` |
| 5. Notifications | Not started | — | — |

Also merged into `phase-1` outside the 5-sub-plan sequence: a bounded feature (`product-stock-merge`) adding admin create-time duplicate-product detection (case-insensitive name+category match → 409 → confirm-and-add-stock flow) and a stock-count line on the customer-facing product card.

`phase-1` currently passes 170 backend tests and 48 frontend tests.

## To start Sub-plan 5 (Notifications)

The design spec already covers this sub-plan's scope in full (§5's notification endpoints, §7's admin notification bell, FR-20 through FR-23 in the SRS). Follow the same pattern used for 1-4:

1. Use `superpowers:using-git-worktrees` to create a new worktree off `phase-1` (e.g. `.worktrees/phase2-notifications` on branch `phase2-notifications`), with backend venv + frontend `node_modules` set up and baseline tests (170 backend / 48 frontend) verified green before any implementation begins.
2. Use `superpowers:writing-plans` to write an implementation plan covering the notifications scope from the design spec — admin notification bell, unread-count polling, sidebar badges — following the same Global Constraints / Decisions / numbered-tasks structure as the four prior sub-plans' plan files.
3. Execute with `superpowers:subagent-driven-development`: fresh implementer subagent per task, task-level review after each, one final whole-branch review before merge, bounded fix-loop discipline (only Critical/Important findings trigger a fix round; Minors are ledgered and deferred).
4. On a clean final review, delete the plan's `.superpowers/sdd/<plan-basename>/` workspace and invoke `superpowers:finishing-a-development-branch` to merge into `phase-1` (every sub-plan and bounded feature this project has done so far chose "merge locally").

## Known outstanding items (not sub-plan work, forwarded across sessions)

- `AWS_DEPLOYMENT.md` needs `RAZORPAY_*` env-var documentation before a real deploy (flagged during Sub-plan 3's final review, never yet acted on).
- Several Minor findings from Sub-plan 4's final review were forwarded rather than fixed (scope discipline: only Critical/Important findings enter a fix loop). Two worth a look during Sub-plan 5 or a later consistency pass: (a) `InquiriesManager.jsx` still lacks pagination, unlike the newer `OrdersManager.jsx`/`OrderHistory.jsx`; (b) staff have no in-app way to correct a tracking number after an order reaches `transported` (only via Django admin) — full detail in the `phase2-order-management` branch's merge commit history if resurrected.
