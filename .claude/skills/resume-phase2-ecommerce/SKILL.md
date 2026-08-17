---
name: resume-phase2-ecommerce
description: Use when resuming work on FNB Aqua's Phase 2 e-commerce implementation (customer accounts, cart, checkout, orders, notifications) after a break — picks up the subagent-driven-development execution exactly where it stopped, instead of re-deriving status from scratch.
---

# Resume Phase 2 E-Commerce

## Overview

FNB Aqua's Phase 2 (SRS: `docs/superpowers/specs/2026-08-17-phase2-srs-for-client-signature.docx`, design spec: `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md`) is delivered as 5 independent sub-plans, each executed via `superpowers:subagent-driven-development` in its own git worktree/branch off `phase-1`.

This is a project-specific resume pointer, not a general technique — it just tells you where things stand and what to do next. Don't treat it as reference documentation for the SDD process itself; that lives in the `subagent-driven-development` skill.

## Status (as of 2026-08-17, stopped mid-Sub-plan-2)

| Sub-plan | Status | Branch/worktree | Plan file |
|---|---|---|---|
| 1. Customer Accounts | ✅ Merged into `phase-1` and pushed to origin | (worktree removed after merge) | `docs/superpowers/plans/2026-08-17-phase2-accounts.md` |
| 2. Cart & Stock | 🔄 In progress — Tasks 1-2 complete and reviewed clean; Task 3 (`GET /api/v1/cart/`) implemented and reviewed, **one Important finding open, fix round 1 not yet dispatched** (see below); Tasks 4-10 not started | `.worktrees/phase2-cart-stock` on branch `phase2-cart-stock` | `docs/superpowers/plans/2026-08-17-phase2-cart-stock.md` |
| 3. Checkout & Payment (Razorpay) | Not started | — | — |
| 4. Order Management & Tracking | Not started | — | — |
| 5. Notifications | Not started | — | — |

## Exact next action for Sub-plan 2

Ledger: `.worktrees/phase2-cart-stock/.superpowers/sdd/2026-08-17-phase2-cart-stock/progress.md` — read this first, it has the full task-by-task history.

**Task 3 is mid-fix-loop, not complete.** Its review approved the overall implementation but found:
> `backend/cart/serializers.py`'s `get_line_total` uses unquantized `str(obj.product.price * obj.quantity)` instead of explicit `:.2f` formatting (unlike the more defensive `subtotal` calculation nearby). Currently always correct given today's field definitions, but fragile against future changes (e.g. a discount multiplier). Fix: `f"{obj.product.price * obj.quantity:.2f}"`.

Before touching Task 4, dispatch fix round 1 for this finding (per `subagent-driven-development`'s fix-loop process: resume the original implementer if your harness supports it, otherwise a fresh implementer carrying this finding), then a scoped re-review, then mark Task 3 complete in the ledger.

## To resume Sub-plan 2

1. If `.worktrees/phase2-cart-stock` was removed, recreate it: `git worktree add .worktrees/phase2-cart-stock phase2-cart-stock` (branch already exists with Tasks 1-3's commits), then redo environment setup — backend: create venv, `pip install -r requirements.txt`, copy `.env.example` to `.env`; frontend: `npm install`, copy `.env.example` to `.env`.
2. Invoke `superpowers:subagent-driven-development` with plan file `docs/superpowers/plans/2026-08-17-phase2-cart-stock.md`.
3. It reads the ledger and resumes correctly — but double-check the "Exact next action" section above first, since Task 3's in-flight fix loop is a state the ledger records but the skill's own resume logic expects you to notice and act on.

## To start a new sub-plan (3, 4, or 5) once Sub-plan 2 merges

The design spec already covers all remaining sub-plans in full detail (models, API surface, frontend structure notes). Follow the same pattern used for 1 and 2: create a new worktree off `phase-1`, write an implementation plan with `superpowers:writing-plans` covering that sub-plan's scope from the design spec (§5-9 for checkout/orders/notifications), then execute with `superpowers:subagent-driven-development`.
