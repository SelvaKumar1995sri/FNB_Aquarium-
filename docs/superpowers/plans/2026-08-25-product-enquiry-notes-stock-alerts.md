# Product Enquiry Modal, Notes/Specification, and Stock-Alert Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the inline "Enquire about this product" form into a button+modal, add optional Note/Specification fields to Product (admin-edited, rendered as a callout + accordion), and add a customer-facing "Notify Me" / restock-notification system mirroring the existing admin notification bell.

**Architecture:** Django REST Framework backend (`catalog` app for product fields, `notifications` app for stock-alert subscriptions + persisted customer notifications) with no new signals — restock detection is two explicit call sites in `ProductViewSet`, matching the codebase's existing plain-`.save()` style. React frontend adds a handful of small, independently-testable pieces (a formatting util, an accordion, a notify button, a polling context) that get wired together into the existing `ProductDetail`/`ProductsManager`/`Header` pages last.

**Tech Stack:** Django 5 + DRF (backend, `backend/`), React 19 + Vite + Tailwind (frontend, `frontend/`), Vitest + @testing-library/react (frontend tests), Django's `APITestCase`/`TestCase` (backend tests).

**Spec:** `docs/superpowers/specs/2026-08-25-product-enquiry-notes-stock-alerts-design.md`

## Global Constraints

- No new npm or pip dependencies (Specification formatting is hand-rolled, not a WYSIWYG library).
- No Django signals — restock detection is explicit calls from `ProductViewSet`, matching `backend/orders/views.py`'s existing plain-`.save()` stock-decrement style.
- Note and Specification are optional on both create and edit — never `required` in the API or the admin form.
- "Notify Me" requires being logged in; no anonymous/guest subscription path.
- All new backend endpoints live under the existing `api/v1/` prefix (`backend/config/urls.py` already includes `notifications.urls` there).
- Migrations are generated with `python manage.py makemigrations <app>`, never hand-written from scratch — always inspect the generated file before committing it.

---

### Task 1: Move `Modal` to a shared location

**Files:**
- Create: `frontend/src/components/common/Modal.jsx`
- Delete: `frontend/src/components/admin/Modal.jsx`
- Modify: `frontend/src/pages/admin/CategoriesManager.jsx:5`
- Modify: `frontend/src/pages/admin/ProductsManager.jsx:5`
- Modify: `frontend/src/pages/admin/VideosManager.jsx:5`

**Interfaces:**
- Produces: default export `Modal({ title, onClose, children })` from `frontend/src/components/common/Modal.jsx` — identical behavior to the old admin-only copy (backdrop click / Escape / × all call `onClose`). Task 12 imports this.

- [ ] **Step 1: Create the shared copy**

Read `frontend/src/components/admin/Modal.jsx` and write its exact contents to a new file `frontend/src/components/common/Modal.jsx` (no changes to the code itself — this is a pure move).

- [ ] **Step 2: Update the three admin imports**

In each of `CategoriesManager.jsx`, `ProductsManager.jsx`, `VideosManager.jsx`, change:

```js
import Modal from "../../components/admin/Modal";
```

to:

```js
import Modal from "../../components/common/Modal";
```

- [ ] **Step 3: Delete the old file**

Delete `frontend/src/components/admin/Modal.jsx`.

- [ ] **Step 4: Run the frontend test suite to confirm no regressions**

Run (from `frontend/`): `npx vitest run`
Expected: all existing tests still pass (nothing imports the old path anymore).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Modal.jsx frontend/src/pages/admin/CategoriesManager.jsx frontend/src/pages/admin/ProductsManager.jsx frontend/src/pages/admin/VideosManager.jsx
git rm frontend/src/components/admin/Modal.jsx
git commit -m "refactor(frontend): move Modal to a shared location"
```

---

### Task 2: Backend — `Product.note` and `Product.specification` fields

**Files:**
- Modify: `backend/catalog/models.py:41-62` (`Product` model)
- Create: `backend/catalog/migrations/0006_product_note_specification.py` (generated)
- Modify: `backend/catalog/serializers.py:30-38` (`ProductSerializer`)
- Modify: `backend/catalog/tests/test_views.py` (new test class)

**Interfaces:**
- Produces: `note` (string) and `specification` (string) fields, both optional/blank, on every `Product` API response and accepted on create/update. Consumed by Task 8 (accordion display), Task 11 (admin form), Task 12 (`ProductDetail`).

- [ ] **Step 1: Add the test first (will fail — fields don't exist yet)**

Add to `backend/catalog/tests/test_views.py` (new class, place after `ProductAddStockActionTests`):

```python
class ProductNoteSpecificationTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="note-staff", password="pw12345", is_staff=True)
        self.category = Category.objects.create(name="Fish", slug="fish")

    def test_note_and_specification_default_to_blank(self):
        Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

        response = self.client.get("/api/v1/products/discus/")

        data = response.json()
        self.assertEqual(data["note"], "")
        self.assertEqual(data["specification"], "")

    def test_creating_a_product_without_note_or_specification_succeeds(self):
        self.client.force_authenticate(user=self.staff)

        response = self.client.post("/api/v1/products/", {
            "name": "Discus", "slug": "discus", "category": self.category.id,
            "price": 1200, "stock_quantity": 5,
        })

        self.assertEqual(response.status_code, 201)

    def test_staff_can_set_note_and_specification_via_edit(self):
        product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/products/{product.slug}/", {
            "note": "Free home delivery for this product",
            "specification": "**Tetra Bits** is great.\n- Bullet one\n- Bullet two",
        })

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.note, "Free home delivery for this product")
        self.assertIn("Bullet one", product.specification)
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `python manage.py test catalog.tests.test_views.ProductNoteSpecificationTests`
Expected: FAIL — `note`/`specification` not recognized (KeyError or missing-field assertion failure).

- [ ] **Step 3: Add the model fields**

In `backend/catalog/models.py`, in the `Product` class, change:

```python
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
```

to:

```python
    description = models.TextField(blank=True)
    note = models.TextField(blank=True, default="")
    specification = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=10, decimal_places=2)
```

- [ ] **Step 4: Generate and apply the migration**

Run (from `backend/`):
```
python manage.py makemigrations catalog
python manage.py migrate
```
Expected: a new `backend/catalog/migrations/0006_product_note_specification.py` (or similarly auto-named) file is created with two `AddField` operations, and it applies cleanly.

- [ ] **Step 5: Add the fields to `ProductSerializer`**

In `backend/catalog/serializers.py`, change `ProductSerializer.Meta.fields`:

```python
        fields = [
            "id", "name", "slug", "category", "description", "price",
            "stock_quantity", "in_stock", "is_featured", "created_at", "images",
        ]
```

to:

```python
        fields = [
            "id", "name", "slug", "category", "description", "note", "specification", "price",
            "stock_quantity", "in_stock", "is_featured", "created_at", "images",
        ]
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `backend/`): `python manage.py test catalog.tests.test_views.ProductNoteSpecificationTests`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/catalog/models.py backend/catalog/migrations/0006_product_note_specification.py backend/catalog/serializers.py backend/catalog/tests/test_views.py
git commit -m "feat(catalog): add optional note and specification fields to Product"
```

---

### Task 3: Backend — stock-alert subscription and customer notification models

**Files:**
- Modify: `backend/notifications/models.py`
- Create: `backend/notifications/migrations/0002_stockalertsubscription_customernotification.py` (generated)
- Create: `backend/notifications/tests/test_models.py`

**Interfaces:**
- Consumes: `Product` model from Task 2 (via lazy `"catalog.Product"` string FK — no import needed).
- Produces: `StockAlertSubscription(user, product, created_at, notified_at)` with a unique `(user, product)` constraint, and `CustomerNotification(user, product, message, created_at, read_at)` ordered newest-first, both in `notifications.models`. Consumed by Task 4, 5, 6.

- [ ] **Step 1: Write the failing tests**

Create `backend/notifications/tests/test_models.py`:

```python
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from catalog.models import Category, Product
from notifications.models import CustomerNotification, StockAlertSubscription

User = get_user_model()


class StockAlertSubscriptionModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_notified_at_defaults_to_null(self):
        subscription = StockAlertSubscription.objects.create(user=self.user, product=self.product)
        self.assertIsNone(subscription.notified_at)

    def test_duplicate_user_product_subscription_is_rejected(self):
        StockAlertSubscription.objects.create(user=self.user, product=self.product)
        with self.assertRaises(IntegrityError):
            StockAlertSubscription.objects.create(user=self.user, product=self.product)


class CustomerNotificationModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_read_at_defaults_to_null(self):
        notification = CustomerNotification.objects.create(user=self.user, product=self.product, message="Back in stock")
        self.assertIsNone(notification.read_at)

    def test_newest_first_ordering(self):
        older = CustomerNotification.objects.create(user=self.user, product=self.product, message="Older")
        newer = CustomerNotification.objects.create(user=self.user, product=self.product, message="Newer")

        ids = list(CustomerNotification.objects.values_list("id", flat=True))

        self.assertEqual(ids, [newer.id, older.id])

    def test_surviving_product_deletion_sets_product_to_null(self):
        notification = CustomerNotification.objects.create(user=self.user, product=self.product, message="Back in stock")

        self.product.delete()
        notification.refresh_from_db()

        self.assertIsNone(notification.product)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test notifications.tests.test_models`
Expected: FAIL — `ImportError: cannot import name 'StockAlertSubscription'`.

- [ ] **Step 3: Add the models**

In `backend/notifications/models.py`, add after `AdminNotificationState`:

```python
class StockAlertSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="stock_alert_subscriptions"
    )
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="stock_alert_subscriptions"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "product"], name="unique_stock_alert_subscription"),
        ]

    def __str__(self):
        return f"{self.user} watching {self.product}"


class CustomerNotification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    product = models.ForeignKey("catalog.Product", null=True, on_delete=models.SET_NULL, related_name="+")
    message = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.message
```

- [ ] **Step 4: Generate and apply the migration**

Run (from `backend/`):
```
python manage.py makemigrations notifications
python manage.py migrate
```
Expected: a new `backend/notifications/migrations/0002_...py` file creating both models plus the unique constraint; applies cleanly. It will depend on `catalog`'s latest migration (`0006_product_note_specification` from Task 2) — confirm that dependency is present in the generated file.

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test notifications.tests.test_models`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/notifications/models.py backend/notifications/migrations/ backend/notifications/tests/test_models.py
git commit -m "feat(notifications): add StockAlertSubscription and CustomerNotification models"
```

---

### Task 4: Backend — expose `stock_alert_subscribed` on `ProductSerializer`

**Files:**
- Modify: `backend/catalog/serializers.py:30-38`
- Modify: `backend/catalog/tests/test_views.py` (new test class + import)

**Interfaces:**
- Consumes: `StockAlertSubscription` model from Task 3 (via the reverse relation `product.stock_alert_subscriptions`, no direct model import needed).
- Produces: `stock_alert_subscribed` (bool) field on every `Product` API response — `true` only when the requesting user has an active (`notified_at` is null) subscription. Consumed by Task 9 (`NotifyMeButton`'s initial state) and Task 12.

- [ ] **Step 1: Write the failing tests**

Add to `backend/catalog/tests/test_views.py`. First add this import near the top (alongside the existing imports):

```python
from notifications.models import StockAlertSubscription
```

Then add a new test class (after `ProductNoteSpecificationTests`):

```python
class ProductStockAlertSubscribedFieldTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_anonymous_sees_false(self):
        response = self.client.get(f"/api/v1/products/{self.product.slug}/")
        self.assertFalse(response.json()["stock_alert_subscribed"])

    def test_authenticated_without_subscription_sees_false(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(f"/api/v1/products/{self.product.slug}/")
        self.assertFalse(response.json()["stock_alert_subscribed"])

    def test_authenticated_with_active_subscription_sees_true(self):
        StockAlertSubscription.objects.create(user=self.customer, product=self.product)
        self.client.force_authenticate(user=self.customer)

        response = self.client.get(f"/api/v1/products/{self.product.slug}/")

        self.assertTrue(response.json()["stock_alert_subscribed"])

    def test_authenticated_with_already_notified_subscription_sees_false(self):
        from django.utils import timezone
        StockAlertSubscription.objects.create(user=self.customer, product=self.product, notified_at=timezone.now())
        self.client.force_authenticate(user=self.customer)

        response = self.client.get(f"/api/v1/products/{self.product.slug}/")

        self.assertFalse(response.json()["stock_alert_subscribed"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test catalog.tests.test_views.ProductStockAlertSubscribedFieldTests`
Expected: FAIL — `KeyError: 'stock_alert_subscribed'`.

- [ ] **Step 3: Add the computed field**

In `backend/catalog/serializers.py`, change `ProductSerializer`:

```python
class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "category", "description", "note", "specification", "price",
            "stock_quantity", "in_stock", "is_featured", "created_at", "images",
        ]
```

to:

```python
class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    stock_alert_subscribed = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "category", "description", "note", "specification", "price",
            "stock_quantity", "in_stock", "is_featured", "created_at", "images", "stock_alert_subscribed",
        ]

    def get_stock_alert_subscribed(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.stock_alert_subscriptions.filter(user=user, notified_at__isnull=True).exists()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test catalog.tests.test_views.ProductStockAlertSubscribedFieldTests`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/catalog/serializers.py backend/catalog/tests/test_views.py
git commit -m "feat(catalog): expose stock_alert_subscribed on ProductSerializer"
```

---

### Task 5: Backend — restock detection + notification fan-out

**Files:**
- Create: `backend/notifications/services.py`
- Modify: `backend/catalog/views.py:32-104` (`ProductViewSet`)
- Modify: `backend/catalog/tests/test_views.py` (new test class + imports)

**Interfaces:**
- Consumes: `StockAlertSubscription`, `CustomerNotification` models from Task 3.
- Produces: `notifications.services.notify_restock(product)` — for every un-notified subscriber of `product`, creates a `CustomerNotification` and stamps `notified_at`. Called from `ProductViewSet.perform_update` and `ProductViewSet.add_stock` whenever `stock_quantity` transitions from 0 to positive. No new consumer-facing interface beyond this behavior (Task 6's endpoints read the `CustomerNotification`/`StockAlertSubscription` rows this produces).

- [ ] **Step 1: Write the failing tests**

Add to `backend/catalog/tests/test_views.py`. Add these imports near the top:

```python
from notifications.models import CustomerNotification, StockAlertSubscription
```

(If Task 4 already added `StockAlertSubscription` on its own line, extend that import to include `CustomerNotification` instead of duplicating the line.)

Add a new test class:

```python
class ProductRestockNotificationTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="restock-staff", password="pw12345", is_staff=True)
        self.customer = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(
            name="Discus", slug="discus", category=self.category, price=1200, stock_quantity=0,
        )
        StockAlertSubscription.objects.create(user=self.customer, product=self.product)
        self.client.force_authenticate(user=self.staff)

    def test_patching_stock_from_zero_to_positive_notifies_subscribers(self):
        response = self.client.patch(f"/api/v1/products/{self.product.slug}/", {"stock_quantity": 5})

        self.assertEqual(response.status_code, 200)
        notification = CustomerNotification.objects.get(user=self.customer)
        self.assertIn("Discus", notification.message)
        subscription = StockAlertSubscription.objects.get(user=self.customer, product=self.product)
        self.assertIsNotNone(subscription.notified_at)

    def test_patching_stock_between_two_positive_values_does_not_notify(self):
        self.product.stock_quantity = 3
        self.product.save()

        response = self.client.patch(f"/api/v1/products/{self.product.slug}/", {"stock_quantity": 7})

        self.assertEqual(response.status_code, 200)
        self.assertFalse(CustomerNotification.objects.filter(user=self.customer).exists())

    def test_add_stock_action_from_zero_notifies_subscribers(self):
        response = self.client.post(f"/api/v1/products/{self.product.slug}/add-stock/", {"quantity": 10})

        self.assertEqual(response.status_code, 200)
        self.assertTrue(CustomerNotification.objects.filter(user=self.customer).exists())

    def test_a_second_restock_without_resubscribing_does_not_notify_again(self):
        self.client.patch(f"/api/v1/products/{self.product.slug}/", {"stock_quantity": 5})
        self.product.refresh_from_db()
        self.product.stock_quantity = 0
        self.product.save()

        self.client.patch(f"/api/v1/products/{self.product.slug}/", {"stock_quantity": 8})

        self.assertEqual(CustomerNotification.objects.filter(user=self.customer).count(), 1)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test catalog.tests.test_views.ProductRestockNotificationTests`
Expected: FAIL — no `CustomerNotification` rows are created (restock detection doesn't exist yet).

- [ ] **Step 3: Add the notification service**

Create `backend/notifications/services.py`:

```python
from django.utils import timezone

from .models import CustomerNotification, StockAlertSubscription


def notify_restock(product):
    subscriptions = StockAlertSubscription.objects.filter(
        product=product, notified_at__isnull=True
    ).select_related("user")
    for subscription in subscriptions:
        CustomerNotification.objects.create(
            user=subscription.user,
            product=product,
            message=f'"{product.name}" is back in stock.',
        )
    subscriptions.update(notified_at=timezone.now())
```

- [ ] **Step 4: Hook it into `ProductViewSet`**

In `backend/catalog/views.py`, add the import:

```python
from notifications.services import notify_restock
```

Add a `perform_update` override to `ProductViewSet` (place it right after `get_queryset`, before `_find_duplicate`):

```python
    def perform_update(self, serializer):
        was_out_of_stock = serializer.instance.stock_quantity == 0
        super().perform_update(serializer)
        if was_out_of_stock and serializer.instance.stock_quantity > 0:
            notify_restock(serializer.instance)
```

Update the `add_stock` action to check for a restock transition:

```python
    @action(detail=True, methods=["post"], url_path="add-stock")
    def add_stock(self, request, slug=None):
        product = self.get_object()
        quantity = request.data.get("quantity")
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({"quantity": "Quantity must be a positive integer."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity <= 0:
            return Response({"quantity": "Quantity must be a positive integer."}, status=status.HTTP_400_BAD_REQUEST)

        was_out_of_stock = product.stock_quantity == 0
        Product.objects.filter(pk=product.pk).update(stock_quantity=F("stock_quantity") + quantity)
        product.refresh_from_db()
        if was_out_of_stock and product.stock_quantity > 0:
            notify_restock(product)
        return Response(ProductSerializer(product, context={"request": request}).data)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test catalog.tests.test_views.ProductRestockNotificationTests`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full catalog test suite to confirm no regressions**

Run (from `backend/`): `python manage.py test catalog`
Expected: all pass, including the pre-existing `ProductAddStockActionTests` and `ProductCreateDuplicateDetectionTests`.

- [ ] **Step 7: Commit**

```bash
git add backend/notifications/services.py backend/catalog/views.py backend/catalog/tests/test_views.py
git commit -m "feat(notifications): notify stock-alert subscribers when a product restocks"
```

---

### Task 6: Backend — customer-facing stock-alert API

**Files:**
- Modify: `backend/notifications/views.py`
- Modify: `backend/notifications/urls.py`
- Modify: `backend/notifications/tests/test_views.py` (new test classes + imports)

**Interfaces:**
- Consumes: `StockAlertSubscription`, `CustomerNotification` models from Task 3; `Product.in_stock` from existing `catalog.models`.
- Produces:
  - `POST /api/v1/notifications/stock-alerts/` — body `{"product": <id>}`, `IsAuthenticated`. Returns `204` on subscribe/resubscribe, `400` `{"detail": "This product is already in stock."}` if the product isn't out of stock, `401` if anonymous.
  - `GET /api/v1/notifications/mine/` — `IsAuthenticated`. Returns `{"unread_count": <int>, "notifications": [{"id", "message", "product_slug", "created_at", "read_at"}, ...]}`, newest 20 first, scoped to the requesting user.
  - `POST /api/v1/notifications/mine/mark-read/` — `IsAuthenticated`. Marks all of the requesting user's unread notifications read, returns `204`.
  - Consumed by Task 9 (subscribe endpoint) and Task 10 (`mine`/`mark-read`).

- [ ] **Step 1: Write the failing tests**

Add these imports to the top of `backend/notifications/tests/test_views.py` (alongside the existing ones):

```python
from django.utils import timezone

from catalog.models import Category, Product
from notifications.models import CustomerNotification, StockAlertSubscription
```

Add these test classes at the end of the file:

```python
class StockAlertSubscribeViewTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(
            name="Discus", slug="discus", category=self.category, price=1200, stock_quantity=0,
        )

    def test_anonymous_cannot_subscribe(self):
        response = self.client.post("/api/v1/notifications/stock-alerts/", {"product": self.product.id})
        self.assertEqual(response.status_code, 401)

    def test_subscribing_to_an_out_of_stock_product_succeeds(self):
        self.client.force_authenticate(user=self.customer)

        response = self.client.post("/api/v1/notifications/stock-alerts/", {"product": self.product.id})

        self.assertEqual(response.status_code, 204)
        self.assertTrue(
            StockAlertSubscription.objects.filter(
                user=self.customer, product=self.product, notified_at__isnull=True
            ).exists()
        )

    def test_subscribing_to_an_in_stock_product_is_rejected(self):
        self.product.stock_quantity = 5
        self.product.save()
        self.client.force_authenticate(user=self.customer)

        response = self.client.post("/api/v1/notifications/stock-alerts/", {"product": self.product.id})

        self.assertEqual(response.status_code, 400)

    def test_resubscribing_after_being_notified_reactivates_the_subscription(self):
        StockAlertSubscription.objects.create(user=self.customer, product=self.product, notified_at=timezone.now())
        self.client.force_authenticate(user=self.customer)

        response = self.client.post("/api/v1/notifications/stock-alerts/", {"product": self.product.id})

        self.assertEqual(response.status_code, 204)
        subscription = StockAlertSubscription.objects.get(user=self.customer, product=self.product)
        self.assertIsNone(subscription.notified_at)


class CustomerNotificationsViewTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_anonymous_cannot_view(self):
        response = self.client.get("/api/v1/notifications/mine/")
        self.assertEqual(response.status_code, 401)

    def test_only_returns_the_requesting_users_notifications(self):
        CustomerNotification.objects.create(user=self.customer, product=self.product, message="For me")
        CustomerNotification.objects.create(user=self.other, product=self.product, message="Not for me")
        self.client.force_authenticate(user=self.customer)

        response = self.client.get("/api/v1/notifications/mine/")

        data = response.json()
        self.assertEqual(len(data["notifications"]), 1)
        self.assertEqual(data["notifications"][0]["message"], "For me")

    def test_unread_count_reflects_unread_rows(self):
        CustomerNotification.objects.create(user=self.customer, product=self.product, message="Unread")
        self.client.force_authenticate(user=self.customer)

        response = self.client.get("/api/v1/notifications/mine/")

        self.assertEqual(response.json()["unread_count"], 1)


class CustomerNotificationsMarkReadViewTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_marks_all_of_the_requesting_users_unread_notifications_read(self):
        CustomerNotification.objects.create(user=self.customer, product=self.product, message="One")
        CustomerNotification.objects.create(user=self.customer, product=self.product, message="Two")
        self.client.force_authenticate(user=self.customer)

        response = self.client.post("/api/v1/notifications/mine/mark-read/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(CustomerNotification.objects.filter(user=self.customer, read_at__isnull=True).exists())

    def test_does_not_mark_other_users_notifications_read(self):
        other_notification = CustomerNotification.objects.create(user=self.other, product=self.product, message="Not mine")
        self.client.force_authenticate(user=self.customer)

        self.client.post("/api/v1/notifications/mine/mark-read/")

        other_notification.refresh_from_db()
        self.assertIsNone(other_notification.read_at)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test notifications.tests.test_views.StockAlertSubscribeViewTests notifications.tests.test_views.CustomerNotificationsViewTests notifications.tests.test_views.CustomerNotificationsMarkReadViewTests`
Expected: FAIL — 404s (routes don't exist yet).

- [ ] **Step 3: Add the views**

In `backend/notifications/views.py`, add these imports at the top (alongside the existing ones):

```python
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated

from catalog.models import Product

from .models import CustomerNotification, StockAlertSubscription
```

Add these view classes at the end of the file:

```python
class StockAlertSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product = get_object_or_404(Product, pk=request.data.get("product"))
        if product.in_stock:
            return Response({"detail": "This product is already in stock."}, status=status.HTTP_400_BAD_REQUEST)
        StockAlertSubscription.objects.update_or_create(
            user=request.user, product=product, defaults={"notified_at": None}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = CustomerNotification.objects.filter(user=request.user)
        unread_count = queryset.filter(read_at__isnull=True).count()
        latest = queryset.select_related("product")[:20]
        return Response({
            "unread_count": unread_count,
            "notifications": [
                {
                    "id": notification.id,
                    "message": notification.message,
                    "product_slug": notification.product.slug if notification.product else None,
                    "created_at": notification.created_at,
                    "read_at": notification.read_at,
                }
                for notification in latest
            ],
        })


class CustomerNotificationsMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        CustomerNotification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Wire up the URLs**

In `backend/notifications/urls.py`, change:

```python
from .views import AdminNotificationsSeenView, AdminNotificationsView

urlpatterns = [
    path("admin/notifications/", AdminNotificationsView.as_view(), name="admin-notifications"),
    path("admin/notifications/seen/", AdminNotificationsSeenView.as_view(), name="admin-notifications-seen"),
]
```

to:

```python
from .views import (
    AdminNotificationsSeenView, AdminNotificationsView, CustomerNotificationsMarkReadView,
    CustomerNotificationsView, StockAlertSubscribeView,
)

urlpatterns = [
    path("admin/notifications/", AdminNotificationsView.as_view(), name="admin-notifications"),
    path("admin/notifications/seen/", AdminNotificationsSeenView.as_view(), name="admin-notifications-seen"),
    path("notifications/stock-alerts/", StockAlertSubscribeView.as_view(), name="stock-alert-subscribe"),
    path("notifications/mine/", CustomerNotificationsView.as_view(), name="customer-notifications"),
    path("notifications/mine/mark-read/", CustomerNotificationsMarkReadView.as_view(), name="customer-notifications-mark-read"),
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test notifications`
Expected: PASS — all notifications tests, including the pre-existing `AdminNotificationsViewTests` and Task 3's `test_models.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/notifications/views.py backend/notifications/urls.py backend/notifications/tests/test_views.py
git commit -m "feat(notifications): add customer stock-alert subscribe/list/mark-read API"
```

---

### Task 7: Frontend — lightweight specification formatter

**Files:**
- Create: `frontend/src/utils/specFormat.js`
- Create: `frontend/src/utils/specFormat.test.js`

**Interfaces:**
- Produces: `specificationToHtml(text: string) => string` — converts `**bold**` and `- bullet` lines into safe HTML (all other characters HTML-escaped first). Consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/specFormat.test.js`:

```js
import { describe, expect, it } from "vitest";

import { specificationToHtml } from "./specFormat";

describe("specificationToHtml", () => {
  it("returns an empty string for empty content", () => {
    expect(specificationToHtml("")).toBe("");
    expect(specificationToHtml(null)).toBe("");
  });

  it("wraps a plain line in a paragraph", () => {
    expect(specificationToHtml("Hello world")).toBe("<p>Hello world</p>");
  });

  it("converts **bold** to <strong>", () => {
    expect(specificationToHtml("**Tetra Bits** is great.")).toBe("<p><strong>Tetra Bits</strong> is great.</p>");
  });

  it("converts a run of bullet lines into a single <ul>", () => {
    expect(specificationToHtml("- One\n- Two")).toBe("<ul><li>One</li><li>Two</li></ul>");
  });

  it("supports bold text inside bullets", () => {
    expect(specificationToHtml("- **Bold** bullet")).toBe("<ul><li><strong>Bold</strong> bullet</li></ul>");
  });

  it("mixes paragraphs and bullet lists", () => {
    const result = specificationToHtml("Intro line\n- One\n- Two\nOutro line");
    expect(result).toBe("<p>Intro line</p><ul><li>One</li><li>Two</li></ul><p>Outro line</p>");
  });

  it("escapes HTML so admin-authored content cannot inject markup", () => {
    const result = specificationToHtml("<script>alert(1)</script>");
    expect(result).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("skips blank lines between paragraphs", () => {
    expect(specificationToHtml("One\n\nTwo")).toBe("<p>One</p><p>Two</p>");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run src/utils/specFormat.test.js`
Expected: FAIL — `Failed to resolve import "./specFormat"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/specFormat.js`:

```js
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function specificationToHtml(text) {
  if (!text) return "";
  let html = "";
  let inList = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${formatInline(line.slice(2))}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (line) html += `<p>${formatInline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npx vitest run src/utils/specFormat.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/specFormat.js frontend/src/utils/specFormat.test.js
git commit -m "feat(frontend): add lightweight bold/bullet specification formatter"
```

---

### Task 8: Frontend — `SpecificationAccordion` component

**Files:**
- Create: `frontend/src/components/public/SpecificationAccordion.jsx`
- Create: `frontend/src/components/public/SpecificationAccordion.test.jsx`

**Interfaces:**
- Consumes: `specificationToHtml` from Task 7 (`frontend/src/utils/specFormat.js`).
- Produces: default export `SpecificationAccordion({ content })` — renders nothing if `content` is falsy; otherwise a "SPECIFICATION" toggle (collapsed by default) that reveals `specificationToHtml(content)`. Consumed by Task 12.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/public/SpecificationAccordion.test.jsx`:

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SpecificationAccordion from "./SpecificationAccordion";

describe("SpecificationAccordion", () => {
  it("renders nothing when content is empty", () => {
    const { container } = render(<SpecificationAccordion content="" />);
    expect(container.firstChild).toBeNull();
  });

  it("is collapsed by default", () => {
    render(<SpecificationAccordion content="Some spec text" />);
    expect(screen.queryByText("Some spec text")).toBeNull();
  });

  it("shows the content after clicking the toggle", () => {
    render(<SpecificationAccordion content="Some spec text" />);
    fireEvent.click(screen.getByText("SPECIFICATION"));
    expect(screen.getByText("Some spec text")).toBeTruthy();
  });

  it("hides the content again after clicking twice", () => {
    render(<SpecificationAccordion content="Some spec text" />);
    const toggle = screen.getByText("SPECIFICATION");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByText("Some spec text")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run src/components/public/SpecificationAccordion.test.jsx`
Expected: FAIL — `Failed to resolve import "./SpecificationAccordion"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/public/SpecificationAccordion.jsx`:

```jsx
import { useState } from "react";

import { specificationToHtml } from "../../utils/specFormat";

export default function SpecificationAccordion({ content }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!content) return null;

  return (
    <div className="mt-6 border-t pt-4">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center justify-between w-full text-left font-semibold"
        aria-expanded={isOpen}
      >
        SPECIFICATION
        <span className="text-xl leading-none" aria-hidden="true">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && (
        <div
          className="mt-3 text-sm text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
          dangerouslySetInnerHTML={{ __html: specificationToHtml(content) }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npx vitest run src/components/public/SpecificationAccordion.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/SpecificationAccordion.jsx frontend/src/components/public/SpecificationAccordion.test.jsx
git commit -m "feat(frontend): add SpecificationAccordion component"
```

---

### Task 9: Frontend — `NotifyMeButton` component

**Files:**
- Create: `frontend/src/components/public/NotifyMeButton.jsx`
- Create: `frontend/src/components/public/NotifyMeButton.test.jsx`

**Interfaces:**
- Consumes: `apiClient` (`frontend/src/api/client.js`), `useAuth()` (`frontend/src/context/AuthContext.jsx`), `useNavigate()` (`react-router-dom`); `product.id` and `product.stock_alert_subscribed` from Task 4's serializer field.
- Produces: default export `NotifyMeButton({ product })`. Consumed by Task 12.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/public/NotifyMeButton.test.jsx`:

```jsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import NotifyMeButton from "./NotifyMeButton";

vi.mock("../../api/client", () => ({
  apiClient: { post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockAuthState = { isAuthenticated: true };
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const PRODUCT = { id: 1, stock_alert_subscribed: false };

describe("NotifyMeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isAuthenticated: true };
  });

  it("shows 'You'll be notified' and is disabled when already subscribed", () => {
    render(<NotifyMeButton product={{ ...PRODUCT, stock_alert_subscribed: true }} />);
    expect(screen.getByText("You'll be notified").disabled).toBe(true);
  });

  it("redirects to /login when clicked while logged out", () => {
    mockAuthState = { isAuthenticated: false };
    render(<NotifyMeButton product={PRODUCT} />);

    fireEvent.click(screen.getByText("Notify Me"));

    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("subscribes and flips to the notified state when clicked while logged in", async () => {
    apiClient.post.mockResolvedValueOnce({ status: 204 });
    render(<NotifyMeButton product={PRODUCT} />);

    fireEvent.click(screen.getByText("Notify Me"));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/notifications/stock-alerts/", { product: 1 }));
    await waitFor(() => expect(screen.getByText("You'll be notified")).toBeTruthy());
  });

  it("stays in the idle state if the subscribe call fails", async () => {
    apiClient.post.mockRejectedValueOnce(new Error("network"));
    render(<NotifyMeButton product={PRODUCT} />);

    fireEvent.click(screen.getByText("Notify Me"));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Notify Me")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run src/components/public/NotifyMeButton.test.jsx`
Expected: FAIL — `Failed to resolve import "./NotifyMeButton"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/public/NotifyMeButton.jsx`:

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiClient } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

export default function NotifyMeButton({ product }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(product.stock_alert_subscribed ? "subscribed" : "idle");

  const handleClick = async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setStatus("submitting");
    try {
      await apiClient.post("/notifications/stock-alerts/", { product: product.id });
      setStatus("subscribed");
    } catch {
      setStatus("idle");
    }
  };

  if (status === "subscribed") {
    return (
      <button
        type="button"
        disabled
        className="bg-gray-200 text-gray-600 rounded px-4 py-2 font-medium cursor-not-allowed"
      >
        You'll be notified
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "submitting"}
      className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded px-4 py-2 font-medium"
    >
      Notify Me
    </button>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npx vitest run src/components/public/NotifyMeButton.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/NotifyMeButton.jsx frontend/src/components/public/NotifyMeButton.test.jsx
git commit -m "feat(frontend): add NotifyMeButton component"
```

---

### Task 10: Frontend — `CustomerNotificationsContext`

**Files:**
- Create: `frontend/src/context/CustomerNotificationsContext.jsx`
- Create: `frontend/src/context/CustomerNotificationsContext.test.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `apiClient`, `useAuth()` (for `isAuthenticated`/`isStaff`); Task 6's `GET /notifications/mine/` and `POST /notifications/mine/mark-read/`.
- Produces: `CustomerNotificationsProvider` + `useCustomerNotifications()` exposing `{ unreadCount, notifications, markRead }`. Consumed by Task 13.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/context/CustomerNotificationsContext.test.jsx` (structurally mirrors `AdminNotificationsContext.test.jsx`):

```jsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { CustomerNotificationsProvider, useCustomerNotifications } from "./CustomerNotificationsContext";

vi.mock("../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

let mockAuthState = { isAuthenticated: true, isStaff: false };
vi.mock("./AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const EMPTY_RESPONSE = { unread_count: 0, notifications: [] };
const WITH_UNREAD_RESPONSE = {
  unread_count: 2,
  notifications: [
    { id: 1, message: '"Discus" is back in stock.', product_slug: "discus", created_at: "2026-08-25T00:00:00Z", read_at: null },
  ],
};

describe("CustomerNotificationsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isAuthenticated: true, isStaff: false };
  });

  it("fetches notifications on mount for an authenticated customer", async () => {
    apiClient.get.mockResolvedValueOnce({ data: EMPTY_RESPONSE });

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/notifications/mine/"));
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });

  it("does not fetch for staff", async () => {
    mockAuthState = { isAuthenticated: true, isStaff: true };

    renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => {});
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("does not fetch when logged out", async () => {
    mockAuthState = { isAuthenticated: false, isStaff: false };

    renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => {});
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("stores unread count and notifications from the response", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(result.current.notifications).toEqual(WITH_UNREAD_RESPONSE.notifications);
  });

  it("polls again after 30 seconds while authenticated", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiClient.get.mockResolvedValue({ data: EMPTY_RESPONSE });

    renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("markRead posts to mark-read and zeroes unread count locally", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });
    apiClient.post.mockResolvedValueOnce({ status: 204 });

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.markRead();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/notifications/mine/mark-read/");
    expect(result.current.unreadCount).toBe(0);
  });

  it("resets to empty state on a fetch error", async () => {
    apiClient.get.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useCustomerNotifications(), { wrapper: CustomerNotificationsProvider });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.notifications).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run src/context/CustomerNotificationsContext.test.jsx`
Expected: FAIL — `Failed to resolve import "./CustomerNotificationsContext"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/context/CustomerNotificationsContext.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "./AuthContext";

const CustomerNotificationsContext = createContext(null);

const EMPTY_STATE = { unreadCount: 0, notifications: [] };
const POLL_INTERVAL_MS = 30000;

export function CustomerNotificationsProvider({ children }) {
  const { isAuthenticated, isStaff } = useAuth();
  const isCustomer = isAuthenticated && !isStaff;
  const [state, setState] = useState(EMPTY_STATE);

  const refresh = useCallback(() => {
    if (!isCustomer) {
      setState(EMPTY_STATE);
      return Promise.resolve();
    }
    return apiClient
      .get("/notifications/mine/")
      .then((response) => {
        setState({ unreadCount: response.data.unread_count, notifications: response.data.notifications });
      })
      .catch(() => setState(EMPTY_STATE));
  }, [isCustomer]);

  useEffect(() => {
    refresh();
    if (!isCustomer) return undefined;
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isCustomer, refresh]);

  const markRead = async () => {
    await apiClient.post("/notifications/mine/mark-read/");
    setState((prev) => ({ ...prev, unreadCount: 0 }));
  };

  return (
    <CustomerNotificationsContext.Provider value={{ ...state, refresh, markRead }}>
      {children}
    </CustomerNotificationsContext.Provider>
  );
}

export function useCustomerNotifications() {
  return useContext(CustomerNotificationsContext);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npx vitest run src/context/CustomerNotificationsContext.test.jsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Register the provider**

In `frontend/src/main.jsx`, change:

```jsx
import App from "./App";
import { AdminNotificationsProvider } from "./context/AdminNotificationsContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AdminNotificationsProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AdminNotificationsProvider>
    </AuthProvider>
  </StrictMode>,
);
```

to:

```jsx
import App from "./App";
import { AdminNotificationsProvider } from "./context/AdminNotificationsContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { CustomerNotificationsProvider } from "./context/CustomerNotificationsContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AdminNotificationsProvider>
        <CustomerNotificationsProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </CustomerNotificationsProvider>
      </AdminNotificationsProvider>
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/context/CustomerNotificationsContext.jsx frontend/src/context/CustomerNotificationsContext.test.jsx frontend/src/main.jsx
git commit -m "feat(frontend): add CustomerNotificationsContext"
```

---

### Task 11: Frontend — admin form Note/Specification fields

**Files:**
- Modify: `frontend/src/pages/admin/ProductsManager.jsx`

**Interfaces:**
- Consumes: Task 2's `note`/`specification` fields on the product API.
- Produces: no new exported interface — the existing create/edit form payload now includes `note` and `specification` keys (both optional).

- [ ] **Step 1: Add the fields to form state**

In `frontend/src/pages/admin/ProductsManager.jsx`, the initial `useState` (around line 13) and `resetForm` (around line 49) both currently look like:

```js
    name: "",
    slug: "",
    category: "",
    price: "",
    description: "",
    stock_quantity: 0,
    is_featured: false,
```

Change both occurrences to:

```js
    name: "",
    slug: "",
    category: "",
    price: "",
    description: "",
    note: "",
    specification: "",
    stock_quantity: 0,
    is_featured: false,
```

- [ ] **Step 2: Populate the fields on edit**

In `startEdit` (around line 68), change:

```js
      description: product.description || "",
      stock_quantity: product.stock_quantity,
```

to:

```js
      description: product.description || "",
      note: product.note || "",
      specification: product.specification || "",
      stock_quantity: product.stock_quantity,
```

- [ ] **Step 3: Add the textareas to the form JSX**

In the form (around line 246), change:

```jsx
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-3 py-2" />
```

to:

```jsx
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-3 py-2" />
            <textarea placeholder="Note (optional, e.g. 'Free home delivery')" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="border rounded px-3 py-2" />
            <div>
              <textarea
                placeholder="Specification (optional)"
                value={form.specification}
                onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="border rounded px-3 py-2 w-full"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">
                Use **bold** and lines starting with "- " for bullet points.
              </p>
            </div>
```

Note: `payload` in `handleSubmit` already spreads `...form`, so `note`/`specification` are included in the submitted body automatically — no change needed there.

- [ ] **Step 4: Manual verification**

Start both servers (`python manage.py runserver` in `backend/`, `npm run dev` in `frontend/`). Log in as staff, go to `/admin/products`, edit an existing product: confirm the Note and Specification textareas appear, are empty by default, accept text, and save successfully. Reopen the edit form for that same product and confirm both fields are pre-filled with what was saved. Create a brand-new product leaving both fields blank and confirm it still saves.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ProductsManager.jsx
git commit -m "feat(admin): add optional Note and Specification fields to the product form"
```

---

### Task 12: Frontend — `ProductDetail` integration

**Files:**
- Modify: `frontend/src/pages/public/ProductDetail.jsx`

**Interfaces:**
- Consumes: `Modal` (Task 1, `../../components/common/Modal`), `SpecificationAccordion` (Task 8), `NotifyMeButton` (Task 9), `product.note`/`product.specification`/`product.stock_alert_subscribed` (Tasks 2 & 4).
- Produces: no new exported interface — this is the page wiring everything together.

- [ ] **Step 1: Update imports**

In `frontend/src/pages/public/ProductDetail.jsx`, change:

```jsx
import { apiClient } from "../../api/client";
import Breadcrumbs from "../../components/public/Breadcrumbs";
import InquiryForm from "../../components/public/InquiryForm";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
```

to:

```jsx
import { apiClient } from "../../api/client";
import Breadcrumbs from "../../components/public/Breadcrumbs";
import Modal from "../../components/common/Modal";
import InquiryForm from "../../components/public/InquiryForm";
import NotifyMeButton from "../../components/public/NotifyMeButton";
import SpecificationAccordion from "../../components/public/SpecificationAccordion";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
```

- [ ] **Step 2: Add modal-open state**

Change:

```jsx
  const [status, setStatus] = useState("idle"); // idle | adding | added | error
  const [cartError, setCartError] = useState("");
```

to:

```jsx
  const [status, setStatus] = useState("idle"); // idle | adding | added | error
  const [cartError, setCartError] = useState("");
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);
```

- [ ] **Step 3: Replace the out-of-stock span with the Notify Me button**

Change:

```jsx
            ) : (
              <span className="text-red-600 font-medium">Out of stock</span>
            )}
          </div>
          {cartError && <p className="text-red-600 text-sm mt-2">{cartError}</p>}

          <h2 className="text-xl font-semibold mt-8 mb-3">Enquire about this product</h2>
          <InquiryForm type="product" product={product} />
        </div>
      </div>
    </div>
  );
}
```

to:

```jsx
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-red-600 font-medium">Out of stock</span>
                <NotifyMeButton key={product.id} product={product} />
              </div>
            )}
          </div>
          {cartError && <p className="text-red-600 text-sm mt-2">{cartError}</p>}

          {product.note && (
            <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              <span className="font-semibold">Note: </span>
              {product.note}
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsEnquiryOpen(true)}
            className="mt-6 border border-brand-dark rounded px-4 py-2 font-medium hover:bg-brand-dark hover:text-white transition-colors"
          >
            Enquire about this product
          </button>
          {isEnquiryOpen && (
            <Modal title="Enquire about this product" onClose={() => setIsEnquiryOpen(false)}>
              <InquiryForm type="product" product={product} />
            </Modal>
          )}

          <SpecificationAccordion content={product.specification} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Start both servers. As staff, set a product's stock to 0 and add a Note and Specification (with a `**bold**` phrase and a couple of `- bullet` lines) via `/admin/products`. Visit that product's public detail page (`/product/<slug>`):
- Confirm "Out of stock" shows with a red "Notify Me" button instead of the Add-to-Cart controls.
- Confirm the Note renders as a small highlighted callout.
- Confirm "Enquire about this product" is now a button; clicking it opens the enquiry form in a modal (backdrop click, Escape, and × all close it); submitting still shows the existing "Thanks! We'll get back to you shortly." message inside the modal.
- Confirm the "SPECIFICATION" accordion is collapsed by default, and clicking it reveals the bold text and bullet list correctly formatted.
- Log in as a customer, click Notify Me, confirm it flips to a disabled "You'll be notified".
- Log out and click Notify Me on a fresh out-of-stock product page, confirm it redirects to `/login`.
- Confirm a product with blank note/specification shows neither the callout nor the accordion.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/public/ProductDetail.jsx
git commit -m "feat(public): enquiry-as-modal, note callout, specification accordion, notify me"
```

---

### Task 13: Frontend — customer notification bell in `Header`

**Files:**
- Modify: `frontend/src/components/public/Header.jsx`

**Interfaces:**
- Consumes: `useCustomerNotifications()` from Task 10.
- Produces: no new exported interface — adds a bell/dropdown UI for logged-in customers, mirroring the existing staff bell.

- [ ] **Step 1: Import the hook and read its state**

Change:

```jsx
import { useAdminNotifications } from "../../context/AdminNotificationsContext";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
```

to:

```jsx
import { useAdminNotifications } from "../../context/AdminNotificationsContext";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useCustomerNotifications } from "../../context/CustomerNotificationsContext";
```

Change:

```jsx
export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifSnapshot, setNotifSnapshot] = useState({ orders: [], inquiries: [] });
  const { isAuthenticated, isStaff, profile, logout } = useAuth();
  const isCustomerAuthenticated = isAuthenticated && !isStaff;
  const { itemCount } = useCart();
  const { unreadOrdersCount, unreadInquiriesCount, latestOrders, latestInquiries, markSeen } = useAdminNotifications();
```

to:

```jsx
export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifSnapshot, setNotifSnapshot] = useState({ orders: [], inquiries: [] });
  const [isCustomerNotifOpen, setIsCustomerNotifOpen] = useState(false);
  const [customerNotifSnapshot, setCustomerNotifSnapshot] = useState([]);
  const { isAuthenticated, isStaff, profile, logout } = useAuth();
  const isCustomerAuthenticated = isAuthenticated && !isStaff;
  const { itemCount } = useCart();
  const { unreadOrdersCount, unreadInquiriesCount, latestOrders, latestInquiries, markSeen } = useAdminNotifications();
  const {
    unreadCount: customerUnreadCount,
    notifications: customerNotifications,
    markRead: markCustomerNotificationsRead,
  } = useCustomerNotifications();
```

- [ ] **Step 2: Add the toggle handler**

After the existing `toggleNotifDropdown` function, add:

```jsx
  const toggleCustomerNotifDropdown = () => {
    const opening = !isCustomerNotifOpen;
    if (opening) {
      setCustomerNotifSnapshot(customerNotifications);
    }
    setIsCustomerNotifOpen(opening);
    if (opening && customerUnreadCount > 0) markCustomerNotificationsRead();
  };
```

- [ ] **Step 3: Add the bell UI**

Change:

```jsx
            {isCustomerAuthenticated && (
              <Link
                to="/account/addresses"
                className="hidden sm:inline whitespace-nowrap text-sm px-3 py-1.5 hover:text-brand-aqua transition-colors"
              >
                Hi, {profile?.name?.split(" ")[0] || "there"}
              </Link>
            )}
```

to:

```jsx
            {isCustomerAuthenticated && (
              <Link
                to="/account/addresses"
                className="hidden sm:inline whitespace-nowrap text-sm px-3 py-1.5 hover:text-brand-aqua transition-colors"
              >
                Hi, {profile?.name?.split(" ")[0] || "there"}
              </Link>
            )}
            {isCustomerAuthenticated && (
              <div className="relative">
                <button
                  type="button"
                  aria-label={`Notifications, ${customerUnreadCount} unread`}
                  className="relative p-2 hover:text-brand-aqua"
                  onClick={toggleCustomerNotifDropdown}
                >
                  <BellIcon className="h-5 w-5" />
                  {customerUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                      {customerUnreadCount > 9 ? "9+" : customerUnreadCount}
                    </span>
                  )}
                </button>
                {isCustomerNotifOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white text-brand-dark rounded-lg shadow-xl border z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b font-semibold text-sm">Notifications</div>
                    {customerNotifSnapshot.length === 0 && (
                      <p className="p-3 text-sm text-gray-500">No new notifications.</p>
                    )}
                    {customerNotifSnapshot.map((notification) =>
                      notification.product_slug ? (
                        <Link
                          key={notification.id}
                          to={`/product/${notification.product_slug}`}
                          onClick={() => setIsCustomerNotifOpen(false)}
                          className="block p-3 text-sm border-b hover:bg-gray-50"
                        >
                          {notification.message}
                        </Link>
                      ) : (
                        <p key={notification.id} className="p-3 text-sm border-b">
                          {notification.message}
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 4: Manual verification**

With both servers running, log in as a customer who previously clicked Notify Me on a since-restocked product (from Task 12's manual check — as staff, restock that product). Confirm the bell shows an unread badge on the customer header, and opening it lists "\"<Product>\" is back in stock." linking to that product's page, and the badge clears after opening. Confirm the bell does not appear for staff or logged-out visitors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/Header.jsx
git commit -m "feat(public): add customer stock-alert notification bell to header"
```

---

## Self-Review Notes

- **Spec coverage:** §5 (enquiry modal) → Tasks 1, 12. §3/§6 (note/specification) → Tasks 2, 7, 8, 11, 12. §4 (restock detection + API) → Tasks 3, 5, 6. §7 (Notify Me button) → Tasks 9, 12. §8 (customer bell) → Tasks 10, 13. §1 item 3 (automatic out-of-stock) required no task — confirmed already implemented, documented in the spec only.
- **Type/name consistency checked:** `notify_restock(product)` (Task 5) matches its only call sites (Task 5 itself). `stock_alert_subscribed` (Task 4) matches what `NotifyMeButton` (Task 9) and `ProductDetail` (Task 12) read. `specificationToHtml` (Task 7) matches its only import (Task 8). Context shape `{ unreadCount, notifications, markRead }` (Task 10) matches what `Header.jsx` destructures (Task 13).
- **No placeholders**: every step above has literal code, not descriptions of code.
