# Phase 2 Sub-Plan 3: Checkout & Payment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in customer choose a delivery address, pay for their cart via Razorpay's hosted checkout, and land on a confirmation page once the payment succeeds — with the server always computing the charged amount itself, creating the `Order` only after Razorpay confirms payment, and decrementing stock exactly once per payment even if Razorpay retries the webhook.

**Architecture:** A new `orders` Django app holds `Order`/`OrderItem` (created only after payment succeeds) and `CheckoutSession` (an internal bridging record, not in the customer-facing API surface, created at `/api/v1/checkout/` time to snapshot the cart/address/total under a specific Razorpay order ID — the webhook has no authenticated request context, so this snapshot is the only way it can reconstruct "whose payment is this, for what, at what price" days after the fact). `POST /api/v1/checkout/` validates the cart against live stock, computes the total server-side, asks Razorpay to create an order, and returns just enough for the frontend to open Razorpay's hosted Checkout.js popup. `POST /api/v1/payments/webhook/` is the only place `Order`/`OrderItem` rows are ever created and the only place stock is ever decremented for a purchase — inside one DB transaction with `select_for_update()` on the affected products, guarded by webhook signature verification and idempotent against Razorpay's at-least-once delivery retries. On the frontend, a new `Checkout` page handles address selection and launches the Razorpay popup; a new `OrderConfirmation` page polls a small lookup endpoint until the webhook has landed, showing a "confirming" state and a reassuring fallback if it takes unusually long.

**Tech Stack:** Django 5 + DRF (backend, already installed) + `razorpay` (new dependency, this sub-plan's Task 1). React 19 + React Router 7 + axios + Tailwind v4 (frontend, already installed) + Razorpay's hosted Checkout.js (loaded via `<script>` at runtime, not an npm package). No other new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md` (§4.4 Order/OrderItem, §5 checkout/webhook/orders-lookup rows, §6 steps 5-6, §8 Payment security, §9 Checkout/OrderConfirmation frontend structure, §10 Razorpay integration + payment-processing-UX decisions); SRS FR-8 through FR-12, NFR-1 through NFR-3.

## Global Constraints

- Checkout requires login — `/checkout` and `/order-confirmation/:razorpayOrderId` are both behind `CustomerGuard` (matching `/cart`/`/account`), and `CheckoutView`/`OrderByRazorpayOrderView` both use `IsAuthenticated` (FR-4, consistent with Sub-plans 1-2).
- The charged amount is **always** computed server-side from the customer's live cart contents and current product prices at the moment `/api/v1/checkout/` is called — the client never sends an amount, and nothing the client sends is trusted as a price (FR-9). The only client input to checkout is which saved address to ship to.
- An `Order` (and its `OrderItem`s) is created **only** inside `RazorpayWebhookView`, in response to Razorpay confirming a `payment.captured` event with a verified signature — never at `/api/v1/checkout/` time, never from any other code path. A failed, abandoned, or never-completed payment therefore never creates an `Order` and never touches stock (FR-10).
- Card, UPI, netbanking, and wallet credential collection happens entirely inside Razorpay's hosted Checkout.js popup — no payment form fields of any kind exist in this codebase, and the backend never receives raw payment credentials, only Razorpay's own order/payment identifiers and a signed webhook notification (FR-11, NFR-2).
- On successful payment, the customer's cart is cleared and the purchased items' `stock_quantity` is decremented — both inside the same atomic transaction that creates the `Order` (FR-12).
- The webhook signature is verified (via the `razorpay` SDK's `verify_webhook_signature`, HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`) before anything is read from the payload or any database write happens; an invalid signature returns 400 with no side effects (NFR-1, §8).
- Stock decrement and `Order` creation happen inside one `transaction.atomic()` block with `select_for_update()` on the affected `Product` rows, so two webhook deliveries competing over the same product's stock cannot interleave a lost update or a negative-stock result (NFR-3; see Decisions below for what happens in the rare case where captured payments outrun available stock).
- Existing Sub-plan 1/2 code (`accounts`, `cart`, `CustomerAuthContext`, `CartContext`, `Cart.jsx`'s existing view/update/remove behavior) is untouched by this sub-plan except: `Cart.jsx` gains the "Proceed to Checkout" button Sub-plan 2 deliberately deferred, `App.jsx` gains two new guarded routes, and `accounts/views.py`'s `AddressViewSet` gains a small fix made necessary by this sub-plan's own `Order.address = ForeignKey(..., on_delete=PROTECT)` (see Decisions).
- Responsive on mobile and desktop, using the site's existing Tailwind design tokens (`brand-dark`, `brand-light`, `brand-aqua`, `brand-forest`) — matching `Cart.jsx`/`AccountAddresses.jsx`'s established visual language.
- All Razorpay code must work unmodified against Razorpay's test mode; real test-mode keys are supplied by the client later and are not required for any test in this plan (see Decisions).

## Decisions (resolved before implementation)

- **`CheckoutSession` model (not in the design spec's §4.4, added here):** the spec's data model only lists `Order`/`OrderItem`, but neither can exist before payment succeeds (FR-10), and Razorpay's webhook call carries no session, cookie, or JWT — it's an unauthenticated server-to-server POST identified only by a `razorpay_order_id`. Something has to record, at `/api/v1/checkout/` time, which user/address/cart-snapshot/amount that Razorpay order corresponds to, so the webhook can reconstruct it later. `CheckoutSession` is that record: created once per `/checkout/` call, holding a JSON snapshot of the cart's items (product id, name, unit price, quantity — captured at checkout time, not re-read from the live cart later) plus the chosen address and computed total. Its `order` field starts `null` and is set exactly once, by the webhook, which also doubles as the idempotency guard (see below). This is an implementation-level bridging table, not part of the customer-facing API surface in §5 — it has no dedicated endpoint of its own.
- **Snapshot-at-checkout, not re-read-at-webhook:** `OrderItem.product_name`/`unit_price`/`quantity` are populated from `CheckoutSession.items_snapshot`, captured at `/checkout/` time — not from re-querying the customer's live cart when the webhook fires. FR-9 says the amount is calculated "at the moment of checkout"; re-deriving it later from a cart that may have changed (or been used for a second, unrelated checkout attempt) in the minutes between opening the Razorpay popup and the customer completing payment would contradict that and could silently charge for the wrong items. The live cart is only ever touched by the webhook to clear it (`CartItem.objects.filter(cart__user=...).delete()`), never to price or size the order.
- **Oversell edge case at webhook time:** `select_for_update()` prevents a *lost update* on `stock_quantity` (NFR-3's literal DB-integrity requirement), but it cannot retroactively stop a payment Razorpay has already captured. If, in the rare window between `/checkout/` and the webhook landing, another purchase has already dropped a product's stock below the checked-out quantity, the `Order` is still created (the customer's money was already taken, and this phase explicitly excludes any refund workflow — see spec §5 Out of Scope — so refusing the order would leave the business with no way to make it right through this system) and `stock_quantity` is clamped to `max(0, stock_quantity - quantity)` rather than allowed to go negative. This is a deliberate, narrow trade-off: it protects data integrity (stock never goes negative, decrements never get lost or double-applied) without pretending the system can undo a payment it doesn't have refund tooling for. Staff-facing visibility into this rare case is out of this sub-plan's scope (Sub-plan 4/5 territory).
- **Order lookup endpoint keyed by `razorpay_order_id`, not "latest pending":** the design spec's §10 decision describes the frontend polling something like `GET /api/v1/orders/latest-pending/`, explicitly flagged "(or equivalent)". A literal "latest order for this user" lookup has a real correctness bug: a customer with any prior order history would immediately match their *previous* order the instant they land on the confirmation page, before the new payment's webhook has even landed — showing the wrong order, or a false-positive "confirmed" state. `GET /api/v1/orders/by-razorpay-order/<razorpay_order_id>/` instead uses the exact Razorpay order ID the frontend already has (returned by `/checkout/`), is unambiguous regardless of order history, and 404s uniformly whether the order doesn't exist yet (webhook still pending) or belongs to another user — the frontend's polling+timeout loop already treats "not found" as "not yet" either way, so this distinction doesn't need to be surfaced.
- **Webhook idempotency:** Razorpay's webhook delivery is at-least-once — the same `payment.captured` event can arrive more than once. `CheckoutSession.order` is checked (under the same `select_for_update()` row lock used for the stock check) before doing any work; if it's already set, the handler returns 200 immediately without creating a second `Order` or decrementing stock again. This is why `CheckoutSession.order` is a nullable `OneToOneField` rather than the webhook simply checking `Order.objects.filter(razorpay_order_id=...).exists()` — the former is locked in the same transaction as the stock check, closing the race between two near-simultaneous deliveries of the same event.
- **`AddressViewSet.destroy()` fix:** `Order.address` is `on_delete=models.PROTECT` (per the spec's own §4.4 model), which is new behavior this sub-plan introduces — before `Order` existed, deleting any address always succeeded. Now, deleting an address referenced by a past order raises Django's `ProtectedError`, which DRF's default exception handling does not translate into a clean response (it isn't an `APIException` subclass), so without a fix this would surface to the customer as an unhandled 500. `AddressViewSet` gets a small `destroy()` override translating `ProtectedError` into a clean 400. This is included in Task 1 because Task 1 is what introduces the `PROTECT` relationship that makes it necessary.
- **No Razorpay credentials required to develop or test this plan:** `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` get placeholder values in `.env.example` (Task 1). `POST /checkout/`'s call to Razorpay's `order.create` API is mocked in tests (patching a small `get_razorpay_client()` factory function, never hitting the network). Webhook signature verification is tested with **real** HMAC-SHA256 signatures computed in the test using whatever `RAZORPAY_WEBHOOK_SECRET` is in the test environment's `.env` — this exercises the actual cryptographic code path with no mocking and no real Razorpay credentials needed, since `verify_webhook_signature` is a pure local computation.
- **Frontend poll timing is a prop, not a hardcoded constant:** `OrderConfirmation` accepts `pollIntervalMs`/`pollTimeoutMs` props (defaulting to the spec's 1.5s/15s), so its tests can use tiny values (tens of milliseconds) with real timers instead of either sleeping for a real 15+ seconds or fighting fake-timer/microtask interleaving in a payment-confirmation-critical test. Production usage (`<OrderConfirmation />` in `App.jsx`, no props) gets the spec's real timing.
- **No "My Orders" page in this sub-plan:** `GET /api/v1/orders/` (list) and the general customer order-history/detail UI are explicitly Sub-plan 4's scope per the design spec's §11 delivery plan ("customer-facing order history/detail"). This sub-plan's `OrderByRazorpayOrderView` exists solely to support the confirmation page's polling and is not the list/detail surface Sub-plan 4 will build (though Sub-plan 4 can and should reuse `OrderSerializer`/`OrderItemSerializer` from this sub-plan).

## Delivery order

Four backend tasks, then two frontend tasks, each independently testable:

1. `orders` app scaffold — `Order`/`OrderItem`/`CheckoutSession` models, admin, migration; add the `razorpay` dependency and its settings/env vars; fix `AddressViewSet.destroy()` for the new `PROTECT` relationship.
2. `POST /api/v1/checkout/` — validate address ownership and live stock, compute the total, create a Razorpay order + `CheckoutSession` snapshot.
3. `POST /api/v1/payments/webhook/` — verify signature, create `Order`/`OrderItem`s, decrement stock, clear the cart — atomic and idempotent.
4. `GET /api/v1/orders/by-razorpay-order/<razorpay_order_id>/` — customer-scoped order lookup for the confirmation page's polling.
5. `Checkout.jsx` page (address selection, order summary, Razorpay popup) + `Cart.jsx`'s "Proceed to Checkout" button + the guarded `/checkout` route.
6. `OrderConfirmation.jsx` page (polls until the order appears, or shows a timeout fallback) + the guarded `/order-confirmation/:razorpayOrderId` route.

---

## Task 1: `orders` app scaffold — models, Razorpay setup, address-deletion fix

**Files:**
- Modify: `backend/requirements.txt` (add `razorpay`)
- Modify: `backend/.env.example` (add `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` placeholders)
- Modify: `backend/config/settings/base.py` (add `"orders"` to `INSTALLED_APPS`; add the three `RAZORPAY_*` settings)
- Modify: `backend/accounts/views.py` (small `AddressViewSet.destroy()` fix)
- Modify: `backend/accounts/tests/test_addresses.py` (one new test for the fix, requires `orders.models.Order` to exist)
- Create: `backend/orders/__init__.py` (empty)
- Create: `backend/orders/apps.py`
- Create: `backend/orders/models.py`
- Create: `backend/orders/admin.py`
- Create: `backend/orders/migrations/__init__.py` (empty)
- Create: `backend/orders/migrations/0001_initial.py` (generated by `makemigrations`, see Step 4)
- Create: `backend/orders/tests/__init__.py` (empty)
- Create: `backend/orders/tests/test_models.py`

**Interfaces:**
- Consumes: `accounts.models.Address` (Sub-plan 1), `catalog.models.Product` (existing).
- Produces: `orders.models.Order` (`user` FK, `address` FK `PROTECT`, `status`, `total_amount`, `razorpay_order_id`, `razorpay_payment_id`, tracking fields), `orders.models.OrderItem` (`order` FK, `product` FK `SET_NULL`, snapshot fields), `orders.models.CheckoutSession` (`user`, `address`, `razorpay_order_id` unique, `amount`, `items_snapshot` JSON, nullable `order` OneToOne) — consumed by Tasks 2-4.

- [ ] **Step 1: Write the failing tests**

Create `backend/orders/tests/__init__.py` (empty) and `backend/orders/tests/test_models.py`:

```python
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from accounts.models import Address
from catalog.models import Category, Product
from orders.models import CheckoutSession, Order, OrderItem

User = get_user_model()


class OrderModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="A", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_str_includes_id_and_user(self):
        order = Order.objects.create(
            user=self.user, address=self.address, total_amount="500.00", razorpay_order_id="order_test1",
        )
        self.assertIn(str(order.id), str(order))
        self.assertIn(str(self.user), str(order))

    def test_default_status_is_placed(self):
        order = Order.objects.create(
            user=self.user, address=self.address, total_amount="500.00", razorpay_order_id="order_test2",
        )
        self.assertEqual(order.status, "placed")


class OrderItemModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="b@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="B", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.order = Order.objects.create(
            user=self.user, address=self.address, total_amount="200.00", razorpay_order_id="order_test3",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=10,
        )

    def test_str_includes_quantity_and_product_name(self):
        item = OrderItem.objects.create(
            order=self.order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )
        self.assertEqual(str(item), "2 x Tank")

    def test_survives_product_deletion(self):
        item = OrderItem.objects.create(
            order=self.order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )
        self.product.delete()
        item.refresh_from_db()
        self.assertIsNone(item.product)
        self.assertEqual(item.product_name, "Tank")


class CheckoutSessionModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="c@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="C", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_razorpay_order_id_is_unique(self):
        CheckoutSession.objects.create(
            user=self.user, address=self.address, razorpay_order_id="order_dup",
            amount="100.00", items_snapshot=[],
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CheckoutSession.objects.create(
                    user=self.user, address=self.address, razorpay_order_id="order_dup",
                    amount="100.00", items_snapshot=[],
                )

    def test_order_is_null_until_webhook_processes_it(self):
        session = CheckoutSession.objects.create(
            user=self.user, address=self.address, razorpay_order_id="order_pending",
            amount="100.00", items_snapshot=[],
        )
        self.assertIsNone(session.order)
```

Append to `backend/accounts/tests/test_addresses.py` (add one import alongside the existing ones, then one new test method inside `AddressViewSetTests`):

```python
from orders.models import Order
```

```python
    def test_deleting_address_used_in_an_order_returns_a_clean_error(self):
        mine = Address.objects.create(
            user=self.user, full_name="Mine", phone="2", line1="y", city="c", state="s", pincode="600002",
        )
        Order.objects.create(
            user=self.user, address=mine, total_amount="100.00", razorpay_order_id="order_protect_test",
        )
        response = self.client.delete(f"/api/v1/addresses/{mine.id}/", **self.auth_header)
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())
        self.assertTrue(Address.objects.filter(pk=mine.id).exists())
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test orders.tests.test_models accounts.tests.test_addresses -v 2`
Expected: `orders.tests.test_models` fails with `ModuleNotFoundError: No module named 'orders.models'` (app doesn't exist yet); `accounts.tests.test_addresses`'s new test fails the same way (`from orders.models import Order` at the top of the file).

- [ ] **Step 3: Add the dependency, scaffold the app, write the models**

In `backend/requirements.txt`, add this line (anywhere — alphabetical position after `psycopg2-binary` keeps it tidy, but any position works):

```
razorpay>=2.0,<2.1
```

Install it: `cd backend && pip install -r requirements.txt`

In `backend/.env.example`, add three lines at the end:

```
RAZORPAY_KEY_ID=rzp_test_placeholder_key_id
RAZORPAY_KEY_SECRET=placeholder_key_secret
RAZORPAY_WEBHOOK_SECRET=placeholder_webhook_secret
```

Copy the same three lines into your local `backend/.env` (not committed) with the same placeholder values — real test-mode keys aren't needed until manual end-to-end verification against the real Razorpay test dashboard, which is out of this plan's automated-test scope.

In `backend/config/settings/base.py`, add `"orders"` to `INSTALLED_APPS` (after `"cart"`):

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "core",
    "catalog",
    "inquiries",
    "accounts",
    "cart",
    "orders",
]
```

And add these three lines at the end of `backend/config/settings/base.py` (after the `SIMPLE_JWT` block):

```python
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = env("RAZORPAY_WEBHOOK_SECRET")
```

Run: `cd backend && python manage.py startapp orders` — then delete the auto-generated `orders/views.py` and `orders/tests.py` (this task creates `orders/tests/` as a package instead; `views.py` is created fresh in Task 2) and delete the auto-generated `orders/migrations/` directory's contents (Step 4 regenerates it properly once models exist).

`backend/orders/apps.py`:

```python
from django.apps import AppConfig


class OrdersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "orders"
```

`backend/orders/models.py`:

```python
from django.conf import settings
from django.db import models

from accounts.models import Address
from catalog.models import Product


class Order(models.Model):
    STATUS_CHOICES = [
        ("placed", "Placed"),
        ("packed", "Packed"),
        ("transported", "Transported"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="orders")
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="placed")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    razorpay_order_id = models.CharField(max_length=100)
    razorpay_payment_id = models.CharField(max_length=100, blank=True)

    # Tracking — admin fills in ONE of these two groups when moving to "transported" (Sub-plan 4)
    porter_name = models.CharField(max_length=100, blank=True)
    porter_phone = models.CharField(max_length=20, blank=True)
    courier_name = models.CharField(max_length=100, blank=True)
    courier_tracking_number = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"Order #{self.id} ({self.user})"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, null=True, on_delete=models.SET_NULL)
    product_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.quantity} x {self.product_name}"


class CheckoutSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    razorpay_order_id = models.CharField(max_length=100, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    items_snapshot = models.JSONField()
    order = models.OneToOneField(Order, null=True, blank=True, on_delete=models.SET_NULL, related_name="checkout_session")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Checkout session for {self.user} ({self.razorpay_order_id})"
```

`backend/orders/admin.py`:

```python
from django.contrib import admin

from .models import CheckoutSession, Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "status", "total_amount", "created_at"]
    list_filter = ["status"]
    search_fields = ["user__username", "razorpay_order_id", "razorpay_payment_id"]
    inlines = [OrderItemInline]


@admin.register(CheckoutSession)
class CheckoutSessionAdmin(admin.ModelAdmin):
    list_display = ["user", "razorpay_order_id", "amount", "order", "created_at"]
    search_fields = ["user__username", "razorpay_order_id"]
```

In `backend/accounts/views.py`, add the `ProtectedError` import at the top:

```python
from django.db.models import ProtectedError
```

And add this method inside `AddressViewSet` (anywhere in the class body; after `perform_update` reads naturally):

```python
    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "This address is used in a past order and can't be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
```

- [ ] **Step 4: Generate the migration and run the tests**

Run: `cd backend && python manage.py makemigrations orders`
Expected: `Migrations for 'orders': orders/migrations/0001_initial.py ... - Create model Order ... - Create model OrderItem ... - Create model CheckoutSession`

Run: `cd backend && python manage.py migrate orders`
Expected: `Applying orders.0001_initial... OK`

Run: `cd backend && python manage.py test orders accounts.tests.test_addresses -v 2`
Expected: `OK` (6 new `orders` tests + 8 `accounts.tests.test_addresses` tests, including the 1 new one)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full suite passes (109 baseline + 7 new).

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/.env.example backend/config/settings/base.py backend/accounts/views.py backend/accounts/tests/test_addresses.py backend/orders
git commit -m "feat(orders): add Order/OrderItem/CheckoutSession models and Razorpay setup"
```

---

## Task 2: `POST /api/v1/checkout/`

**Files:**
- Create: `backend/orders/razorpay_client.py`
- Create: `backend/orders/views.py`
- Create: `backend/orders/urls.py`
- Create: `backend/orders/tests/test_views.py`
- Modify: `backend/config/urls.py` (mount `orders.urls`)

**Interfaces:**
- Consumes: `orders.models.CheckoutSession` (Task 1), `cart.models.Cart`/`CartItem` (Sub-plan 2), `accounts.models.Address` (Sub-plan 1).
- Produces: `orders.razorpay_client.get_razorpay_client()` (consumed by Task 3 too); `POST /api/v1/checkout/` → 201 `{razorpay_order_id, razorpay_key_id, amount, currency}`; 400 with `{"address": "..."}` or `{"cart": "..."}` on validation failures.

- [ ] **Step 1: Write the failing tests**

`backend/orders/razorpay_client.py`:

```python
import razorpay
from django.conf import settings


def get_razorpay_client():
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
```

Create `backend/orders/tests/test_views.py`:

```python
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Category, Product
from orders.models import CheckoutSession

User = get_user_model()


class CheckoutViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.address = Address.objects.create(
            user=self.user, full_name="A", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5,
        )
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)

    def test_requires_authentication(self):
        response = self.client.post("/api/v1/checkout/", {"address": self.address.id})
        self.assertEqual(response.status_code, 401)

    @patch("orders.views.get_razorpay_client")
    def test_creates_razorpay_order_and_checkout_session(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.order.create.return_value = {"id": "order_test123", "amount": 20000, "currency": "INR"}
        mock_get_client.return_value = mock_client

        response = self.client.post("/api/v1/checkout/", {"address": self.address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["razorpay_order_id"], "order_test123")
        self.assertEqual(data["amount"], "200.00")
        self.assertEqual(data["currency"], "INR")
        self.assertIn("razorpay_key_id", data)

        session = CheckoutSession.objects.get(razorpay_order_id="order_test123")
        self.assertEqual(session.user, self.user)
        self.assertEqual(session.address, self.address)
        self.assertEqual(str(session.amount), "200.00")
        self.assertEqual(len(session.items_snapshot), 1)
        self.assertEqual(session.items_snapshot[0]["quantity"], 2)
        mock_client.order.create.assert_called_once_with({"amount": 20000, "currency": "INR", "payment_capture": 1})

    @patch("orders.views.get_razorpay_client")
    def test_rejects_empty_cart(self, mock_get_client):
        CartItem.objects.filter(cart=self.cart).delete()

        response = self.client.post("/api/v1/checkout/", {"address": self.address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 400)
        self.assertIn("cart", response.json())
        mock_get_client.assert_not_called()

    @patch("orders.views.get_razorpay_client")
    def test_rejects_item_exceeding_current_stock(self, mock_get_client):
        self.product.stock_quantity = 1
        self.product.save()

        response = self.client.post("/api/v1/checkout/", {"address": self.address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 400)
        self.assertIn("cart", response.json())
        mock_get_client.assert_not_called()

    @patch("orders.views.get_razorpay_client")
    def test_rejects_invalid_address(self, mock_get_client):
        other = User.objects.create_user(username="b@example.com", password="pw12345678")
        their_address = Address.objects.create(
            user=other, full_name="B", phone="1", line1="x", city="c", state="s", pincode="500002",
        )

        response = self.client.post("/api/v1/checkout/", {"address": their_address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 400)
        self.assertIn("address", response.json())
        mock_get_client.assert_not_called()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test orders.tests.test_views -v 2`
Expected: 404s — no `/api/v1/checkout/` route exists yet.

- [ ] **Step 3: Implement**

`backend/orders/views.py`:

```python
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart

from .models import CheckoutSession
from .razorpay_client import get_razorpay_client


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        address_id = request.data.get("address")
        address = Address.objects.filter(pk=address_id, user=request.user).first()
        if not address:
            raise serializers.ValidationError({"address": "Please select a valid delivery address."})

        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product").first()
        items = list(cart.items.all()) if cart else []
        if not items:
            raise serializers.ValidationError({"cart": "Your cart is empty."})

        for item in items:
            if item.quantity > item.product.stock_quantity:
                raise serializers.ValidationError(
                    {"cart": f"{item.product.name} only has {item.product.stock_quantity} left in stock."}
                )

        total = sum((item.product.price * item.quantity for item in items), start=Decimal("0"))
        snapshot = [
            {
                "product_id": item.product.id,
                "name": item.product.name,
                "unit_price": str(item.product.price),
                "quantity": item.quantity,
            }
            for item in items
        ]

        client = get_razorpay_client()
        razorpay_order = client.order.create({
            "amount": int(total * 100),
            "currency": "INR",
            "payment_capture": 1,
        })

        CheckoutSession.objects.create(
            user=request.user,
            address=address,
            razorpay_order_id=razorpay_order["id"],
            amount=total,
            items_snapshot=snapshot,
        )

        return Response(
            {
                "razorpay_order_id": razorpay_order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
                "amount": f"{total:.2f}",
                "currency": "INR",
            },
            status=status.HTTP_201_CREATED,
        )
```

`backend/orders/urls.py`:

```python
from django.urls import path

from .views import CheckoutView

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
]
```

In `backend/config/urls.py`, add `path("api/v1/", include("orders.urls"))` after the `cart.urls` include:

```python
    path("api/v1/", include("catalog.urls")),
    path("api/v1/", include("inquiries.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("cart.urls")),
    path("api/v1/", include("orders.urls")),
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test orders -v 2`
Expected: `OK` (11 tests pass — 6 from Task 1 + 5 new)

- [ ] **Step 5: Commit**

```bash
git add backend/orders/razorpay_client.py backend/orders/views.py backend/orders/urls.py backend/orders/tests/test_views.py backend/config/urls.py
git commit -m "feat(orders): add POST /api/v1/checkout/ to create a Razorpay order"
```

---

## Task 3: `POST /api/v1/payments/webhook/`

**Files:**
- Modify: `backend/orders/views.py` (add `RazorpayWebhookView`)
- Modify: `backend/orders/urls.py` (add the `payments/webhook/` route)
- Modify: `backend/orders/tests/test_views.py` (add `RazorpayWebhookViewTests`)

**Interfaces:**
- Consumes: `orders.models.CheckoutSession`/`Order`/`OrderItem` (Task 1), `orders.razorpay_client.get_razorpay_client` (Task 2), `catalog.models.Product`, `cart.models.CartItem`.
- Produces: `POST /api/v1/payments/webhook/` → 200 for any recognized or unrecognized event once the signature is valid (including duplicate deliveries and unknown order IDs, which Razorpay's retry semantics require to look like success so it stops retrying); 400 only for an invalid/missing signature.

- [ ] **Step 1: Write the failing tests**

Append to `backend/orders/tests/test_views.py` (add these imports at the top alongside the existing ones):

```python
import hashlib
import hmac
import json

from django.conf import settings

from orders.models import Order, OrderItem
```

(`Cart`, `CartItem`, and `CheckoutSession` are already imported at the top of this file from Task 2 — only `Order` and `OrderItem` are new.)

```python
class RazorpayWebhookViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="A", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5,
        )
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)
        self.session = CheckoutSession.objects.create(
            user=self.user,
            address=self.address,
            razorpay_order_id="order_webhook_test",
            amount="200.00",
            items_snapshot=[
                {"product_id": self.product.id, "name": "Tank", "unit_price": "100.00", "quantity": 2},
            ],
        )

    def _post_webhook(self, event="payment.captured", order_id="order_webhook_test", payment_id="pay_test1", signature=None):
        payload = {
            "event": event,
            "payload": {
                "payment": {"entity": {"id": payment_id, "order_id": order_id, "amount": 20000, "status": "captured"}}
            },
        }
        body = json.dumps(payload).encode()
        if signature is None:
            signature = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        return self.client.post(
            "/api/v1/payments/webhook/", data=body, content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
        )

    def test_rejects_invalid_signature(self):
        response = self._post_webhook(signature="not-a-real-signature")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_ignores_non_captured_events(self):
        response = self._post_webhook(event="payment.failed")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Order.objects.exists())

    def test_ignores_unknown_razorpay_order_id(self):
        response = self._post_webhook(order_id="order_never_created")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Order.objects.exists())

    def test_creates_order_and_decrements_stock_on_captured_payment(self):
        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(razorpay_order_id="order_webhook_test")
        self.assertEqual(order.user, self.user)
        self.assertEqual(order.address, self.address)
        self.assertEqual(str(order.total_amount), "200.00")
        self.assertEqual(order.razorpay_payment_id, "pay_test1")

        items = list(OrderItem.objects.filter(order=order))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].product_name, "Tank")
        self.assertEqual(items[0].quantity, 2)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())

        self.session.refresh_from_db()
        self.assertEqual(self.session.order, order)

    def test_duplicate_webhook_delivery_is_idempotent(self):
        self._post_webhook()
        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Order.objects.filter(razorpay_order_id="order_webhook_test").count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

    def test_clamps_stock_at_zero_when_oversold(self):
        self.product.stock_quantity = 1
        self.product.save()

        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Order.objects.filter(razorpay_order_id="order_webhook_test").exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 0)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test orders.tests.test_views.RazorpayWebhookViewTests -v 2`
Expected: 404s — no `/api/v1/payments/webhook/` route exists yet.

- [ ] **Step 3: Implement**

Replace `backend/orders/views.py` with the complete file (adds `RazorpayWebhookView` below the existing `CheckoutView`):

```python
import json
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Product
from razorpay.errors import SignatureVerificationError

from .models import CheckoutSession, Order, OrderItem
from .razorpay_client import get_razorpay_client


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        address_id = request.data.get("address")
        address = Address.objects.filter(pk=address_id, user=request.user).first()
        if not address:
            raise serializers.ValidationError({"address": "Please select a valid delivery address."})

        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product").first()
        items = list(cart.items.all()) if cart else []
        if not items:
            raise serializers.ValidationError({"cart": "Your cart is empty."})

        for item in items:
            if item.quantity > item.product.stock_quantity:
                raise serializers.ValidationError(
                    {"cart": f"{item.product.name} only has {item.product.stock_quantity} left in stock."}
                )

        total = sum((item.product.price * item.quantity for item in items), start=Decimal("0"))
        snapshot = [
            {
                "product_id": item.product.id,
                "name": item.product.name,
                "unit_price": str(item.product.price),
                "quantity": item.quantity,
            }
            for item in items
        ]

        client = get_razorpay_client()
        razorpay_order = client.order.create({
            "amount": int(total * 100),
            "currency": "INR",
            "payment_capture": 1,
        })

        CheckoutSession.objects.create(
            user=request.user,
            address=address,
            razorpay_order_id=razorpay_order["id"],
            amount=total,
            items_snapshot=snapshot,
        )

        return Response(
            {
                "razorpay_order_id": razorpay_order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
                "amount": f"{total:.2f}",
                "currency": "INR",
            },
            status=status.HTTP_201_CREATED,
        )


class RazorpayWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        signature = request.headers.get("X-Razorpay-Signature", "")
        client = get_razorpay_client()
        try:
            client.utility.verify_webhook_signature(
                request.body.decode("utf-8"), signature, settings.RAZORPAY_WEBHOOK_SECRET
            )
        except SignatureVerificationError:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        payload = json.loads(request.body)
        if payload.get("event") != "payment.captured":
            return Response(status=status.HTTP_200_OK)

        payment_entity = payload["payload"]["payment"]["entity"]
        razorpay_order_id = payment_entity["order_id"]
        razorpay_payment_id = payment_entity["id"]

        with transaction.atomic():
            session = (
                CheckoutSession.objects.select_for_update()
                .filter(razorpay_order_id=razorpay_order_id)
                .first()
            )
            if not session or session.order_id:
                return Response(status=status.HTTP_200_OK)

            order = Order.objects.create(
                user=session.user,
                address=session.address,
                total_amount=session.amount,
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
            )

            product_ids = [item["product_id"] for item in session.items_snapshot if item["product_id"]]
            locked_products = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            for item in session.items_snapshot:
                product = locked_products.get(item["product_id"])
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=item["name"],
                    unit_price=item["unit_price"],
                    quantity=item["quantity"],
                )
                if product:
                    product.stock_quantity = max(0, product.stock_quantity - item["quantity"])
                    product.save()

            session.order = order
            session.save()

            CartItem.objects.filter(cart__user=session.user).delete()

        return Response(status=status.HTTP_200_OK)
```

`backend/orders/urls.py`:

```python
from django.urls import path

from .views import CheckoutView, RazorpayWebhookView

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
]
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test orders -v 2`
Expected: `OK` (17 tests pass — 11 from Task 2 + 6 new)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full backend suite passes.

- [ ] **Step 5: Commit**

```bash
git add backend/orders/views.py backend/orders/urls.py backend/orders/tests/test_views.py
git commit -m "feat(orders): add the Razorpay payment webhook to create orders and decrement stock"
```

---

## Task 4: `GET /api/v1/orders/by-razorpay-order/<razorpay_order_id>/`

**Files:**
- Create: `backend/orders/serializers.py`
- Modify: `backend/orders/views.py` (add `OrderByRazorpayOrderView`)
- Modify: `backend/orders/urls.py` (add the lookup route)
- Modify: `backend/orders/tests/test_views.py` (add `OrderByRazorpayOrderViewTests`)

**Interfaces:**
- Consumes: `orders.models.Order`/`OrderItem` (Task 1).
- Produces: `orders.serializers.OrderSerializer`/`OrderItemSerializer` (consumed by Sub-plan 4); `GET /api/v1/orders/by-razorpay-order/<id>/` → 200 `{id, status, total_amount, razorpay_order_id, created_at, items: [{id, product, product_name, unit_price, quantity}, ...]}`, or 404 if the order doesn't exist yet or belongs to another user.

- [ ] **Step 1: Write the failing tests**

`backend/orders/serializers.py`:

```python
from rest_framework import serializers

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "unit_price", "quantity"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ["id", "status", "total_amount", "razorpay_order_id", "created_at", "items"]
```

Append to `backend/orders/tests/test_views.py`:

```python
class OrderByRazorpayOrderViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.address = Address.objects.create(
            user=self.user, full_name="A", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5,
        )
        self.order = Order.objects.create(
            user=self.user, address=self.address, total_amount="200.00", razorpay_order_id="order_lookup_test",
        )
        OrderItem.objects.create(
            order=self.order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )

    def test_requires_authentication(self):
        response = self.client.get("/api/v1/orders/by-razorpay-order/order_lookup_test/")
        self.assertEqual(response.status_code, 401)

    def test_returns_order_and_items(self):
        response = self.client.get(
            "/api/v1/orders/by-razorpay-order/order_lookup_test/", **self.auth_header
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], self.order.id)
        self.assertEqual(data["status"], "placed")
        self.assertEqual(data["total_amount"], "200.00")
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["product_name"], "Tank")

    def test_returns_404_before_the_order_exists(self):
        response = self.client.get(
            "/api/v1/orders/by-razorpay-order/order_not_created_yet/", **self.auth_header
        )
        self.assertEqual(response.status_code, 404)

    def test_returns_404_for_another_users_order(self):
        login = self.client.post("/api/v1/auth/login/", {"username": "b@example.com", "password": "pw12345678"})
        other_auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}

        response = self.client.get(
            "/api/v1/orders/by-razorpay-order/order_lookup_test/", **other_auth_header
        )
        self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test orders.tests.test_views.OrderByRazorpayOrderViewTests -v 2`
Expected: 404s for the wrong reason (no route exists at all yet, rather than the view's own not-found logic) — this becomes clear once Step 4 passes with the right assertions.

- [ ] **Step 3: Implement**

Replace `backend/orders/views.py` with the complete file (adds `OrderByRazorpayOrderView` below the existing `CheckoutView` and `RazorpayWebhookView`):

```python
import json
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Product
from razorpay.errors import SignatureVerificationError

from .models import CheckoutSession, Order, OrderItem
from .razorpay_client import get_razorpay_client
from .serializers import OrderSerializer


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        address_id = request.data.get("address")
        address = Address.objects.filter(pk=address_id, user=request.user).first()
        if not address:
            raise serializers.ValidationError({"address": "Please select a valid delivery address."})

        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product").first()
        items = list(cart.items.all()) if cart else []
        if not items:
            raise serializers.ValidationError({"cart": "Your cart is empty."})

        for item in items:
            if item.quantity > item.product.stock_quantity:
                raise serializers.ValidationError(
                    {"cart": f"{item.product.name} only has {item.product.stock_quantity} left in stock."}
                )

        total = sum((item.product.price * item.quantity for item in items), start=Decimal("0"))
        snapshot = [
            {
                "product_id": item.product.id,
                "name": item.product.name,
                "unit_price": str(item.product.price),
                "quantity": item.quantity,
            }
            for item in items
        ]

        client = get_razorpay_client()
        razorpay_order = client.order.create({
            "amount": int(total * 100),
            "currency": "INR",
            "payment_capture": 1,
        })

        CheckoutSession.objects.create(
            user=request.user,
            address=address,
            razorpay_order_id=razorpay_order["id"],
            amount=total,
            items_snapshot=snapshot,
        )

        return Response(
            {
                "razorpay_order_id": razorpay_order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
                "amount": f"{total:.2f}",
                "currency": "INR",
            },
            status=status.HTTP_201_CREATED,
        )


class RazorpayWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        signature = request.headers.get("X-Razorpay-Signature", "")
        client = get_razorpay_client()
        try:
            client.utility.verify_webhook_signature(
                request.body.decode("utf-8"), signature, settings.RAZORPAY_WEBHOOK_SECRET
            )
        except SignatureVerificationError:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        payload = json.loads(request.body)
        if payload.get("event") != "payment.captured":
            return Response(status=status.HTTP_200_OK)

        payment_entity = payload["payload"]["payment"]["entity"]
        razorpay_order_id = payment_entity["order_id"]
        razorpay_payment_id = payment_entity["id"]

        with transaction.atomic():
            session = (
                CheckoutSession.objects.select_for_update()
                .filter(razorpay_order_id=razorpay_order_id)
                .first()
            )
            if not session or session.order_id:
                return Response(status=status.HTTP_200_OK)

            order = Order.objects.create(
                user=session.user,
                address=session.address,
                total_amount=session.amount,
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
            )

            product_ids = [item["product_id"] for item in session.items_snapshot if item["product_id"]]
            locked_products = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            for item in session.items_snapshot:
                product = locked_products.get(item["product_id"])
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=item["name"],
                    unit_price=item["unit_price"],
                    quantity=item["quantity"],
                )
                if product:
                    product.stock_quantity = max(0, product.stock_quantity - item["quantity"])
                    product.save()

            session.order = order
            session.save()

            CartItem.objects.filter(cart__user=session.user).delete()

        return Response(status=status.HTTP_200_OK)


class OrderByRazorpayOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, razorpay_order_id):
        order = (
            Order.objects.filter(razorpay_order_id=razorpay_order_id, user=request.user)
            .prefetch_related("items")
            .first()
        )
        if not order:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order).data)
```

`backend/orders/urls.py`:

```python
from django.urls import path

from .views import CheckoutView, OrderByRazorpayOrderView, RazorpayWebhookView

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path(
        "orders/by-razorpay-order/<str:razorpay_order_id>/",
        OrderByRazorpayOrderView.as_view(),
        name="order-by-razorpay-order",
    ),
]
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test orders -v 2`
Expected: `OK` (21 tests pass — 17 from Task 3 + 4 new)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full backend suite passes.

- [ ] **Step 5: Commit**

```bash
git add backend/orders/serializers.py backend/orders/views.py backend/orders/urls.py backend/orders/tests/test_views.py
git commit -m "feat(orders): add GET /api/v1/orders/by-razorpay-order/<id>/ for confirmation polling"
```

---

## Task 5: `Checkout.jsx` page + Cart's "Proceed to Checkout" button + `/checkout` route

**Files:**
- Create: `frontend/src/pages/public/Checkout.jsx`
- Create: `frontend/src/pages/public/Checkout.test.jsx`
- Modify: `frontend/src/pages/public/Cart.jsx` (add the "Proceed to Checkout" button)
- Modify: `frontend/src/App.jsx` (add the guarded `/checkout` route)

**Interfaces:**
- Consumes: `useCart()` (Sub-plan 2), `customerApiClient` (Sub-plan 1), `describeError` (existing), Razorpay's hosted `Checkout.js` (loaded at runtime, not a dependency).
- Produces: nothing new consumed by later tasks in this sub-plan (Task 6's `OrderConfirmation` is reached via `navigate()`, not an import).

- [ ] **Step 1: Add the "Proceed to Checkout" button to `Cart.jsx`**

Read the current `frontend/src/pages/public/Cart.jsx` in full first. Replace its final block — the `<div className="flex justify-end items-center gap-4 border-t pt-4">...</div>` immediately before the closing `</div>\n  );\n}` — with:

```jsx
      <div className="flex justify-between items-center gap-4 border-t pt-4">
        <span className="text-lg font-semibold text-brand-dark">Subtotal: ₹{cart.subtotal}</span>
        <Link
          to="/checkout"
          className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded-lg px-6 py-2.5 font-medium transition-colors"
        >
          Proceed to Checkout
        </Link>
      </div>
```

(`Link` is already imported at the top of `Cart.jsx` from `react-router-dom` — no new import needed. `justify-end` becomes `justify-between` so the button sits opposite the subtotal instead of stacking after it.)

- [ ] **Step 2: Write the failing tests**

`frontend/src/pages/public/Checkout.test.jsx`:

```jsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../../api/customerClient";
import Checkout from "./Checkout";

vi.mock("../../api/customerClient", () => ({
  customerApiClient: { get: vi.fn(), post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockCart;
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ cart: mockCart }),
}));

const ADDRESSES = [
  {
    id: 1, full_name: "Home", phone: "1234567890", line1: "1 Rd", line2: "",
    city: "City", state: "State", pincode: "500001", is_default: true,
  },
];

function renderCheckout() {
  return render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>
  );
}

describe("Checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCart = {
      items: [{ id: 1, product_name: "Tank", quantity: 2, line_total: "200.00" }],
      subtotal: "200.00",
    };
    delete window.Razorpay;
  });

  it("shows an empty-cart message when the cart has no items", () => {
    mockCart = { items: [], subtotal: "0.00" };
    customerApiClient.get.mockResolvedValueOnce({ data: { results: [] } });

    renderCheckout();

    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
  });

  it("loads and pre-selects the default address", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });

    renderCheckout();

    const radio = await screen.findByRole("radio");
    expect(radio).toBeChecked();
  });

  it("Pay Now posts to /checkout/ and opens Razorpay with the returned order details", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    customerApiClient.post.mockResolvedValueOnce({
      data: { razorpay_order_id: "order_test1", razorpay_key_id: "rzp_test_key", amount: "200.00", currency: "INR" },
    });
    const mockOpen = vi.fn();
    window.Razorpay = vi.fn(() => ({ open: mockOpen }));

    renderCheckout();
    await screen.findByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    await waitFor(() => expect(customerApiClient.post).toHaveBeenCalledWith("/checkout/", { address: 1 }));
    await waitFor(() =>
      expect(window.Razorpay).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: "order_test1", key: "rzp_test_key", amount: 20000 })
      )
    );
    expect(mockOpen).toHaveBeenCalled();
  });

  it("navigates to the order-confirmation page when Razorpay's handler fires", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    customerApiClient.post.mockResolvedValueOnce({
      data: { razorpay_order_id: "order_test2", razorpay_key_id: "rzp_test_key", amount: "200.00", currency: "INR" },
    });
    let capturedOptions;
    window.Razorpay = vi.fn((options) => {
      capturedOptions = options;
      return { open: vi.fn() };
    });

    renderCheckout();
    await screen.findByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalled());

    capturedOptions.handler();

    expect(mockNavigate).toHaveBeenCalledWith("/order-confirmation/order_test2");
  });

  it("shows an error message if the checkout request fails", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: { results: ADDRESSES } });
    customerApiClient.post.mockRejectedValueOnce({ response: { data: { cart: "Your cart is empty." } } });

    renderCheckout();
    await screen.findByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    expect(await screen.findByText("Your cart is empty.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/public/Checkout.test.jsx`
Expected: FAIL — `Failed to resolve import "./Checkout"` (file doesn't exist yet).

- [ ] **Step 4: Implement**

`frontend/src/pages/public/Checkout.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { customerApiClient } from "../../api/customerClient";
import { describeError } from "../../api/describeError";
import { useCart } from "../../context/CartContext";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Checkout() {
  const { cart } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [addressesError, setAddressesError] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | paying | error
  const [error, setError] = useState("");

  useEffect(() => {
    customerApiClient
      .get("/addresses/")
      .then((response) => {
        const results = response.data.results;
        setAddresses(results);
        const defaultAddress = results.find((address) => address.is_default) || results[0];
        if (defaultAddress) setSelectedAddressId(defaultAddress.id);
      })
      .catch(() => setAddressesError(true));
  }, []);

  const handlePayNow = async () => {
    setStatus("paying");
    setError("");
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError("Couldn't load the payment window — please check your connection and try again.");
        setStatus("error");
        return;
      }

      const response = await customerApiClient.post("/checkout/", { address: selectedAddressId });
      const { razorpay_order_id, razorpay_key_id, amount } = response.data;

      const razorpay = new window.Razorpay({
        key: razorpay_key_id,
        amount: Math.round(Number(amount) * 100),
        currency: "INR",
        order_id: razorpay_order_id,
        name: "FNB Aquatic Studio",
        handler: () => {
          navigate(`/order-confirmation/${razorpay_order_id}`);
        },
        modal: {
          ondismiss: () => {
            setStatus("idle");
          },
        },
      });
      razorpay.open();
    } catch (err) {
      setError(describeError(err, "Couldn't start checkout — please try again."));
      setStatus("error");
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-6">Add something to your cart before checking out.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Checkout</h1>

      <section className="mb-8">
        <h2 className="font-medium text-brand-dark mb-3">Delivery address</h2>
        {addressesError && (
          <p className="text-red-600 text-sm mb-2">Couldn't load your addresses — please try again later.</p>
        )}
        {addresses.length === 0 && !addressesError && (
          <p className="text-gray-500 text-sm">
            You don't have any saved addresses yet.{" "}
            <a href="/account/addresses" className="text-brand-forest hover:underline">Add one</a> before checking out.
          </p>
        )}
        <div className="grid gap-2">
          {addresses.map((address) => (
            <label key={address.id} className="border rounded-lg p-3 flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="address"
                checked={selectedAddressId === address.id}
                onChange={() => setSelectedAddressId(address.id)}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium text-brand-dark">{address.full_name}</span> — {address.phone}
                <br />
                {address.line1}{address.line2 && `, ${address.line2}`}, {address.city}, {address.state} {address.pincode}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-medium text-brand-dark mb-3">Order summary</h2>
        <div className="grid gap-2 mb-3">
          {cart.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>₹{item.line_total}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-semibold text-brand-dark border-t pt-3">
          <span>Total</span>
          <span>₹{cart.subtotal}</span>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <button
        type="button"
        onClick={handlePayNow}
        disabled={status === "paying" || !selectedAddressId}
        className="w-full bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded-lg px-4 py-3 font-medium transition-colors"
      >
        {status === "paying" ? "Opening payment window..." : "Pay Now"}
      </button>
    </div>
  );
}
```

In `frontend/src/App.jsx`, add the `Checkout` import (alphabetically, between `CategoryProducts` and `Contact`):

```jsx
import Checkout from "./pages/public/Checkout";
```

And add the guarded route, immediately after the existing `/cart` route block and before `/admin`:

```jsx
          <Route path="/checkout" element={<CustomerGuard />}>
            <Route index element={<Checkout />} />
          </Route>
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/pages/public/Checkout.test.jsx`
Expected: PASS (5 tests)

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite (26 baseline + 5 new).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/public/Checkout.jsx frontend/src/pages/public/Checkout.test.jsx frontend/src/pages/public/Cart.jsx frontend/src/App.jsx
git commit -m "feat(checkout): add the Checkout page, Razorpay popup, and Proceed to Checkout button"
```

---

## Task 6: `OrderConfirmation.jsx` page + `/order-confirmation/:razorpayOrderId` route

**Files:**
- Create: `frontend/src/pages/public/OrderConfirmation.jsx`
- Create: `frontend/src/pages/public/OrderConfirmation.test.jsx`
- Modify: `frontend/src/App.jsx` (add the guarded `/order-confirmation/:razorpayOrderId` route)

**Interfaces:**
- Consumes: `customerApiClient` (Sub-plan 1), `useCart()` (Sub-plan 2, only `refresh()`).
- Produces: nothing consumed elsewhere in this sub-plan — this is the end of the checkout flow.

- [ ] **Step 1: Write the failing tests**

`frontend/src/pages/public/OrderConfirmation.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../../api/customerClient";
import OrderConfirmation from "./OrderConfirmation";

vi.mock("../../api/customerClient", () => ({
  customerApiClient: { get: vi.fn() },
}));

const mockRefreshCart = vi.fn();
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ refresh: mockRefreshCart }),
}));

function renderConfirmation(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/order-confirmation/order_test1"]}>
      <Routes>
        <Route path="/order-confirmation/:razorpayOrderId" element={<OrderConfirmation {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OrderConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a confirming state while polling", () => {
    customerApiClient.get.mockReturnValue(new Promise(() => {})); // never resolves

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 100 });

    expect(screen.getByText("Confirming your payment…")).toBeInTheDocument();
  });

  it("shows the order summary once the order appears", async () => {
    customerApiClient.get.mockResolvedValueOnce({
      data: { id: 42, total_amount: "200.00", status: "placed", items: [] },
    });

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 100 });

    expect(await screen.findByText(/Thank you for your order/i)).toBeInTheDocument();
    expect(screen.getByText("Order #42 — ₹200.00")).toBeInTheDocument();
    expect(mockRefreshCart).toHaveBeenCalled();
  });

  it("retries after a 404 and eventually shows the order", async () => {
    customerApiClient.get
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: { id: 7, total_amount: "50.00", status: "placed", items: [] } });

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 200 });

    expect(await screen.findByText(/Thank you for your order/i)).toBeInTheDocument();
  });

  it("shows the reassuring fallback message after the poll times out", async () => {
    customerApiClient.get.mockRejectedValue({ response: { status: 404 } });

    renderConfirmation({ pollIntervalMs: 10, pollTimeoutMs: 30 });

    expect(await screen.findByText("Payment received")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/public/OrderConfirmation.test.jsx`
Expected: FAIL — `Failed to resolve import "./OrderConfirmation"` (file doesn't exist yet).

- [ ] **Step 3: Implement**

`frontend/src/pages/public/OrderConfirmation.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { customerApiClient } from "../../api/customerClient";
import { useCart } from "../../context/CartContext";

export default function OrderConfirmation({ pollIntervalMs = 1500, pollTimeoutMs = 15000 }) {
  const { razorpayOrderId } = useParams();
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const poll = () => {
      customerApiClient
        .get(`/orders/by-razorpay-order/${razorpayOrderId}/`)
        .then((response) => {
          if (cancelled) return;
          setOrder(response.data);
          refreshCart();
        })
        .catch(() => {
          if (cancelled) return;
          if (Date.now() - startedAt >= pollTimeoutMs) {
            setTimedOut(true);
            return;
          }
          setTimeout(poll, pollIntervalMs);
        });
    };

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [razorpayOrderId]);

  if (order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Thank you for your order!</h1>
        <p className="text-gray-600 mb-6">Order #{order.id} — ₹{order.total_amount}</p>
        <Link to="/products" className="text-brand-forest hover:underline">Continue shopping</Link>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Payment received</h1>
        <p className="text-gray-600">
          Your order will appear in My Orders shortly; contact us if it doesn't within a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-gray-600">Confirming your payment…</p>
    </div>
  );
}
```

In `frontend/src/App.jsx`, add the `OrderConfirmation` import (alphabetically, between `NotFound` and `Portfolio`):

```jsx
import OrderConfirmation from "./pages/public/OrderConfirmation";
```

And add the guarded route, immediately after the `/checkout` route block Task 5 added and before `/admin`:

```jsx
          <Route path="/order-confirmation/:razorpayOrderId" element={<CustomerGuard />}>
            <Route index element={<OrderConfirmation />} />
          </Route>
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/public/OrderConfirmation.test.jsx`
Expected: PASS (4 tests)

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite (31 baseline + 4 new).

Run: `cd backend && python manage.py test`
Expected: `OK` — full backend suite passes (no backend changes in this task, but this is the last task in the plan; confirm nothing drifted).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/public/OrderConfirmation.jsx frontend/src/pages/public/OrderConfirmation.test.jsx frontend/src/App.jsx
git commit -m "feat(checkout): add the order-confirmation page that polls for the webhook-created order"
```

---

## Plan-level verification

After all 6 tasks:

Run: `cd backend && python manage.py test` — full backend suite passes (accounts + cart + catalog + core + inquiries + orders).

Run: `cd frontend && npx vitest run` — full frontend suite passes.

Manual end-to-end pass (requires real Razorpay test-mode keys in `backend/.env`, supplied by the client — not required for the automated tests above): as a logged-in customer, add a product to the cart, go to `/cart`, click "Proceed to Checkout", select an address, click "Pay Now", complete a test payment in Razorpay's popup using their published test card/UPI credentials, confirm the popup closes and the confirmation page shows "Confirming your payment…" then the order summary within a few seconds; confirm the cart is now empty and the header badge reflects it; confirm the product's stock quantity dropped by the purchased amount in the admin; dismiss a checkout popup without paying and confirm no order was created and stock is unchanged.
