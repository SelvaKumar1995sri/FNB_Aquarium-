# Phase 2 Sub-Plan 4: Order Management & Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff see and manage all orders — filtering by status, viewing full detail, moving an order through its fulfillment lifecycle, and recording tracking information — while letting a logged-in customer see their own order history and the status/tracking of each order.

**Architecture:** Two new read surfaces reuse the `orders.models.Order`/`OrderItem` models Sub-plan 3 already created (an `Order` is created only by the payment webhook; this sub-plan never creates one). A customer-scoped `OrderViewSet` (`GET /api/v1/orders/`, `GET /api/v1/orders/<id>/`) filters to `request.user`. A staff-only `AdminOrderViewSet` (`GET /api/v1/admin/orders/`, `GET /api/v1/admin/orders/<id>/`, `PATCH /api/v1/admin/orders/<id>/`) sees every order and is the only place an order's `status`/tracking fields are ever written, gated by an explicit state-machine validator matching the exact linear sequence the SRS specifies. The shared `OrderSerializer` (extended from Sub-plan 3) grows an embedded delivery address and customer name/email so both surfaces can read everything they need from one representation; a separate write-only `AdminOrderStatusUpdateSerializer` owns the PATCH validation only. On the frontend: `OrderHistory.jsx`/`OrderDetail.jsx` (customer, under `/account`) and `OrdersManager.jsx`/`OrderDetailManager.jsx` (staff, under `/admin`) follow this codebase's existing account-page and manager-page patterns respectively.

**Tech Stack:** Django 5 + DRF (backend, already installed). React 19 + React Router 7 + axios + Tailwind v4 (frontend, already installed). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md` (§5 orders/admin-orders API rows, §6 step 7, §7 Admin flow's Orders list/detail — excluding the notification bell, which is Sub-plan 5 — §9 OrdersManager/OrderDetail/OrderHistory frontend structure); SRS FR-13 through FR-19.

## Global Constraints

- `Order`/`OrderItem` rows are never created or deleted by this sub-plan — they exist only via the payment webhook (Sub-plan 3). Every view this plan adds is read (list/detail) or a narrow status/tracking update; nothing here constructs a new `Order`.
- Staff order endpoints (`/api/v1/admin/orders/...`) are staff-only for every method, including `GET` — unlike `catalog`'s `IsStaffOrReadOnly` (which allows public reads), no one but staff may see the admin orders surface at all (FR-13, FR-14). Use DRF's built-in `IsAdminUser`, matching the existing pattern already used by `ProductImageViewSet` and `InquiryViewSet`'s non-create actions — no new permission class needed.
- Customer order endpoints (`/api/v1/orders/...`) require login and are scoped to `request.user` — a customer can never see another customer's order. Requesting another user's order by ID returns 404 (not 403), matching the ownership-scoping convention already established for cart items in Sub-plan 2 (no leaking existence via a different status code).
- Status transitions follow exactly the SRS's stated sequence: `placed → packed → transported → delivered`, with `cancelled` reachable only from `placed` or `packed` (FR-15). No skipping a step, no moving backward, no transitioning out of `delivered` or `cancelled` (both terminal). Enforced server-side in `AdminOrderStatusUpdateSerializer`, not just in the UI.
- Moving an order to `transported` requires **exactly one** of: both `porter_name` and `porter_phone`, or both `courier_name` and `courier_tracking_number` — not both groups, not neither, not a partial group (FR-17, spec §7's literal wording). Enforced server-side; the frontend also structures its form so a partial submission is hard to construct, but the server-side check is authoritative.
- Once an order reaches `transported` or later, its tracking details are visible to the customer on their own order detail page (FR-18). Before that, the tracking fields are simply blank and the customer's page shows nothing extra.
- FR-19 (no live courier tracking integration) needs no task — it is a scope boundary confirming this plan doesn't call any courier API, not something to build.
- Existing Sub-plan 1-3 code and the `product-stock-merge` feature (accounts, cart, checkout, catalog, `CustomerAuthContext`, `CartContext`, `orders.views.CheckoutView`/`RazorpayWebhookView`/`OrderByRazorpayOrderView`) are untouched except the additive changes this plan documents. `orders/views.py`, `orders/serializers.py`, and `orders/urls.py` are modified via full-file replacements that preserve every existing class/route — read the current file before each task that touches it, since these files already carry Sub-plan 3's work.
- Responsive on mobile and desktop, using the site's existing Tailwind design tokens (`brand-dark`, `brand-light`, `brand-aqua`, `brand-forest`) — matching `AccountAddresses.jsx`/`ProductsManager.jsx`/`InquiriesManager.jsx`'s established visual language.

## Decisions (resolved before implementation)

- **`OrderSerializer` is extended in place, not split into list/detail variants:** it gains `address` (nested, reusing `accounts.serializers.AddressSerializer` — cross-app import, already an established pattern since `orders` already imports `accounts.models.Address`), `customer_name`/`customer_email` (`source="user.first_name"`/`"user.email"`), `updated_at`, and the four tracking fields. This is purely additive to Sub-plan 3's field list (`id, status, total_amount, razorpay_order_id, created_at, items`), verified against `OrderByRazorpayOrderView`'s existing tests (which check specific keys, never a full-dict equality), so `GET /api/v1/orders/by-razorpay-order/<id>/` (the order-confirmation polling endpoint) keeps working unmodified. One serializer used for every read surface (customer list, customer detail, admin list, admin detail) is simpler than four near-identical serializers, and `PAGE_SIZE=20` pagination already bounds how much a list response carries.
- **`AdminOrderStatusUpdateSerializer` is a separate, write-only serializer** used only by the PATCH action — it validates `status` plus the four tracking fields and nothing else (no `total_amount`, no `address`, no `items` are ever writable through this API). After a successful save, the view re-serializes the same instance with the full `OrderSerializer` and returns that, matching the "return the full resource after mutation" convention already established by cart's and checkout's endpoints.
- **`status` is explicitly required inside `validate()`, not via the field's own `required=True`:** DRF's `partial=True` (used for every `PATCH`) silently treats every field as optional regardless of what `required` says on the field itself — a real gotcha. Checking `"status" not in attrs` inside `validate()` is what actually enforces it.
- **Admin detail page is named `OrderDetailManager.jsx`, not `OrderDetail.jsx`:** every existing admin page in this codebase (`CategoriesManager`, `ProductsManager`, `VideosManager`, `InquiriesManager`) ends in `Manager`, and `frontend/src/pages/public/OrderDetail.jsx` (this plan's customer-facing page) already claims the plain name — both are default exports, and importing two different modules under the identical default local name `OrderDetail` into the same `App.jsx` would either collide or require import aliasing. Naming the admin one `OrderDetailManager.jsx` avoids the collision entirely and matches this codebase's actual naming convention more closely than the spec's generic prose ("OrderDetail (admin view)").
- **"My Orders" is added only to `Header.jsx`'s nav drawer**, not a separate desktop-only element — this codebase's nav drawer (opened by the always-visible hamburger button) is the single navigation surface for both mobile and desktop; "My Account" and "Cart" already live only there, not in the top bar, so "My Orders" follows the same placement.
- **No dedicated test file for `OrderHistory.jsx`, `OrderDetail.jsx` (customer), or `OrdersManager.jsx` (admin list):** each is a straightforward fetch-and-display page with no confirmation dialogs, no multi-step conditional forms, no client-side state machine — matching the established precedent that pages like `AccountAddresses.jsx` and `InquiriesManager.jsx` don't have dedicated test files. `OrderDetailManager.jsx` (the status-transition + tracking-form page) DOES get one, matching the precedent set by `Checkout.jsx` and `ProductsManager.jsx` — genuinely interactive, stateful components in this codebase are tested.
- **No jest-dom, explicit `afterEach(() => cleanup())` for any new test file:** this repo has no `@testing-library/jest-dom` dependency and no RTL auto-cleanup configured (confirmed during Sub-plan 3 and the `product-stock-merge` feature) — use plain assertions (`expect(x).toBeTruthy()`, property checks) instead of jest-dom matchers, and add an explicit `afterEach(() => cleanup())` import from `@testing-library/react` in any file that renders more than once across its `it()` blocks.

## Delivery order

Two backend tasks, then three frontend tasks, each independently testable:

1. `GET /api/v1/orders/` + `GET /api/v1/orders/<id>/` — customer's own order list and detail.
2. `GET /api/v1/admin/orders/` + `GET /api/v1/admin/orders/<id>/` + `PATCH /api/v1/admin/orders/<id>/` — staff order list/detail/status-transition, with the tracking-entry validation.
3. `OrderHistory.jsx` + `OrderDetail.jsx` (customer) + guarded `/account/orders` routes + "My Orders" nav link.
4. `OrdersManager.jsx` (admin list) + guarded `/admin/orders` route + "Orders" admin nav link.
5. `OrderDetailManager.jsx` (admin status-transition + tracking form) + guarded `/admin/orders/:id` route.

---

## Task 1: `GET /api/v1/orders/` + `GET /api/v1/orders/<id>/`

**Files:**
- Modify: `backend/orders/serializers.py` (extend `OrderSerializer`)
- Modify: `backend/orders/views.py` (add `OrderViewSet`)
- Modify: `backend/orders/urls.py` (mount `OrderViewSet` via a router, alongside the existing manual paths)
- Modify: `backend/orders/tests/test_views.py` (add `OrderViewSetTests`)

**Interfaces:**
- Consumes: `orders.models.Order`/`OrderItem` (Sub-plan 3), `accounts.serializers.AddressSerializer` (Sub-plan 1).
- Produces: extended `orders.serializers.OrderSerializer` (consumed by Task 2 and the frontend); `GET /api/v1/orders/` → paginated list of the caller's own orders, newest first; `GET /api/v1/orders/<id>/` → 200 full order detail (404 if it doesn't exist or belongs to another user).

- [ ] **Step 1: Write the failing tests**

Replace `backend/orders/serializers.py` with the complete file:

```python
from rest_framework import serializers

from accounts.serializers import AddressSerializer

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "unit_price", "quantity"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    address = AddressSerializer(read_only=True)
    customer_name = serializers.CharField(source="user.first_name", read_only=True)
    customer_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "status", "total_amount", "razorpay_order_id", "created_at", "updated_at",
            "address", "customer_name", "customer_email",
            "porter_name", "porter_phone", "courier_name", "courier_tracking_number",
            "items",
        ]
```

(This is a superset of Sub-plan 3's original field list — `id, status, total_amount, razorpay_order_id, created_at, items` are unchanged; `updated_at`, `address`, `customer_name`, `customer_email`, and the four tracking fields are new. `OrderByRazorpayOrderView`'s existing tests only assert specific keys, never a full-dict equality, so this stays compatible.)

Append to `backend/orders/tests/test_views.py` (no new imports are needed — `Address`, `Category`, `Product`, `Order`, `OrderItem`, and `User` are all already imported at the top of this file from earlier tasks):

```python
class OrderViewSetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="a@example.com", password="pw12345678", first_name="Asha",
        )
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.address = Address.objects.create(
            user=self.user, full_name="Asha", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5,
        )

    def test_requires_authentication_for_list(self):
        response = self.client.get("/api/v1/orders/")
        self.assertEqual(response.status_code, 401)

    def test_lists_only_own_orders(self):
        mine = Order.objects.create(
            user=self.user, address=self.address, total_amount="100.00", razorpay_order_id="order_mine",
        )
        theirs_address = Address.objects.create(
            user=self.other, full_name="B", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        Order.objects.create(
            user=self.other, address=theirs_address, total_amount="200.00", razorpay_order_id="order_theirs",
        )

        response = self.client.get("/api/v1/orders/", **self.auth_header)

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], mine.id)

    def test_orders_are_listed_newest_first(self):
        older = Order.objects.create(
            user=self.user, address=self.address, total_amount="100.00", razorpay_order_id="order_old",
        )
        newer = Order.objects.create(
            user=self.user, address=self.address, total_amount="150.00", razorpay_order_id="order_new",
        )

        response = self.client.get("/api/v1/orders/", **self.auth_header)

        ids = [item["id"] for item in response.json()["results"]]
        self.assertEqual(ids, [newer.id, older.id])

    def test_retrieve_own_order_detail_includes_address_and_items(self):
        order = Order.objects.create(
            user=self.user, address=self.address, total_amount="200.00", razorpay_order_id="order_detail_test",
        )
        OrderItem.objects.create(
            order=order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )

        response = self.client.get(f"/api/v1/orders/{order.id}/", **self.auth_header)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "placed")
        self.assertEqual(data["address"]["full_name"], "Asha")
        self.assertEqual(data["customer_name"], "Asha")
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["product_name"], "Tank")

    def test_cannot_retrieve_another_users_order(self):
        theirs_address = Address.objects.create(
            user=self.other, full_name="B", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        theirs = Order.objects.create(
            user=self.other, address=theirs_address, total_amount="200.00", razorpay_order_id="order_theirs_2",
        )

        response = self.client.get(f"/api/v1/orders/{theirs.id}/", **self.auth_header)

        self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test orders.tests.test_views.OrderViewSetTests -v 2`
Expected: 404s — no `/api/v1/orders/` route exists yet (the only existing `orders/...` path is `orders/by-razorpay-order/<id>/`).

- [ ] **Step 3: Implement**

Read the current `backend/orders/views.py` in full first — it already contains `CheckoutView`, `RazorpayWebhookView`, and `OrderByRazorpayOrderView`, which must all remain exactly as they are. Replace the file with the complete version below (adds `viewsets` to the existing `rest_framework` import and appends `OrderViewSet` at the end — every existing class's body is unchanged):

```python
import json
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Product
from razorpay.errors import SignatureVerificationError

from .models import CheckoutSession, Order, OrderItem
from .razorpay_client import get_razorpay_client
from .serializers import OrderSerializer

logger = logging.getLogger(__name__)


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        except (SignatureVerificationError, TypeError, UnicodeDecodeError):
            logger.error("Razorpay webhook rejected: invalid or malformed signature")
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
            if not session:
                logger.error(
                    "Razorpay webhook payment.captured for unknown razorpay_order_id=%s "
                    "razorpay_payment_id=%s: no matching CheckoutSession",
                    razorpay_order_id, razorpay_payment_id,
                )
                return Response(status=status.HTTP_200_OK)
            if session.order_id:
                logger.info(
                    "Razorpay webhook duplicate delivery for razorpay_order_id=%s: already processed",
                    razorpay_order_id,
                )
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


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Order.objects.filter(user=self.request.user)
            .select_related("address", "user")
            .prefetch_related("items")
        )
```

Replace `backend/orders/urls.py` with the complete file:

```python
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CheckoutView, OrderByRazorpayOrderView, OrderViewSet, RazorpayWebhookView

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path(
        "orders/by-razorpay-order/<str:razorpay_order_id>/",
        OrderByRazorpayOrderView.as_view(),
        name="order-by-razorpay-order",
    ),
] + router.urls
```

(The manual `orders/by-razorpay-order/<id>/` path and the router's generated `orders/<pk>/` detail route don't collide — one has an extra `by-razorpay-order/` path segment the other doesn't — but the manual paths are listed first regardless, so Django tries them before the router's patterns.)

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test orders -v 2`
Expected: `OK` (152 tests pass — 147 from before this task + 5 new)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full backend suite passes.

- [ ] **Step 5: Commit**

```bash
git add backend/orders/serializers.py backend/orders/views.py backend/orders/urls.py backend/orders/tests/test_views.py
git commit -m "feat(orders): add customer-facing order list and detail endpoints"
```

---

## Task 2: `GET/PATCH /api/v1/admin/orders/` — staff list, detail, and status transitions

**Files:**
- Modify: `backend/orders/serializers.py` (add `AdminOrderStatusUpdateSerializer`)
- Modify: `backend/orders/views.py` (add `AdminOrderViewSet`)
- Modify: `backend/orders/urls.py` (mount `AdminOrderViewSet` via the router)
- Modify: `backend/orders/tests/test_views.py` (add `AdminOrderViewSetTests`)

**Interfaces:**
- Consumes: `orders.serializers.OrderSerializer`, `orders.models.Order` (Task 1).
- Produces: `GET /api/v1/admin/orders/` → staff-only paginated list, optionally filtered by `?status=`; `GET /api/v1/admin/orders/<id>/` → staff-only detail; `PATCH /api/v1/admin/orders/<id>/` → staff-only status transition (+ tracking fields when moving to `transported`), 200 with the full updated order, 400 on an invalid transition or incomplete tracking info.

- [ ] **Step 1: Write the failing tests**

Replace `backend/orders/serializers.py` with the complete file (adds `AdminOrderStatusUpdateSerializer` below the existing classes):

```python
from rest_framework import serializers

from accounts.serializers import AddressSerializer

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "unit_price", "quantity"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    address = AddressSerializer(read_only=True)
    customer_name = serializers.CharField(source="user.first_name", read_only=True)
    customer_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "status", "total_amount", "razorpay_order_id", "created_at", "updated_at",
            "address", "customer_name", "customer_email",
            "porter_name", "porter_phone", "courier_name", "courier_tracking_number",
            "items",
        ]


class AdminOrderStatusUpdateSerializer(serializers.ModelSerializer):
    VALID_TRANSITIONS = {
        "placed": {"packed", "cancelled"},
        "packed": {"transported", "cancelled"},
        "transported": {"delivered"},
        "delivered": set(),
        "cancelled": set(),
    }

    class Meta:
        model = Order
        fields = ["status", "porter_name", "porter_phone", "courier_name", "courier_tracking_number"]

    def validate(self, attrs):
        if "status" not in attrs:
            raise serializers.ValidationError({"status": "Status is required."})

        new_status = attrs["status"]
        allowed = self.VALID_TRANSITIONS.get(self.instance.status, set())
        if new_status not in allowed:
            raise serializers.ValidationError(
                {"status": f"Cannot move an order from '{self.instance.status}' to '{new_status}'."}
            )

        if new_status == "transported":
            porter_name = attrs.get("porter_name", "")
            porter_phone = attrs.get("porter_phone", "")
            courier_name = attrs.get("courier_name", "")
            courier_tracking_number = attrs.get("courier_tracking_number", "")
            porter_complete = bool(porter_name) and bool(porter_phone)
            courier_complete = bool(courier_name) and bool(courier_tracking_number)
            porter_partial = bool(porter_name) != bool(porter_phone)
            courier_partial = bool(courier_name) != bool(courier_tracking_number)
            if porter_partial or courier_partial:
                raise serializers.ValidationError(
                    "Provide both porter name and phone, or both courier name and tracking number."
                )
            if porter_complete and courier_complete:
                raise serializers.ValidationError(
                    "Provide either porter details or courier details, not both."
                )
            if not porter_complete and not courier_complete:
                raise serializers.ValidationError(
                    "Provide either porter name and phone, or courier name and tracking number."
                )
        return attrs
```

Append to `backend/orders/tests/test_views.py`:

```python
class AdminOrderViewSetTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff@example.com", password="pw12345678", is_staff=True)
        self.customer = User.objects.create_user(username="a@example.com", password="pw12345678", first_name="Asha")
        self.address = Address.objects.create(
            user=self.customer, full_name="Asha", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_anonymous_cannot_list_admin_orders(self):
        response = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_list_admin_orders(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(response.status_code, 403)

    def test_staff_can_list_all_orders(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_1",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/orders/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def test_staff_can_filter_orders_by_status(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_placed", status="placed",
        )
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="150.00",
            razorpay_order_id="order_packed", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/orders/", {"status": "packed"})

        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["razorpay_order_id"], "order_packed")

    def test_staff_can_retrieve_order_detail(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_detail",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get(f"/api/v1/admin/orders/{order.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["customer_email"], "a@example.com")

    def test_staff_can_move_order_from_placed_to_packed(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_transition",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "packed"})

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "packed")

    def test_rejects_skipping_a_status(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_skip",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "delivered"})

        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, "placed")

    def test_rejects_moving_backward(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_backward", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "placed"})

        self.assertEqual(response.status_code, 400)

    def test_can_cancel_from_placed(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_cancel_placed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "cancelled"})

        self.assertEqual(response.status_code, 200)

    def test_cannot_cancel_from_transported(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_cancel_transported", status="transported",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "cancelled"})

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_requires_tracking_info(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_transported_missing", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "transported"})

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_rejects_both_porter_and_courier(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_both", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported",
            "porter_name": "Ravi", "porter_phone": "9999999999",
            "courier_name": "BlueDart", "courier_tracking_number": "BD123",
        })

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_rejects_partial_porter_info(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_partial", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported", "porter_name": "Ravi",
        })

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_with_porter_info_succeeds(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_porter_ok", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported", "porter_name": "Ravi", "porter_phone": "9999999999",
        })

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "transported")
        self.assertEqual(order.porter_name, "Ravi")

    def test_moving_to_transported_with_courier_info_succeeds(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_courier_ok", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported", "courier_name": "BlueDart", "courier_tracking_number": "BD123",
        })

        self.assertEqual(response.status_code, 200)

    def test_moving_to_delivered_after_transported(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_delivered",
            status="transported", courier_name="BlueDart", courier_tracking_number="BD123",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "delivered"})

        self.assertEqual(response.status_code, 200)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test orders.tests.test_views.AdminOrderViewSetTests -v 2`
Expected: 404s — no `/api/v1/admin/orders/` route exists yet.

- [ ] **Step 3: Implement**

Read the current `backend/orders/views.py` in full first — it now contains `CheckoutView`, `RazorpayWebhookView`, `OrderByRazorpayOrderView`, and `OrderViewSet` from Task 1, all of which must remain exactly as they are. Replace the file with the complete version below (adds `IsAdminUser` to the `rest_framework.permissions` import, adds `AdminOrderStatusUpdateSerializer` to the `.serializers` import, and appends `AdminOrderViewSet` at the end):

```python
import json
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Product
from razorpay.errors import SignatureVerificationError

from .models import CheckoutSession, Order, OrderItem
from .razorpay_client import get_razorpay_client
from .serializers import AdminOrderStatusUpdateSerializer, OrderSerializer

logger = logging.getLogger(__name__)


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        except (SignatureVerificationError, TypeError, UnicodeDecodeError):
            logger.error("Razorpay webhook rejected: invalid or malformed signature")
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
            if not session:
                logger.error(
                    "Razorpay webhook payment.captured for unknown razorpay_order_id=%s "
                    "razorpay_payment_id=%s: no matching CheckoutSession",
                    razorpay_order_id, razorpay_payment_id,
                )
                return Response(status=status.HTTP_200_OK)
            if session.order_id:
                logger.info(
                    "Razorpay webhook duplicate delivery for razorpay_order_id=%s: already processed",
                    razorpay_order_id,
                )
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


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Order.objects.filter(user=self.request.user)
            .select_related("address", "user")
            .prefetch_related("items")
        )


class AdminOrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "patch"]

    def get_queryset(self):
        queryset = Order.objects.select_related("address", "user").prefetch_related("items")
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = AdminOrderStatusUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OrderSerializer(instance, context={"request": request}).data)
```

Replace `backend/orders/urls.py` with the complete file:

```python
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AdminOrderViewSet, CheckoutView, OrderByRazorpayOrderView, OrderViewSet, RazorpayWebhookView

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")
router.register("admin/orders", AdminOrderViewSet, basename="admin-order")

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path(
        "orders/by-razorpay-order/<str:razorpay_order_id>/",
        OrderByRazorpayOrderView.as_view(),
        name="order-by-razorpay-order",
    ),
] + router.urls
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test orders -v 2`
Expected: `OK` (168 tests pass — 152 from Task 1 + 16 new)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full backend suite passes.

- [ ] **Step 5: Commit**

```bash
git add backend/orders/serializers.py backend/orders/views.py backend/orders/urls.py backend/orders/tests/test_views.py
git commit -m "feat(orders): add staff order list, detail, and status-transition endpoint"
```

---

## Task 3: Customer `OrderHistory.jsx` + `OrderDetail.jsx` + `/account/orders` routes

**Files:**
- Create: `frontend/src/pages/public/OrderHistory.jsx`
- Create: `frontend/src/pages/public/OrderDetail.jsx`
- Modify: `frontend/src/App.jsx` (add the guarded `/account/orders` and `/account/orders/:id` routes)
- Modify: `frontend/src/components/public/Header.jsx` (add the "My Orders" nav-drawer link)

**Interfaces:**
- Consumes: `customerApiClient` (Sub-plan 1), `GET /api/v1/orders/` / `GET /api/v1/orders/<id>/` (Task 1).
- Produces: nothing consumed by later tasks in this sub-plan.

- [ ] **Step 1: Implement the pages**

`frontend/src/pages/public/OrderHistory.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { customerApiClient } from "../../api/customerClient";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    customerApiClient
      .get("/orders/")
      .then((response) => {
        setOrders(response.data.results);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Your orders</h1>
      {loadError && <p className="text-red-600 mb-4">Couldn't load your orders — please try again later.</p>}
      <div className="grid gap-4">
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/account/orders/${order.id}`}
            className="border rounded-xl p-4 flex justify-between items-center bg-white shadow-sm hover:shadow-md transition"
          >
            <div>
              <p className="font-medium text-brand-dark">Order #{order.id}</p>
              <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-brand-forest">{STATUS_LABELS[order.status]}</p>
              <p className="text-sm text-gray-600">₹{order.total_amount}</p>
            </div>
          </Link>
        ))}
        {orders.length === 0 && !loadError && (
          <p className="text-gray-500 text-sm">You haven't placed any orders yet.</p>
        )}
      </div>
    </div>
  );
}
```

`frontend/src/pages/public/OrderDetail.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { customerApiClient } from "../../api/customerClient";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    customerApiClient
      .get(`/orders/${id}/`)
      .then((response) => {
        setOrder(response.data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-red-600">
        Couldn't load this order — please try again later.
      </div>
    );
  }

  if (!order) return <div className="max-w-3xl mx-auto px-4 py-10">Loading...</div>;

  const hasTracking = order.porter_name || order.courier_name;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-2">Order #{order.id}</h1>
      <p className="text-sm text-gray-600 mb-6">Placed on {new Date(order.created_at).toLocaleDateString()}</p>

      <div className="border rounded-xl p-4 bg-white shadow-sm mb-6">
        <p className="font-medium text-brand-dark mb-1">Status: {STATUS_LABELS[order.status]}</p>
        {hasTracking && (
          <div className="mt-3 text-sm text-gray-700">
            {order.porter_name ? (
              <p>Delivered by porter: {order.porter_name} ({order.porter_phone})</p>
            ) : (
              <p>Shipped via {order.courier_name} — tracking number {order.courier_tracking_number}</p>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-xl p-4 bg-white shadow-sm mb-6">
        <h2 className="font-medium text-brand-dark mb-2">Delivery address</h2>
        <p className="text-sm text-gray-700">
          {order.address.full_name} — {order.address.phone}
          <br />
          {order.address.line1}{order.address.line2 && `, ${order.address.line2}`}, {order.address.city}, {order.address.state} {order.address.pincode}
        </p>
      </div>

      <div className="border rounded-xl p-4 bg-white shadow-sm">
        <h2 className="font-medium text-brand-dark mb-3">Items</h2>
        <div className="grid gap-2 mb-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>₹{(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-semibold text-brand-dark border-t pt-3">
          <span>Total</span>
          <span>₹{order.total_amount}</span>
        </div>
      </div>
    </div>
  );
}
```

In `frontend/src/App.jsx`, add the `OrderDetail` and `OrderHistory` imports — alphabetically, `OrderConfirmation` (already present) sorts first, then `OrderDetail`, then `OrderHistory`, all before `Portfolio`:

```jsx
import OrderConfirmation from "./pages/public/OrderConfirmation";
import OrderDetail from "./pages/public/OrderDetail";
import OrderHistory from "./pages/public/OrderHistory";
import Portfolio from "./pages/public/Portfolio";
```

And add the two new routes inside the existing `/account` route block, right after `addresses`:

```jsx
          <Route path="/account" element={<CustomerGuard />}>
            <Route index element={<Navigate to="/account/addresses" replace />} />
            <Route path="addresses" element={<AccountAddresses />} />
            <Route path="orders" element={<OrderHistory />} />
            <Route path="orders/:id" element={<OrderDetail />} />
          </Route>
```

In `frontend/src/components/public/Header.jsx`, add a "My Orders" link right after the existing "My Account" `NavLink` in the drawer's Account section:

```jsx
              <NavLink
                to="/account/addresses"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                My Account
              </NavLink>
              <NavLink
                to="/account/orders"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                My Orders
              </NavLink>
```

- [ ] **Step 2: Manual verification**

This task has no automated test file, matching the established convention for simple fetch-and-display account pages (`AccountAddresses.jsx` has none either). Run the full frontend test suite (`cd frontend && npx vitest run`) to confirm no regressions — no new tests are expected, just the existing baseline passing.

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite (41 baseline, no new tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/public/OrderHistory.jsx frontend/src/pages/public/OrderDetail.jsx frontend/src/App.jsx frontend/src/components/public/Header.jsx
git commit -m "feat(orders): add customer order history and order detail pages"
```

---

## Task 4: Admin `OrdersManager.jsx` — order list

**Files:**
- Create: `frontend/src/pages/admin/OrdersManager.jsx`
- Modify: `frontend/src/App.jsx` (add the guarded `/admin/orders` route)
- Modify: `frontend/src/components/public/Header.jsx` (add "Orders" to `ADMIN_LINKS`)

**Interfaces:**
- Consumes: `apiClient` (existing, staff), `GET /api/v1/admin/orders/` (Task 2).
- Produces: nothing consumed by later tasks — Task 5's `/admin/orders/:id` route is independent and doesn't import from this task's file.

- [ ] **Step 1: Implement the page**

`frontend/src/pages/admin/OrdersManager.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";

const STATUS_OPTIONS = ["placed", "packed", "transported", "delivered", "cancelled"];
const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    apiClient
      .get("/admin/orders/", { params: statusFilter ? { status: statusFilter } : {} })
      .then((response) => {
        setOrders(response.data.results);
        setOrdersError(false);
      })
      .catch(() => setOrdersError(true));
  }, [statusFilter]);

  return (
    <div className="px-4 py-8">
      <h1 className="text-xl font-semibold mb-4">Orders</h1>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="border rounded px-3 py-2 mb-4"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>{STATUS_LABELS[status]}</option>
        ))}
      </select>
      {ordersError && <p className="text-red-600 mb-4">Couldn't load orders — please try again later.</p>}
      <table className="w-full text-left">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th><th></th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t">
              <td>#{order.id}</td>
              <td>{order.customer_name || order.customer_email}</td>
              <td>₹{order.total_amount}</td>
              <td>{STATUS_LABELS[order.status]}</td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td><Link to={`/admin/orders/${order.id}`} className="text-brand-forest hover:underline">View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && !ordersError && <p className="text-gray-500 mt-4">No orders.</p>}
    </div>
  );
}
```

In `frontend/src/App.jsx`, add the `OrdersManager` import — alphabetically it falls between `Login` and `ProductsManager`, so the full admin-page import block becomes:

```jsx
import CategoriesManager from "./pages/admin/CategoriesManager";
import InquiriesManager from "./pages/admin/InquiriesManager";
import Login from "./pages/admin/Login";
import OrdersManager from "./pages/admin/OrdersManager";
import ProductsManager from "./pages/admin/ProductsManager";
import VideosManager from "./pages/admin/VideosManager";
```

And add the route inside the existing `/admin` route block, after `inquiries` (order doesn't matter functionally, but keep the block's existing entries in place and append this one last, right before the block's closing tag):

```jsx
          <Route path="/admin" element={<AdminGuard />}>
            <Route index element={<Navigate to="/admin/categories" replace />} />
            <Route path="categories" element={<CategoriesManager />} />
            <Route path="products" element={<ProductsManager />} />
            <Route path="videos" element={<VideosManager />} />
            <Route path="inquiries" element={<InquiriesManager />} />
            <Route path="orders" element={<OrdersManager />} />
          </Route>
```

In `frontend/src/components/public/Header.jsx`, add an "Orders" entry to `ADMIN_LINKS`:

```jsx
const ADMIN_LINKS = [
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/videos", label: "Videos" },
  { to: "/admin/inquiries", label: "Inquiries" },
  { to: "/admin/orders", label: "Orders" },
];
```

- [ ] **Step 2: Manual verification**

This task has no automated test file, matching the established convention for simple fetch-and-display admin list pages (`InquiriesManager.jsx` has none either). Run the full frontend test suite to confirm no regressions.

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite (41 baseline, no new tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/OrdersManager.jsx frontend/src/App.jsx frontend/src/components/public/Header.jsx
git commit -m "feat(orders): add the admin orders list page"
```

---

## Task 5: Admin `OrderDetailManager.jsx` — status transition + tracking form

**Files:**
- Create: `frontend/src/pages/admin/OrderDetailManager.jsx`
- Create: `frontend/src/pages/admin/OrderDetailManager.test.jsx`
- Modify: `frontend/src/App.jsx` (add the guarded `/admin/orders/:id` route)

**Interfaces:**
- Consumes: `apiClient` (existing, staff), `describeError` (existing), `GET /api/v1/admin/orders/<id>/` + `PATCH /api/v1/admin/orders/<id>/` (Task 2).
- Produces: nothing consumed elsewhere — this is the last task in the sub-plan.

- [ ] **Step 1: Write the failing tests**

`frontend/src/pages/admin/OrderDetailManager.test.jsx`:

```jsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import OrderDetailManager from "./OrderDetailManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn() },
}));

const PLACED_ORDER = {
  id: 42,
  status: "placed",
  total_amount: "200.00",
  created_at: "2026-08-01T10:00:00Z",
  customer_name: "Asha",
  customer_email: "asha@example.com",
  address: {
    full_name: "Asha", phone: "1234567890", line1: "1 Rd", line2: "",
    city: "City", state: "State", pincode: "500001",
  },
  porter_name: "", porter_phone: "", courier_name: "", courier_tracking_number: "",
  items: [{ id: 1, product: 1, product_name: "Tank", unit_price: "100.00", quantity: 2 }],
};

function renderDetail(orderId = "42") {
  return render(
    <MemoryRouter initialEntries={[`/admin/orders/${orderId}`]}>
      <Routes>
        <Route path="/admin/orders/:id" element={<OrderDetailManager />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OrderDetailManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("loads and displays the order", async () => {
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });

    renderDetail();

    expect(await screen.findByText("Order #42")).toBeTruthy();
    expect(screen.getByText(/Asha/)).toBeTruthy();
  });

  it("shows only the valid next statuses for a placed order", async () => {
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });

    renderDetail();
    await screen.findByText("Order #42");

    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Packed");
    expect(options).toContain("Cancelled");
    expect(options).not.toContain("Delivered");
    expect(options).not.toContain("Transported");
  });

  it("submits a simple transition without a tracking form", async () => {
    const updatedOrder = { ...PLACED_ORDER, status: "packed" };
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });
    apiClient.patch.mockResolvedValueOnce({ data: updatedOrder });
    apiClient.get.mockResolvedValueOnce({ data: updatedOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "packed" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", { status: "packed" })
    );
  });

  it("shows the tracking form when transported is selected, and submits porter details", async () => {
    const packedOrder = { ...PLACED_ORDER, status: "packed" };
    const updatedOrder = { ...packedOrder, status: "transported" };
    apiClient.get.mockResolvedValueOnce({ data: packedOrder });
    apiClient.patch.mockResolvedValueOnce({ data: updatedOrder });
    apiClient.get.mockResolvedValueOnce({ data: updatedOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "transported" } });

    const porterNameInput = await screen.findByPlaceholderText("Porter name");
    fireEvent.change(porterNameInput, { target: { value: "Ravi" } });
    fireEvent.change(screen.getByPlaceholderText("Porter phone"), { target: { value: "9999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", {
        status: "transported", porter_name: "Ravi", porter_phone: "9999999999",
      })
    );
  });

  it("submits courier details when the courier option is selected", async () => {
    const packedOrder = { ...PLACED_ORDER, status: "packed" };
    const updatedOrder = { ...packedOrder, status: "transported" };
    apiClient.get.mockResolvedValueOnce({ data: packedOrder });
    apiClient.patch.mockResolvedValueOnce({ data: updatedOrder });
    apiClient.get.mockResolvedValueOnce({ data: updatedOrder }); // reload after a successful PATCH

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "transported" } });
    fireEvent.click(await screen.findByLabelText("Courier"));
    fireEvent.change(screen.getByPlaceholderText("Courier name"), { target: { value: "BlueDart" } });
    fireEvent.change(screen.getByPlaceholderText("Tracking number"), { target: { value: "BD123" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/admin/orders/42/", {
        status: "transported", courier_name: "BlueDart", courier_tracking_number: "BD123",
      })
    );
  });

  it("shows an error message when the update fails", async () => {
    apiClient.get.mockResolvedValueOnce({ data: PLACED_ORDER });
    apiClient.patch.mockRejectedValueOnce({
      response: { data: { status: "Cannot move an order from 'placed' to 'delivered'." } },
    });

    renderDetail();
    await screen.findByText("Order #42");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "packed" } });
    fireEvent.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByText("Cannot move an order from 'placed' to 'delivered'.")).toBeTruthy();
  });

  it("hides the transition form for a delivered order", async () => {
    apiClient.get.mockResolvedValueOnce({ data: { ...PLACED_ORDER, status: "delivered" } });

    renderDetail();
    await screen.findByText("Order #42");

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/admin/OrderDetailManager.test.jsx`
Expected: FAIL — `Failed to resolve import "./OrderDetailManager"` (file doesn't exist yet).

- [ ] **Step 3: Implement**

`frontend/src/pages/admin/OrderDetailManager.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const NEXT_STATUSES = {
  placed: ["packed", "cancelled"],
  packed: ["transported", "cancelled"],
  transported: ["delivered"],
  delivered: [],
  cancelled: [],
};

export default function OrderDetailManager() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [trackingMethod, setTrackingMethod] = useState("porter");
  const [porterName, setPorterName] = useState("");
  const [porterPhone, setPorterPhone] = useState("");
  const [courierName, setCourierName] = useState("");
  const [courierTrackingNumber, setCourierTrackingNumber] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = () =>
    apiClient
      .get(`/admin/orders/${id}/`)
      .then((response) => {
        setOrder(response.data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const resetForm = () => {
    setSelectedStatus("");
    setTrackingMethod("porter");
    setPorterName("");
    setPorterPhone("");
    setCourierName("");
    setCourierTrackingNumber("");
  };

  const handleTransition = async (event) => {
    event.preventDefault();
    if (!selectedStatus) return;
    setIsSaving(true);
    setFormError("");
    const payload = { status: selectedStatus };
    if (selectedStatus === "transported") {
      if (trackingMethod === "porter") {
        payload.porter_name = porterName;
        payload.porter_phone = porterPhone;
      } else {
        payload.courier_name = courierName;
        payload.courier_tracking_number = courierTrackingNumber;
      }
    }
    try {
      await apiClient.patch(`/admin/orders/${id}/`, payload);
      resetForm();
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't update the order — please check the fields and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError) {
    return <div className="px-4 py-8 text-red-600">Couldn't load this order — please try again later.</div>;
  }

  if (!order) return <div className="px-4 py-8">Loading...</div>;

  const nextStatuses = NEXT_STATUSES[order.status] || [];

  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-xl font-semibold mb-2">Order #{order.id}</h1>
      <p className="text-sm text-gray-600 mb-6">Placed on {new Date(order.created_at).toLocaleDateString()}</p>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-2">Customer</h2>
        <p className="text-sm">{order.customer_name} — {order.customer_email}</p>
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-2">Delivery address</h2>
        <p className="text-sm">
          {order.address.full_name} — {order.address.phone}
          <br />
          {order.address.line1}{order.address.line2 && `, ${order.address.line2}`}, {order.address.city}, {order.address.state} {order.address.pincode}
        </p>
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-2">Items</h2>
        <div className="grid gap-1 mb-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>₹{item.unit_price}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-semibold border-t pt-2">
          <span>Total</span>
          <span>₹{order.total_amount}</span>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-medium mb-3">Status: {STATUS_LABELS[order.status]}</h2>
        {(order.porter_name || order.courier_name) && (
          <p className="text-sm text-gray-600 mb-3">
            {order.porter_name
              ? `Porter: ${order.porter_name} (${order.porter_phone})`
              : `Courier: ${order.courier_name} — ${order.courier_tracking_number}`}
          </p>
        )}
        {nextStatuses.length > 0 && (
          <form onSubmit={handleTransition} className="grid gap-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">Select next status</option>
              {nextStatuses.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
            {selectedStatus === "transported" && (
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={trackingMethod === "porter"}
                    onChange={() => setTrackingMethod("porter")}
                  />
                  Porter
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={trackingMethod === "courier"}
                    onChange={() => setTrackingMethod("courier")}
                  />
                  Courier
                </label>
                {trackingMethod === "porter" ? (
                  <>
                    <input
                      required
                      placeholder="Porter name"
                      value={porterName}
                      onChange={(e) => setPorterName(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      required
                      placeholder="Porter phone"
                      value={porterPhone}
                      onChange={(e) => setPorterPhone(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                  </>
                ) : (
                  <>
                    <input
                      required
                      placeholder="Courier name"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      required
                      placeholder="Tracking number"
                      value={courierTrackingNumber}
                      onChange={(e) => setCourierTrackingNumber(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                  </>
                )}
              </div>
            )}
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button
              type="submit"
              disabled={isSaving || !selectedStatus}
              className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded px-4 py-2 w-fit"
            >
              {isSaving ? "Saving..." : "Update status"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

In `frontend/src/App.jsx`, add the `OrderDetailManager` import (alphabetically, between `InquiriesManager` and `Login`, keeping `OrdersManager` from Task 4 right after `Login`):

```jsx
import InquiriesManager from "./pages/admin/InquiriesManager";
import Login from "./pages/admin/Login";
import OrderDetailManager from "./pages/admin/OrderDetailManager";
import OrdersManager from "./pages/admin/OrdersManager";
import ProductsManager from "./pages/admin/ProductsManager";
import VideosManager from "./pages/admin/VideosManager";
```

And add the route inside the existing `/admin` route block, right after `orders`:

```jsx
          <Route path="/admin" element={<AdminGuard />}>
            <Route index element={<Navigate to="/admin/categories" replace />} />
            <Route path="categories" element={<CategoriesManager />} />
            <Route path="products" element={<ProductsManager />} />
            <Route path="videos" element={<VideosManager />} />
            <Route path="inquiries" element={<InquiriesManager />} />
            <Route path="orders" element={<OrdersManager />} />
            <Route path="orders/:id" element={<OrderDetailManager />} />
          </Route>
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/admin/OrderDetailManager.test.jsx`
Expected: PASS (7 tests)

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite (41 baseline + 7 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/OrderDetailManager.jsx frontend/src/pages/admin/OrderDetailManager.test.jsx frontend/src/App.jsx
git commit -m "feat(orders): add the admin order detail page with status transitions and tracking entry"
```

---

## Plan-level verification

After all 5 tasks:

Run: `cd backend && python manage.py test` — full backend suite passes (accounts + cart + catalog + core + inquiries + orders).

Run: `cd frontend && npx vitest run` — full frontend suite passes.

Manual end-to-end pass: as a logged-in customer with a past order (from a real or test checkout), visit `/account/orders`, confirm the order appears with its current status; click into it and confirm the address/items/total are all correct. As staff, visit `/admin/orders`, filter by status, click into an order, move it through Placed → Packed → Transported (entering porter OR courier details) → Delivered, confirming each transition succeeds and an invalid one (e.g. attempting to skip straight to Delivered) is rejected with a clear message. Confirm the customer's own order detail page now shows the tracking info once the order reaches Transported.
