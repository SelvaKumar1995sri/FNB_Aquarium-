# Phase 2 — Accounts, Cart, Checkout & Order Fulfillment

Date: 2026-08-17
Status: Approved for planning — open items resolved, ready for implementation planning (see §10, §11)

## 1. Overview

FNB Aquatic Studio's website (Phase 1) is a catalog + inquiry site: browsers can view products and submit an inquiry (general question, product question, or custom tank build), but there is no way to actually buy anything online — no accounts, no cart, no payment. The client has now asked for Phase 2: customer accounts, a shopping cart, checkout with a payment gateway, and an admin-side order fulfillment workflow with shipment tracking and a notification system for new orders/inquiries.

Phase 1's inquiry system is **not replaced**. It continues to serve general questions and custom tank build requests exactly as it does today. Phase 2 adds a **new, parallel flow** — Cart → Checkout → Order — specifically for customers who want to directly buy catalog products online.

## 2. Goals

- Customers can create an account, log in, add catalog products to a cart, and pay for them via Razorpay.
- Stock is tracked as a real quantity per product; checkout cannot oversell.
- Admin can see all orders, move each through a fulfillment workflow (Placed → Packed → Transported → Delivered, or Cancelled), and record courier/porter tracking details when an order ships.
- Admin gets a visible, near-real-time count of unread new orders and new inquiries from anywhere in the admin area.

## 3. Non-Goals (explicitly out of scope for Phase 2)

- Guest checkout — login is required to add to cart or check out.
- Live courier-API tracking (Delhivery/Shiprocket/etc.) — tracking info is admin-entered text, not auto-updated.
- Real-time push (websockets) for notifications — a periodic poll is sufficient.
- Returns/refunds workflow, product reviews/ratings, wishlists, multi-currency, coupons/discounts.
- Any change to the existing Inquiry system's data model, endpoints, or admin UI.

## 4. Data model

### 4.1 Customer accounts

Reuse Django's built-in `User` model — the same one staff logins already use (`is_staff=True` for admin, `is_staff=False` for customers). No new user table.

```python
class CustomerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="customer_profile")
    phone = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)
```

### 4.2 Address

```python
class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    full_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    line1 = models.CharField(max_length=200)
    line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    is_default = models.BooleanField(default=False)
```

### 4.3 Cart / CartItem

One active cart per logged-in user (created lazily on first add-to-cart).

```python
class Cart(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="cart")
    updated_at = models.DateTimeField(auto_now=True)

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("cart", "product")
```

### 4.4 Order / OrderItem

Created only after a payment succeeds. `OrderItem` snapshots the product's name and price at purchase time so later catalog edits (price changes, renames, deletions) never rewrite order history.

```python
class Order(models.Model):
    STATUS_CHOICES = [
        ("placed", "Placed"),
        ("packed", "Packed"),
        ("transported", "Transported"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="orders")
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="placed")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    razorpay_order_id = models.CharField(max_length=100)
    razorpay_payment_id = models.CharField(max_length=100, blank=True)

    # Tracking — admin fills in ONE of these two groups when moving to "transported"
    porter_name = models.CharField(max_length=100, blank=True)
    porter_phone = models.CharField(max_length=20, blank=True)
    courier_name = models.CharField(max_length=100, blank=True)
    courier_tracking_number = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, null=True, on_delete=models.SET_NULL)
    product_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
```

### 4.5 Stock

`Product` gains a real quantity field:

```python
stock_quantity = models.PositiveIntegerField(default=0)
```

`Product.in_stock` (boolean) is kept, but becomes a **derived, read-only** serializer field (`stock_quantity > 0`) rather than a stored column — the underlying `BooleanField` is removed from the model, and any Phase 1 frontend code reading `in_stock` keeps working unmodified. `stock_quantity` is the new source of truth everywhere stock is set or checked (admin edit form, cart validation, checkout, stock decrement).

### 4.6 Notifications

No dedicated notification log table. Each staff `User` gets a `last_admin_notification_check` timestamp (a small profile field or a simple key-value row). The polling endpoint compares this timestamp against `Order.created_at` / `Inquiry.created_at` to compute unread counts and the newest few of each — cheaper to build and reason about than a full notifications table, at the cost of not preserving a permanent "read/unread" history per notification (acceptable given Phase 2's scope).

## 5. Backend API surface (new endpoints)

| Endpoint | Method | Notes |
|---|---|---|
| `/api/v1/auth/register/` | POST | Customer signup (name, email, phone, password) |
| `/api/v1/cart/` | GET | Current user's cart + items |
| `/api/v1/cart/items/` | POST | Add product to cart (or increment quantity) |
| `/api/v1/cart/items/<id>/` | PATCH/DELETE | Update quantity / remove item |
| `/api/v1/addresses/` | GET/POST | List/create the user's saved addresses |
| `/api/v1/checkout/` | POST | Validates stock, computes total server-side, creates a Razorpay order, returns its ID + key for the frontend checkout popup |
| `/api/v1/payments/webhook/` | POST | Razorpay webhook — verifies signature, marks payment captured, creates the `Order` + `OrderItem`s, decrements stock, clears the cart |
| `/api/v1/orders/` | GET | Customer's own order history |
| `/api/v1/orders/<id>/` | GET | Order detail (customer, own orders only) |
| `/api/v1/admin/orders/` | GET | Staff-only, all orders, filterable by status |
| `/api/v1/admin/orders/<id>/` | PATCH | Staff-only, status transition + tracking fields |
| `/api/v1/admin/notifications/` | GET | Staff-only, unread counts + latest orders/inquiries |
| `/api/v1/admin/notifications/seen/` | POST | Staff-only, updates `last_admin_notification_check` |

All admin endpoints reuse the existing `IsStaffOrReadOnly`-style permission pattern already established for Categories/Products/Videos.

## 6. Customer-facing flow

1. **Register/Login** — new pages, JWT auth reusing the existing token-issuing pattern from Phase 1's admin login, but for `is_staff=False` users.
2. **Browse** — unchanged from Phase 1.
3. **Add to cart** — a new cart icon in the header (alongside/replacing the search icon area); adding a product shows a quick confirmation, doesn't navigate away.
4. **Cart page** — list of items with quantity steppers, remove buttons, running subtotal; blocks checkout if any item's requested quantity now exceeds current stock.
5. **Checkout** — address selection/entry, order summary, "Pay Now" triggers Razorpay's hosted checkout popup (customer never enters card/UPI details on our own pages).
6. **Payment result** — on success, the webhook (§5) creates the order; the frontend polls/redirects to an order-confirmation page once the webhook has landed (a short "processing" state is expected — typically well under a second in practice, but the UI must handle it gracefully rather than assuming instant confirmation).
7. **My Orders** — order history list + detail, showing current status and (once "transported") the tracking info the admin entered.

## 7. Admin flow

- New **Orders** sidebar link (parallel to the existing Inquiries link): list with a status filter, each row linking to a detail view.
- Order detail: customer info, address, line items, current status, and a status-transition control. Moving to "Transported" reveals a small form requiring either porter name+phone OR courier name+tracking number (not both, not neither — enforced client-side and server-side).
- **Header notification bell**: visible everywhere in the admin area (not just on Orders/Inquiries pages), showing a combined unread badge; clicking opens a dropdown listing the newest few unread orders and inquiries, each a link to its detail page. Polled every ~30 seconds.
- The existing sidebar **Orders**/**Inquiries** links each also carry their own small unread-count badge, sourced from the same polling response.

## 8. Payment security

- The amount charged is **always** computed server-side from the current cart + live stock at checkout time — the client never sends a trusted amount.
- The Razorpay webhook signature is verified (using Razorpay's SDK/shared secret) before an order is ever created or marked paid; unverified webhook calls are rejected with 400.
- Card/UPI/bank details never reach our backend — Razorpay's hosted checkout handles collection, keeping this project out of PCI-DSS scope.
- Stock decrement + order creation happen inside a single DB transaction to avoid a race between two customers' near-simultaneous checkouts on the last unit.

## 9. Frontend structure notes

New pages: `Register`, `Login` (customer-facing, separate from the existing `/admin/login`), `Cart`, `Checkout`, `OrderConfirmation`, `OrderHistory`, `OrderDetail`. New admin pages: `OrdersManager` (list), `OrderDetail` (admin view, reuses/adapts the existing manager-page patterns from `CategoriesManager`/`ProductsManager`). Header gets a cart icon (customer-facing) and a notification bell (admin-only, shown only when `isAuthenticated && isStaff`, following the same conditional-rendering pattern already used for the admin sidebar section).

## 10. Decisions (resolved prior to implementation planning)

- **Razorpay integration**: use the official `razorpay` Python package server-side (order creation, webhook signature verification) and Razorpay's hosted Checkout.js on the frontend (script-loaded popup, no card fields of our own). Credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are read from environment variables with placeholder values in `.env.example`; the client will supply real test-mode keys before end-to-end checkout testing. All code must work against Razorpay's test mode without any code changes when swapped for live keys later.
- **`Product.in_stock`**: kept as a derived, read-only API field (see §4.5) — the stored boolean column is dropped, `stock_quantity` becomes the single source of truth, and no Phase 1 frontend code needs to change.
- **Payment "processing" UX**: after Razorpay's client-side success handler fires, the frontend navigates to an order-confirmation route that polls `GET /api/v1/orders/latest-pending/` (or equivalent) every ~1.5s for up to ~15s waiting for the webhook to land and create the `Order`. While waiting it shows a "Confirming your payment…" state; if the order hasn't appeared after the timeout, it shows a reassuring fallback ("Payment received — your order will appear in My Orders shortly; contact us if it doesn't within a few minutes") rather than an error, since the webhook is the source of truth and will land shortly regardless.

## 11. Delivery plan

Given the scope, Phase 2 is implemented as five sequential sub-plans, each with its own implementation plan, review, and merge before the next starts:

1. **Accounts** — Customer registration/login (reusing Django `User` + SimpleJWT), `CustomerProfile`, `Address` CRUD.
2. **Cart & Stock** — `stock_quantity` migration + derived `in_stock`, `Cart`/`CartItem`, cart API + UI, stock-aware add-to-cart.
3. **Checkout & Payment** — Razorpay order creation, webhook handler, `Order`/`OrderItem` creation, atomic stock decrement, checkout UI + payment-confirmation flow.
4. **Order Management & Tracking** — staff Orders list/detail, status transitions, tracking-detail entry, customer-facing order history/detail.
5. **Notifications** — unread-count polling endpoint, admin header bell + sidebar badges.

Each sub-plan is scoped to be independently testable and shippable on top of the previous one.
