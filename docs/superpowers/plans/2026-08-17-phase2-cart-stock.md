# Phase 2 Sub-Plan 2: Cart & Stock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give products a real stock quantity, and let a logged-in customer add in-stock products to a running cart, change quantities, and remove items — with the server always enforcing that cart quantity never exceeds available stock.

**Architecture:** `Product.in_stock` (a stored boolean) is replaced by `Product.stock_quantity` (a real integer), with `in_stock` becoming a computed model property (`stock_quantity > 0`) so no existing Phase 1 frontend code needs to change. A new `cart` Django app holds `Cart` (one per user, created lazily) and `CartItem` (unique per cart+product), with three endpoints: `GET /api/v1/cart/` (read), `POST /api/v1/cart/items/` (add/increment), `PATCH|DELETE /api/v1/cart/items/<id>/` (update/remove) — every mutation returns the *whole* updated cart so the frontend never has to merge partial state. On the frontend, a new `CartContext` (mirroring `CustomerAuthContext`'s pattern, nested inside it) holds cart state application-wide, consumed by product listing/detail pages (Add to Cart), a new `/cart` page, and a header cart icon with a live item-count badge.

**Tech Stack:** Django 5 + DRF (backend, already installed), React 19 + React Router 7 + axios + Tailwind v4 (frontend, already installed). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md` (§4.3 Cart/CartItem, §4.5 Stock, §5 cart endpoints, §6 steps 3-4); SRS FR-5 through FR-7, FR-24, FR-25.

## Global Constraints

- Adding to cart or viewing/changing a cart requires login — no guest cart (FR-4, already enforced by the existing `CustomerGuard`/`IsAuthenticated` pattern from Sub-plan 1).
- A cart quantity can never exceed the product's current `stock_quantity` — enforced server-side on every add/update (FR-7).
- A product with `stock_quantity` of zero is "out of stock" and cannot be added to a cart (FR-25).
- `stock_quantity` is editable by staff from the same admin screen (`ProductsManager`) used to edit other product fields (FR-24).
- Existing Phase 1 code that reads `product.in_stock` (there is none outside `catalog/admin.py`, `catalog/serializers.py`, and one test — verified) keeps working: `in_stock` remains present, just computed instead of stored.
- Existing Sub-plan 1 code (`accounts` app, `CustomerAuthContext`, `AuthContext`, admin auth) is untouched by this sub-plan.
- Responsive on mobile and desktop, using the site's existing Tailwind design tokens (`brand-dark`, `brand-light`, `brand-aqua`, `brand-forest`).

## Decisions (resolved before implementation)

- **Stock migration backfill:** existing products with the old `in_stock=True` get `stock_quantity=10` (existing dev/demo data doesn't silently look "out of stock" after migrating); products with `in_stock=False` get `stock_quantity=0`. Staff can adjust real quantities afterward in the admin.
- **Seed data:** `seed_data.py`'s three demo products get explicit `stock_quantity` values (20 / 30 / 5) so a fresh dev environment can exercise cart features immediately without manual admin edits first.
- **`Product.test_models.py`'s existing assertion `assertTrue(product.in_stock)`** on a freshly created product (no explicit stock) is now wrong under the new default (`stock_quantity` defaults to 0, so a brand-new product starts out of stock — the more correct real-world default) and is updated to `assertFalse` as part of Task 1, with a new test added covering the true/false transition.
- **Mutation response shape:** `POST /cart/items/`, `PATCH /cart/items/<id>/`, and `DELETE /cart/items/<id>/` all return the *entire* updated cart (200, including for DELETE — a deliberate departure from a bare 204 so the frontend gets the fresh subtotal/item list in one round trip without a follow-up `GET`).
- **No "Proceed to Checkout" button yet** — the `/cart` page in this sub-plan only covers view/add/change-quantity/remove + subtotal (FR-6). Checkout is Sub-plan 3; adding a disabled placeholder button now would promise something not yet functional.
- **API client split on product pages** (flagged as an open decision by Sub-plan 1's final review): `ProductCard.jsx` and `ProductDetail.jsx` keep reading product data through the existing public `apiClient` (unauthenticated, unchanged) and only route the new *cart-mutating* calls (`addItem`) through `customerApiClient`, via `CartContext`. Product data itself needs no customer auth to read; only adding to a cart does.

## Delivery order

Five backend tasks, then five frontend tasks, each independently testable:

1. `Product.stock_quantity` migration + derived `in_stock` property (catalog app)
2. `cart` app scaffold — `Cart`/`CartItem` models, admin, migration
3. `GET /api/v1/cart/` — read the current user's cart
4. `POST /api/v1/cart/items/` — add/increment, with stock validation
5. `PATCH`/`DELETE /api/v1/cart/items/<id>/` — update/remove, with stock validation and ownership scoping
6. `CartContext` (frontend) — cart state + mutation methods, mirroring `CustomerAuthContext`
7. `ProductsManager.jsx` — replace the "In stock" checkbox with a `stock_quantity` number field
8. `ProductCard.jsx` + `ProductDetail.jsx` — Add to Cart, stock display, quantity selector
9. `Cart.jsx` page + `/cart` route (guarded)
10. Header cart icon + item-count badge

---

## Task 1: `Product.stock_quantity` migration + derived `in_stock`

**Files:**
- Modify: `backend/catalog/models.py:25-39` (Product model)
- Modify: `backend/catalog/admin.py:9-13` (ProductAdmin)
- Modify: `backend/catalog/serializers.py:18-26` (ProductSerializer)
- Modify: `backend/catalog/management/commands/seed_data.py:17-29`
- Modify: `backend/catalog/tests/test_models.py:17-29`
- Create: `backend/catalog/migrations/0004_product_stock_quantity.py`
- Create: `backend/catalog/tests/test_stock.py`

**Interfaces:**
- Produces: `Product.stock_quantity` (int, default 0), `Product.in_stock` (read-only property, `stock_quantity > 0`) — consumed by Tasks 3-10.

- [ ] **Step 1: Write the failing tests**

Replace the `ProductModelTests.test_str_returns_name` body in `backend/catalog/tests/test_models.py` (the file already exists — only this one test changes; everything else in the file stays as-is):

```python
class ProductModelTests(TestCase):
    def test_str_returns_name(self):
        category = Category.objects.create(name="Tanks", slug="tanks")
        product = Product.objects.create(
            name="60cm Rimless Tank",
            slug="60cm-rimless-tank",
            category=category,
            description="A 60cm rimless glass tank.",
            price=4500,
        )
        self.assertEqual(str(product), "60cm Rimless Tank")
        self.assertFalse(product.in_stock)
        self.assertFalse(product.is_featured)
```

Create `backend/catalog/tests/test_stock.py`:

```python
from django.test import TestCase

from catalog.models import Category, Product


class StockQuantityTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Tanks", slug="tanks")

    def test_defaults_to_zero_and_out_of_stock(self):
        product = Product.objects.create(name="Tank", slug="tank-a", category=self.category, price=100)
        self.assertEqual(product.stock_quantity, 0)
        self.assertFalse(product.in_stock)

    def test_in_stock_true_once_quantity_positive(self):
        product = Product.objects.create(
            name="Tank", slug="tank-b", category=self.category, price=100, stock_quantity=5
        )
        self.assertTrue(product.in_stock)

    def test_in_stock_false_after_quantity_drops_to_zero(self):
        product = Product.objects.create(
            name="Tank", slug="tank-c", category=self.category, price=100, stock_quantity=5
        )
        product.stock_quantity = 0
        product.save()
        self.assertFalse(product.in_stock)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test catalog.tests.test_stock catalog.tests.test_models -v 2`
Expected: `test_stock.py` fails with `TypeError: create() got an unexpected keyword argument 'stock_quantity'` (field doesn't exist yet); `test_models.py`'s updated assertion fails because `in_stock` is still the old stored `True` default.

- [ ] **Step 3: Update the model, admin, and serializer**

`backend/catalog/models.py` — replace the `Product` class (only this class; `Category`, `ProductImage`, `PortfolioItem`, `BlogPost`, `Video`, and `YOUTUBE_ID_PATTERN` are untouched):

```python
class Product(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=210, unique=True)
    category = models.ForeignKey(Category, related_name="products", on_delete=models.CASCADE)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=0)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def in_stock(self):
        return self.stock_quantity > 0
```

`backend/catalog/admin.py` — replace the `ProductAdmin` class only:

```python
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "category", "price", "stock_quantity", "in_stock", "is_featured"]
    list_filter = ["category", "is_featured"]
    search_fields = ["name", "slug"]
```

(`"in_stock"` remains valid in `list_display` — Django admin can display a read-only model property — but it's removed from `list_filter`, which requires an actual field or a custom `SimpleListFilter`; filtering by the exact `stock_quantity` integer isn't useful either, so neither is filterable.)

`backend/catalog/serializers.py` — replace the `ProductSerializer` class only:

```python
class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "category", "description", "price",
            "stock_quantity", "in_stock", "is_featured", "created_at", "images",
        ]
```

(DRF's `ModelSerializer` automatically treats `in_stock` as a read-only field since it isn't a real model field — no explicit `serializers.ReadOnlyField()` declaration is needed, but if `python manage.py test` shows `in_stock` being rejected as writable, add `read_only_fields = ["in_stock"]` to `Meta`.)

`backend/catalog/management/commands/seed_data.py` — add `stock_quantity` to each of the three `Product.objects.get_or_create(...)` calls' `defaults` dict:

```python
        Product.objects.get_or_create(
            slug="red-discus",
            defaults={"name": "Red Discus", "category": fish, "price": 1500,
                      "description": "Vibrant red discus, 3 inch.", "stock_quantity": 20},
        )
        Product.objects.get_or_create(
            slug="anubias-nana",
            defaults={"name": "Anubias Nana", "category": plants, "price": 250,
                      "description": "Hardy low-light aquarium plant.", "stock_quantity": 30},
        )
        Product.objects.get_or_create(
            slug="60cm-rimless-tank",
            defaults={"name": "60cm Rimless Tank", "category": tanks, "price": 4500, "is_featured": True,
                      "description": "Ultra-clear 60cm rimless glass tank.", "stock_quantity": 5},
        )
```

- [ ] **Step 4: Write the migration**

Create `backend/catalog/migrations/0004_product_stock_quantity.py`:

```python
from django.db import migrations, models


def backfill_stock_quantity(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    Product.objects.filter(in_stock=True).update(stock_quantity=10)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_category_banner_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="stock_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(backfill_stock_quantity, noop_reverse),
        migrations.RemoveField(
            model_name="product",
            name="in_stock",
        ),
    ]
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && python manage.py migrate catalog`
Expected: `Applying catalog.0004_product_stock_quantity... OK`

Run: `cd backend && python manage.py test catalog -v 2`
Expected: `OK` — all `catalog` app tests pass (including the updated `test_models.py` and new `test_stock.py`).

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full suite passes (78 baseline + new stock tests).

- [ ] **Step 6: Commit**

```bash
git add backend/catalog/models.py backend/catalog/admin.py backend/catalog/serializers.py backend/catalog/management/commands/seed_data.py backend/catalog/tests/test_models.py backend/catalog/tests/test_stock.py backend/catalog/migrations/0004_product_stock_quantity.py
git commit -m "feat(catalog): replace Product.in_stock with a real stock_quantity"
```

---

## Task 2: `cart` app — Cart/CartItem models, admin, migration

**Files:**
- Create: `backend/cart/__init__.py` (empty)
- Create: `backend/cart/apps.py`
- Create: `backend/cart/models.py`
- Create: `backend/cart/admin.py`
- Create: `backend/cart/migrations/__init__.py` (empty)
- Create: `backend/cart/migrations/0001_initial.py` (generated by `makemigrations`, see Step 4)
- Create: `backend/cart/tests/__init__.py` (empty)
- Create: `backend/cart/tests/test_models.py`
- Modify: `backend/config/settings/base.py` (add `"cart"` to `INSTALLED_APPS`)

**Interfaces:**
- Consumes: `catalog.models.Product` (existing).
- Produces: `cart.models.Cart` (`user` OneToOne → `User`, `related_name="cart"`), `cart.models.CartItem` (`cart` FK, `product` FK, `quantity`, unique together on `(cart, product)`) — consumed by Tasks 3-5.

- [ ] **Step 1: Scaffold the app and write the failing model tests**

Run: `cd backend && python manage.py startapp cart` (delete the generated `cart/views.py`, `cart/tests.py`, and `cart/migrations/` placeholder — this task creates `tests/` as a package and `views.py` comes in Task 3).

Create `backend/cart/tests/__init__.py` (empty) and `backend/cart/tests/test_models.py`:

```python
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from cart.models import Cart, CartItem
from catalog.models import Category, Product

User = get_user_model()


class CartModelTests(TestCase):
    def test_str_includes_user(self):
        user = User.objects.create_user(username="a@example.com", password="pw12345678")
        cart = Cart.objects.create(user=user)
        self.assertIn(str(user), str(cart))

    def test_one_cart_per_user(self):
        user = User.objects.create_user(username="b@example.com", password="pw12345678")
        Cart.objects.create(user=user)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Cart.objects.create(user=user)


class CartItemModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="c@example.com", password="pw12345678")
        self.cart = Cart.objects.create(user=self.user)
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price=100, stock_quantity=10
        )

    def test_str_includes_quantity_and_product(self):
        item = CartItem.objects.create(cart=self.cart, product=self.product, quantity=3)
        self.assertEqual(str(item), "3 x Tank")

    def test_unique_together_cart_and_product(self):
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)

    def test_default_quantity_is_one(self):
        item = CartItem.objects.create(cart=self.cart, product=self.product)
        self.assertEqual(item.quantity, 1)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test cart.tests.test_models -v 2`
Expected: `ModuleNotFoundError: No module named 'cart.models'` (or similar) — app isn't registered/models don't exist yet.

- [ ] **Step 3: Write the models and admin**

`backend/cart/apps.py`:

```python
from django.apps import AppConfig


class CartConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "cart"
```

`backend/cart/models.py`:

```python
from django.conf import settings
from django.db import models

from catalog.models import Product


class Cart(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart for {self.user}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("cart", "product")

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"
```

`backend/cart/admin.py`:

```python
from django.contrib import admin

from .models import Cart, CartItem


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["user", "updated_at"]
    search_fields = ["user__username"]


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ["cart", "product", "quantity"]
    search_fields = ["cart__user__username", "product__name"]
```

In `backend/config/settings/base.py`, add `"cart"` to `INSTALLED_APPS` (after `"accounts"`):

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
]
```

- [ ] **Step 4: Generate the migration and run the tests**

Run: `cd backend && python manage.py makemigrations cart`
Expected: `Migrations for 'cart': cart/migrations/0001_initial.py ... - Create model Cart ... - Create model CartItem`

Run: `cd backend && python manage.py test cart.tests.test_models -v 2`
Expected: `OK` (6 tests pass)

- [ ] **Step 5: Commit**

```bash
git add backend/cart backend/config/settings/base.py
git commit -m "feat(cart): add Cart and CartItem models"
```

---

## Task 3: `GET /api/v1/cart/`

**Files:**
- Create: `backend/cart/serializers.py`
- Create: `backend/cart/views.py`
- Create: `backend/cart/urls.py`
- Create: `backend/cart/tests/test_views.py`
- Modify: `backend/config/urls.py` (mount `cart.urls`)

**Interfaces:**
- Consumes: `cart.models.Cart`, `cart.models.CartItem` (Task 2).
- Produces: `cart.serializers.CartSerializer`, `cart.serializers.CartItemSerializer` (consumed by Tasks 4-5); `GET /api/v1/cart/` → `{id, items: [...], subtotal}` where each item is `{id, product, product_name, product_slug, product_price, product_stock_quantity, product_image, quantity, line_total}`.

- [ ] **Step 1: Write the failing tests**

`backend/cart/tests/test_views.py`:

```python
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from catalog.models import Category, Product

User = get_user_model()


class CartDetailViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.category = Category.objects.create(name="Tanks", slug="tanks")

    def test_requires_authentication(self):
        response = self.client.get("/api/v1/cart/")
        self.assertEqual(response.status_code, 401)

    def test_returns_empty_structure_when_no_cart_exists(self):
        response = self.client.get("/api/v1/cart/", **self.auth_header)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": None, "items": [], "subtotal": "0.00"})

    def test_returns_items_and_subtotal(self):
        product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=10
        )
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=product, quantity=3)

        response = self.client.get("/api/v1/cart/", **self.auth_header)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["subtotal"], "300.00")
        self.assertEqual(len(data["items"]), 1)
        item = data["items"][0]
        self.assertEqual(item["product_name"], "Tank")
        self.assertEqual(item["product_slug"], "tank")
        self.assertEqual(item["quantity"], 3)
        self.assertEqual(item["line_total"], "300.00")
        self.assertEqual(item["product_stock_quantity"], 10)

    def test_only_returns_own_cart(self):
        other = User.objects.create_user(username="b@example.com", password="pw12345678")
        product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=10
        )
        other_cart = Cart.objects.create(user=other)
        CartItem.objects.create(cart=other_cart, product=product, quantity=1)

        response = self.client.get("/api/v1/cart/", **self.auth_header)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": None, "items": [], "subtotal": "0.00"})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test cart.tests.test_views -v 2`
Expected: 404s — no `/api/v1/cart/` route exists yet.

- [ ] **Step 3: Implement**

`backend/cart/serializers.py`:

```python
from rest_framework import serializers

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    product_price = serializers.DecimalField(source="product.price", max_digits=10, decimal_places=2, read_only=True)
    product_stock_quantity = serializers.IntegerField(source="product.stock_quantity", read_only=True)
    product_image = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            "id", "product", "product_name", "product_slug", "product_price",
            "product_stock_quantity", "product_image", "quantity", "line_total",
        ]

    def get_product_image(self, obj):
        image = obj.product.images.first()
        if not image or not image.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(image.image.url) if request else image.image.url

    def get_line_total(self, obj):
        return str(obj.product.price * obj.quantity)


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "items", "subtotal"]

    def get_subtotal(self, obj):
        total = sum((item.product.price * item.quantity for item in obj.items.all()), start=0)
        return f"{total:.2f}"
```

`backend/cart/views.py`:

```python
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cart
from .serializers import CartSerializer

EMPTY_CART = {"id": None, "items": [], "subtotal": "0.00"}


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product__images").first()
        if not cart:
            return Response(EMPTY_CART)
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)
```

`backend/cart/urls.py`:

```python
from django.urls import path

from .views import CartDetailView

urlpatterns = [
    path("cart/", CartDetailView.as_view(), name="cart-detail"),
]
```

In `backend/config/urls.py`, add `path("api/v1/", include("cart.urls"))` after the `accounts.urls` include:

```python
    path("api/v1/", include("catalog.urls")),
    path("api/v1/", include("inquiries.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("cart.urls")),
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test cart -v 2`
Expected: `OK` (10 tests pass — 6 from Task 2 + 4 new)

- [ ] **Step 5: Commit**

```bash
git add backend/cart/serializers.py backend/cart/views.py backend/cart/urls.py backend/cart/tests/test_views.py backend/config/urls.py
git commit -m "feat(cart): add GET /api/v1/cart/ to read the current user's cart"
```

---

## Task 4: `POST /api/v1/cart/items/`

**Files:**
- Modify: `backend/cart/views.py` (add `AddCartItemView`)
- Modify: `backend/cart/urls.py` (add the `cart/items/` route)
- Modify: `backend/cart/tests/test_views.py` (add `AddCartItemViewTests`)

**Interfaces:**
- Consumes: `cart.serializers.CartSerializer`, `cart.models.Cart`, `cart.models.CartItem` (Tasks 2-3).
- Produces: `POST /api/v1/cart/items/` → 201, body = the full updated `CartSerializer` output; 400 with `{"quantity": [...]}`-shaped errors on stock violations.

- [ ] **Step 1: Write the failing tests**

Append to `backend/cart/tests/test_views.py` (add these imports at the top alongside the existing ones: `from django.db import transaction` is not needed here, but add `from rest_framework.test import APITestCase` is already present):

```python
class AddCartItemViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5
        )

    def test_requires_authentication(self):
        response = self.client.post("/api/v1/cart/items/", {"product": self.product.id, "quantity": 1})
        self.assertEqual(response.status_code, 401)

    def test_creates_cart_and_item_on_first_add(self):
        response = self.client.post(
            "/api/v1/cart/items/", {"product": self.product.id, "quantity": 2}, **self.auth_header
        )
        self.assertEqual(response.status_code, 201)
        cart = Cart.objects.get(user=self.user)
        item = CartItem.objects.get(cart=cart, product=self.product)
        self.assertEqual(item.quantity, 2)
        self.assertEqual(response.json()["subtotal"], "200.00")

    def test_adding_same_product_again_increments_quantity(self):
        self.client.post("/api/v1/cart/items/", {"product": self.product.id, "quantity": 2}, **self.auth_header)
        response = self.client.post(
            "/api/v1/cart/items/", {"product": self.product.id, "quantity": 1}, **self.auth_header
        )
        self.assertEqual(response.status_code, 201)
        item = CartItem.objects.get(cart__user=self.user, product=self.product)
        self.assertEqual(item.quantity, 3)

    def test_rejects_quantity_exceeding_stock(self):
        response = self.client.post(
            "/api/v1/cart/items/", {"product": self.product.id, "quantity": 6}, **self.auth_header
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("quantity", response.json())

    def test_rejects_when_combined_quantity_would_exceed_stock(self):
        self.client.post("/api/v1/cart/items/", {"product": self.product.id, "quantity": 4}, **self.auth_header)
        response = self.client.post(
            "/api/v1/cart/items/", {"product": self.product.id, "quantity": 2}, **self.auth_header
        )
        self.assertEqual(response.status_code, 400)
        item = CartItem.objects.get(cart__user=self.user, product=self.product)
        self.assertEqual(item.quantity, 4)

    def test_rejects_out_of_stock_product(self):
        out_of_stock = Product.objects.create(
            name="Sold Out Tank", slug="sold-out-tank", category=self.category, price="50.00", stock_quantity=0
        )
        response = self.client.post(
            "/api/v1/cart/items/", {"product": out_of_stock.id, "quantity": 1}, **self.auth_header
        )
        self.assertEqual(response.status_code, 400)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test cart.tests.test_views.AddCartItemViewTests -v 2`
Expected: 404s — no `/api/v1/cart/items/` route exists yet.

- [ ] **Step 3: Implement**

Replace `backend/cart/views.py` with the complete file (adds `AddCartItemView` below the existing `CartDetailView`):

```python
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product

from .models import Cart, CartItem
from .serializers import CartSerializer

EMPTY_CART = {"id": None, "items": [], "subtotal": "0.00"}


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product__images").first()
        if not cart:
            return Response(EMPTY_CART)
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)


class AddCartItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        product_id = request.data.get("product")
        quantity = int(request.data.get("quantity", 1))

        try:
            product = Product.objects.get(pk=product_id)
        except (Product.DoesNotExist, ValueError, TypeError):
            raise serializers.ValidationError({"product": "This product does not exist."})

        cart, _ = Cart.objects.get_or_create(user=request.user)
        item, created = CartItem.objects.get_or_create(cart=cart, product=product, defaults={"quantity": quantity})
        requested_total = quantity if created else item.quantity + quantity

        if requested_total > product.stock_quantity:
            raise serializers.ValidationError(
                {"quantity": f"Only {product.stock_quantity} left in stock."}
            )

        if not created:
            item.quantity = requested_total
            item.save()

        cart.refresh_from_db()
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
```

`backend/cart/urls.py`:

```python
from django.urls import path

from .views import AddCartItemView, CartDetailView

urlpatterns = [
    path("cart/", CartDetailView.as_view(), name="cart-detail"),
    path("cart/items/", AddCartItemView.as_view(), name="cart-item-add"),
]
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test cart -v 2`
Expected: `OK` (16 tests pass — 10 from Task 3 + 6 new)

- [ ] **Step 5: Commit**

```bash
git add backend/cart/views.py backend/cart/urls.py backend/cart/tests/test_views.py
git commit -m "feat(cart): add POST /api/v1/cart/items/ with stock validation"
```

---

## Task 5: `PATCH`/`DELETE /api/v1/cart/items/<id>/`

**Files:**
- Modify: `backend/cart/views.py` (add `CartItemDetailView`)
- Modify: `backend/cart/urls.py` (add the `cart/items/<id>/` route)
- Modify: `backend/cart/tests/test_views.py` (add `CartItemDetailViewTests`)

**Interfaces:**
- Consumes: `cart.serializers.CartSerializer`, `cart.models.Cart`, `cart.models.CartItem` (Tasks 2-4).
- Produces: `PATCH /api/v1/cart/items/<id>/` → 200, full updated cart; `DELETE /api/v1/cart/items/<id>/` → 200, full updated cart. Both scoped to the owning user's cart (404 for another user's item).

- [ ] **Step 1: Write the failing tests**

Append to `backend/cart/tests/test_views.py`:

```python
class CartItemDetailViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5
        )
        self.cart = Cart.objects.create(user=self.user)
        self.item = CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)

    def test_patch_requires_authentication(self):
        response = self.client.patch(f"/api/v1/cart/items/{self.item.id}/", {"quantity": 3})
        self.assertEqual(response.status_code, 401)

    def test_patch_updates_quantity(self):
        response = self.client.patch(
            f"/api/v1/cart/items/{self.item.id}/", {"quantity": 4}, **self.auth_header
        )
        self.assertEqual(response.status_code, 200)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 4)
        self.assertEqual(response.json()["subtotal"], "400.00")

    def test_patch_rejects_quantity_exceeding_stock(self):
        response = self.client.patch(
            f"/api/v1/cart/items/{self.item.id}/", {"quantity": 6}, **self.auth_header
        )
        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 2)

    def test_patch_another_users_item_404s(self):
        their_cart = Cart.objects.create(user=self.other)
        their_item = CartItem.objects.create(cart=their_cart, product=self.product, quantity=1)
        response = self.client.patch(
            f"/api/v1/cart/items/{their_item.id}/", {"quantity": 2}, **self.auth_header
        )
        self.assertEqual(response.status_code, 404)

    def test_delete_removes_item_and_returns_updated_cart(self):
        response = self.client.delete(f"/api/v1/cart/items/{self.item.id}/", **self.auth_header)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": self.cart.id, "items": [], "subtotal": "0.00"})
        self.assertFalse(CartItem.objects.filter(pk=self.item.id).exists())

    def test_delete_another_users_item_404s(self):
        their_cart = Cart.objects.create(user=self.other)
        their_item = CartItem.objects.create(cart=their_cart, product=self.product, quantity=1)
        response = self.client.delete(f"/api/v1/cart/items/{their_item.id}/", **self.auth_header)
        self.assertEqual(response.status_code, 404)
        self.assertTrue(CartItem.objects.filter(pk=their_item.id).exists())
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test cart.tests.test_views.CartItemDetailViewTests -v 2`
Expected: 404s — no `/api/v1/cart/items/<id>/` route exists yet.

- [ ] **Step 3: Implement**

Replace `backend/cart/views.py` with the complete file (adds `CartItemDetailView` below the existing `CartDetailView` and `AddCartItemView`):

```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product

from .models import Cart, CartItem
from .serializers import CartSerializer

EMPTY_CART = {"id": None, "items": [], "subtotal": "0.00"}


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product__images").first()
        if not cart:
            return Response(EMPTY_CART)
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)


class AddCartItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        product_id = request.data.get("product")
        quantity = int(request.data.get("quantity", 1))

        try:
            product = Product.objects.get(pk=product_id)
        except (Product.DoesNotExist, ValueError, TypeError):
            raise serializers.ValidationError({"product": "This product does not exist."})

        cart, _ = Cart.objects.get_or_create(user=request.user)
        item, created = CartItem.objects.get_or_create(cart=cart, product=product, defaults={"quantity": quantity})
        requested_total = quantity if created else item.quantity + quantity

        if requested_total > product.stock_quantity:
            raise serializers.ValidationError(
                {"quantity": f"Only {product.stock_quantity} left in stock."}
            )

        if not created:
            item.quantity = requested_total
            item.save()

        cart.refresh_from_db()
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_item(self, request, item_id):
        return get_object_or_404(CartItem, pk=item_id, cart__user=request.user)

    @transaction.atomic
    def patch(self, request, item_id):
        item = self.get_item(request, item_id)
        quantity = int(request.data.get("quantity", item.quantity))

        if quantity < 1:
            raise serializers.ValidationError({"quantity": "Quantity must be at least 1."})
        if quantity > item.product.stock_quantity:
            raise serializers.ValidationError(
                {"quantity": f"Only {item.product.stock_quantity} left in stock."}
            )

        item.quantity = quantity
        item.save()

        cart = item.cart
        cart.refresh_from_db()
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, item_id):
        item = self.get_item(request, item_id)
        cart = item.cart
        item.delete()
        cart.refresh_from_db()
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)
```

`backend/cart/urls.py`:

```python
from django.urls import path

from .views import AddCartItemView, CartDetailView, CartItemDetailView

urlpatterns = [
    path("cart/", CartDetailView.as_view(), name="cart-detail"),
    path("cart/items/", AddCartItemView.as_view(), name="cart-item-add"),
    path("cart/items/<int:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
]
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test cart -v 2`
Expected: `OK` (22 tests pass — 16 from Task 4 + 6 new)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` — full backend suite passes.

- [ ] **Step 5: Commit**

```bash
git add backend/cart/views.py backend/cart/urls.py backend/cart/tests/test_views.py
git commit -m "feat(cart): add PATCH/DELETE for individual cart items"
```

---

## Task 6: Frontend `CartContext`

**Files:**
- Create: `frontend/src/context/CartContext.jsx`
- Create: `frontend/src/context/CartContext.test.jsx`
- Modify: `frontend/src/main.jsx` (wrap `<App />` with `<CartProvider>`, nested inside `<CustomerAuthProvider>`)

**Interfaces:**
- Consumes: `customerApiClient` (existing, Sub-plan 1), `useCustomerAuth()` (existing, Sub-plan 1).
- Produces: `CartProvider`, `useCart()` → `{cart, itemCount, isLoading, addItem(productId, quantity), updateItem(itemId, quantity), removeItem(itemId), refresh()}`. Consumed by Tasks 8-10.

- [ ] **Step 1: Write the failing tests**

`frontend/src/context/CartContext.test.jsx`:

```jsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customerApiClient } from "../api/customerClient";
import { CartProvider, useCart } from "./CartContext";

vi.mock("../api/customerClient", () => ({
  customerApiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

let mockIsCustomerAuthenticated = true;
vi.mock("./CustomerAuthContext", () => ({
  useCustomerAuth: () => ({ isAuthenticated: mockIsCustomerAuthenticated }),
}));

const EMPTY_CART = { id: null, items: [], subtotal: "0.00" };
const CART_WITH_ONE_ITEM = {
  id: 1,
  items: [{ id: 10, product: 5, product_name: "Tank", quantity: 2, line_total: "200.00" }],
  subtotal: "200.00",
};

describe("CartContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCustomerAuthenticated = true;
  });

  it("fetches the cart on mount when the customer is authenticated", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: EMPTY_CART });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

    await waitFor(() => expect(customerApiClient.get).toHaveBeenCalledWith("/cart/"));
    await waitFor(() => expect(result.current.cart).toEqual(EMPTY_CART));
    expect(result.current.itemCount).toBe(0);
  });

  it("does not fetch the cart when the customer is not authenticated", async () => {
    mockIsCustomerAuthenticated = false;

    renderHook(() => useCart(), { wrapper: CartProvider });

    await waitFor(() => {});
    expect(customerApiClient.get).not.toHaveBeenCalled();
  });

  it("addItem posts to /cart/items/ and updates cart state", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: EMPTY_CART });
    customerApiClient.post.mockResolvedValueOnce({ data: CART_WITH_ONE_ITEM });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    await waitFor(() => expect(result.current.cart).toEqual(EMPTY_CART));

    await act(async () => {
      await result.current.addItem(5, 2);
    });

    expect(customerApiClient.post).toHaveBeenCalledWith("/cart/items/", { product: 5, quantity: 2 });
    expect(result.current.cart).toEqual(CART_WITH_ONE_ITEM);
    expect(result.current.itemCount).toBe(2);
  });

  it("updateItem patches the item and updates cart state", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: CART_WITH_ONE_ITEM });
    const updated = { ...CART_WITH_ONE_ITEM, items: [{ ...CART_WITH_ONE_ITEM.items[0], quantity: 4 }] };
    customerApiClient.patch.mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    await waitFor(() => expect(result.current.cart).toEqual(CART_WITH_ONE_ITEM));

    await act(async () => {
      await result.current.updateItem(10, 4);
    });

    expect(customerApiClient.patch).toHaveBeenCalledWith("/cart/items/10/", { quantity: 4 });
    expect(result.current.cart.items[0].quantity).toBe(4);
  });

  it("removeItem deletes the item and updates cart state", async () => {
    customerApiClient.get.mockResolvedValueOnce({ data: CART_WITH_ONE_ITEM });
    customerApiClient.delete.mockResolvedValueOnce({ data: EMPTY_CART });

    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    await waitFor(() => expect(result.current.cart).toEqual(CART_WITH_ONE_ITEM));

    await act(async () => {
      await result.current.removeItem(10);
    });

    expect(customerApiClient.delete).toHaveBeenCalledWith("/cart/items/10/");
    expect(result.current.cart).toEqual(EMPTY_CART);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/context/CartContext.test.jsx`
Expected: FAIL — `Failed to resolve import "./CartContext"` (file doesn't exist yet).

- [ ] **Step 3: Implement**

`frontend/src/context/CartContext.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { customerApiClient } from "../api/customerClient";
import { useCustomerAuth } from "./CustomerAuthContext";

const CartContext = createContext(null);

const EMPTY_CART = { id: null, items: [], subtotal: "0.00" };

export function CartProvider({ children }) {
  const { isAuthenticated: isCustomerAuthenticated } = useCustomerAuth();
  const [cart, setCart] = useState(EMPTY_CART);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!isCustomerAuthenticated) {
      setCart(EMPTY_CART);
      return Promise.resolve();
    }
    setIsLoading(true);
    return customerApiClient
      .get("/cart/")
      .then((response) => setCart(response.data))
      .finally(() => setIsLoading(false));
  }, [isCustomerAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = async (productId, quantity = 1) => {
    const response = await customerApiClient.post("/cart/items/", { product: productId, quantity });
    setCart(response.data);
  };

  const updateItem = async (itemId, quantity) => {
    const response = await customerApiClient.patch(`/cart/items/${itemId}/`, { quantity });
    setCart(response.data);
  };

  const removeItem = async (itemId) => {
    const response = await customerApiClient.delete(`/cart/items/${itemId}/`);
    setCart(response.data);
  };

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, itemCount, isLoading, addItem, updateItem, removeItem, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
```

In `frontend/src/main.jsx`, nest `<CartProvider>` inside `<CustomerAuthProvider>`:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <CustomerAuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </CustomerAuthProvider>
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/context/CartContext.test.jsx`
Expected: PASS (5 tests)

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite (21 baseline + 5 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/CartContext.jsx frontend/src/context/CartContext.test.jsx frontend/src/main.jsx
git commit -m "feat(cart): add CartContext for application-wide cart state"
```

---

## Task 7: `ProductsManager.jsx` — stock quantity field

**Files:**
- Modify: `frontend/src/pages/admin/ProductsManager.jsx`

**Interfaces:**
- Consumes: backend `Product.stock_quantity` field (Task 1).

- [ ] **Step 1: Replace the `in_stock` checkbox with a `stock_quantity` number field**

In `frontend/src/pages/admin/ProductsManager.jsx`:

Change the initial `form` state (both in `useState` and in `resetForm`) from:
```js
    in_stock: true,
```
to:
```js
    stock_quantity: 0,
```
in both places (`ProductsManager.jsx:17` and `ProductsManager.jsx:51`).

Change `startEdit`'s form population (`ProductsManager.jsx:65`) from:
```js
      in_stock: product.in_stock,
```
to:
```js
      stock_quantity: product.stock_quantity,
```

Change `handleSubmit`'s payload construction (`ProductsManager.jsx:74`) from:
```js
    const payload = { ...form, category: Number(form.category), price: Number(form.price) };
```
to:
```js
    const payload = {
      ...form,
      category: Number(form.category),
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
    };
```

Replace the "In stock" checkbox (`ProductsManager.jsx:144-147`):
```jsx
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: e.target.checked })} />
          In stock
        </label>
```
with a number input:
```jsx
        <label className="flex flex-col text-sm text-gray-600">
          Stock quantity
          <input
            required
            type="number"
            min="0"
            placeholder="Stock quantity"
            value={form.stock_quantity}
            onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
            className="border rounded px-3 py-2"
          />
        </label>
```

Add a stock indicator to the products table. In the `<thead>` (`ProductsManager.jsx:168`), change:
```jsx
        <thead><tr><th>Name</th><th>Price</th><th>Images</th><th></th></tr></thead>
```
to:
```jsx
        <thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Images</th><th></th></tr></thead>
```
And in the `<tbody>` row (`ProductsManager.jsx:171-173`), add a cell after the price cell:
```jsx
              <td>{product.name}</td>
              <td>₹{product.price}</td>
              <td>{product.stock_quantity}{!product.in_stock && <span className="text-red-600 ml-1">(out of stock)</span>}</td>
```

- [ ] **Step 2: Manual verification**

Run: `cd frontend && npm run dev` and the backend dev server. Log in as staff, visit `/admin/products`, edit a product's stock quantity to `0`, save, confirm the table shows "(out of stock)"; edit it back to a positive number and confirm the label disappears.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/ProductsManager.jsx
git commit -m "feat(cart): replace admin's in-stock checkbox with a stock quantity field"
```

---

## Task 8: Add to Cart — `ProductCard.jsx` + `ProductDetail.jsx`

**Files:**
- Modify: `frontend/src/components/public/ProductCard.jsx`
- Modify: `frontend/src/pages/public/ProductDetail.jsx`

**Interfaces:**
- Consumes: `useCart()` (Task 6), `useCustomerAuth()` (existing, Sub-plan 1).

- [ ] **Step 1: Add an Add to Cart control to `ProductCard.jsx`**

Replace the full contents of `frontend/src/components/public/ProductCard.jsx`:

```jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

export default function ProductCard({ product }) {
  const image = product.images?.[0];
  const { isAuthenticated: isCustomerAuthenticated } = useCustomerAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [status, setStatus] = useState("idle"); // idle | adding | added | error

  const handleAddToCart = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isCustomerAuthenticated) {
      navigate("/login");
      return;
    }
    setStatus("adding");
    try {
      await addItem(product.id, 1);
      setStatus("added");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 1500);
    }
  };

  return (
    <Link to={`/product/${product.slug}`} className="border rounded-lg p-2 sm:p-4 hover:shadow-md transition flex flex-col">
      {image && (
        <div className="w-full h-24 sm:h-40 bg-gray-50 rounded mb-2 sm:mb-3 flex items-center justify-center overflow-hidden">
          <img
            src={image.image}
            alt={image.alt_text || product.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
      <h3 className="font-semibold text-sm sm:text-base">{product.name}</h3>
      <p className="text-xs sm:text-sm text-gray-600">₹{product.price}</p>
      <div className="mt-auto pt-2">
        {product.in_stock ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={status === "adding"}
            className="w-full text-xs sm:text-sm bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded px-2 py-1.5 transition-colors"
          >
            {status === "added" ? "Added!" : status === "error" ? "Couldn't add" : "Add to Cart"}
          </button>
        ) : (
          <span className="block text-center text-xs sm:text-sm text-red-600 border border-red-200 rounded px-2 py-1.5">
            Out of stock
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Add quantity selector and Add to Cart to `ProductDetail.jsx`**

Replace the full contents of `frontend/src/pages/public/ProductDetail.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import Breadcrumbs from "../../components/public/Breadcrumbs";
import InquiryForm from "../../components/public/InquiryForm";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [productError, setProductError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("idle"); // idle | adding | added | error
  const [cartError, setCartError] = useState("");
  const { isAuthenticated: isCustomerAuthenticated } = useCustomerAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    setProduct(null);
    setProductError(false);
    setQuantity(1);
    apiClient
      .get(`/products/${slug}/`)
      .then((response) => setProduct(response.data))
      .catch(() => setProductError(true));
  }, [slug]);

  const handleAddToCart = async () => {
    if (!isCustomerAuthenticated) {
      navigate("/login");
      return;
    }
    setStatus("adding");
    setCartError("");
    try {
      await addItem(product.id, quantity);
      setStatus("added");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (error) {
      setStatus("error");
      setCartError(error.response?.data?.quantity?.[0] || "Couldn't add this to your cart — please try again.");
    }
  };

  if (productError) {
    return <div className="p-8 text-red-600">Couldn't load this product — please try again later.</div>;
  }

  if (!product) return <div className="p-8">Loading...</div>;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Products", to: "/products" }, { label: product.name }]} />
      <div className="px-4 py-8 grid gap-8 md:grid-cols-2">
        <div>
          {product.images?.[0] && (
            <img src={product.images[0].image} alt={product.name} className="w-full rounded-lg" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-lg text-gray-700 mt-1">₹{product.price}</p>
          <p className="mt-4">{product.description}</p>

          <div className="mt-6 flex items-center gap-3">
            {product.in_stock ? (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Qty
                  <input
                    type="number"
                    min="1"
                    max={product.stock_quantity}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="border rounded px-2 py-1 w-16"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={status === "adding"}
                  className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded px-4 py-2 font-medium transition-colors"
                >
                  {status === "added" ? "Added to cart!" : "Add to Cart"}
                </button>
                <span className="text-sm text-gray-500">{product.stock_quantity} available</span>
              </>
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

- [ ] **Step 3: Manual verification**

Run the dev servers. As a logged-in customer, visit a category page and click "Add to Cart" on a product card — confirm the button briefly shows "Added!" without navigating away. Visit a product's detail page, adjust the quantity, add to cart, confirm no navigation. Log out and click "Add to Cart" on a card — confirm redirect to `/login`. Set a product's stock to 0 in the admin and confirm both the card and detail page show "Out of stock" with no Add to Cart control.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/ProductCard.jsx frontend/src/pages/public/ProductDetail.jsx
git commit -m "feat(cart): add Add to Cart controls to product card and detail pages"
```

---

## Task 9: `Cart.jsx` page + `/cart` route

**Files:**
- Create: `frontend/src/pages/public/Cart.jsx`
- Modify: `frontend/src/App.jsx` (add the guarded `/cart` route)

**Interfaces:**
- Consumes: `useCart()` (Task 6), `CustomerGuard` (existing, Sub-plan 1).

- [ ] **Step 1: Implement the page**

`frontend/src/pages/public/Cart.jsx`:

```jsx
import { Link } from "react-router-dom";

import { useCart } from "../../context/CartContext";

export default function Cart() {
  const { cart, isLoading, updateItem, removeItem } = useCart();

  if (isLoading && cart.items.length === 0) {
    return <div className="p-8">Loading your cart...</div>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-6">Browse the catalog and add something you like.</p>
        <Link to="/products" className="text-brand-forest hover:underline">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Your cart</h1>
      <div className="grid gap-4 mb-8">
        {cart.items.map((item) => (
          <div key={item.id} className="border rounded-xl p-4 flex gap-4 items-center bg-white shadow-sm">
            {item.product_image && (
              <img src={item.product_image} alt={item.product_name} className="w-16 h-16 object-contain bg-gray-50 rounded" />
            )}
            <div className="flex-1">
              <Link to={`/product/${item.product_slug}`} className="font-medium text-brand-dark hover:underline">
                {item.product_name}
              </Link>
              <p className="text-sm text-gray-600">₹{item.product_price} each</p>
              {item.quantity >= item.product_stock_quantity && (
                <p className="text-xs text-amber-600 mt-1">Max available quantity reached</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateItem(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
                className="border rounded w-8 h-8 disabled:opacity-40"
                aria-label={`Decrease quantity of ${item.product_name}`}
              >
                −
              </button>
              <span className="w-6 text-center">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateItem(item.id, item.quantity + 1)}
                disabled={item.quantity >= item.product_stock_quantity}
                className="border rounded w-8 h-8 disabled:opacity-40"
                aria-label={`Increase quantity of ${item.product_name}`}
              >
                +
              </button>
            </div>
            <p className="w-20 text-right font-medium">₹{item.line_total}</p>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-red-600 hover:underline text-sm"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-4 border-t pt-4">
        <span className="text-lg font-semibold text-brand-dark">Subtotal: ₹{cart.subtotal}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `frontend/src/App.jsx`, add the import and route (guarded by the existing `CustomerGuard`, alongside the `/account` block):

```jsx
import Cart from "./pages/public/Cart";
```

```jsx
          <Route path="/cart" element={<CustomerGuard />}>
            <Route index element={<Cart />} />
          </Route>
```

Place this route block immediately after the existing `/account` route block in `App.jsx` (before `/admin`).

- [ ] **Step 3: Manual verification**

Log in as a customer, add a couple of products to the cart from category pages, visit `/cart`, confirm items, quantities, and subtotal are correct; use the +/- steppers and confirm the subtotal updates and the stepper disables at the stock limit; remove an item and confirm it disappears and the subtotal updates; remove all items and confirm the empty-cart message appears. Visit `/cart` while logged out and confirm redirect to `/login`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/public/Cart.jsx frontend/src/App.jsx
git commit -m "feat(cart): add the cart page and guarded /cart route"
```

---

## Task 10: Header cart icon + badge

**Files:**
- Modify: `frontend/src/components/public/Header.jsx`

**Interfaces:**
- Consumes: `useCart()` (Task 6), alongside the existing `useCustomerAuth()`/`useAuth()` already used in this file.

- [ ] **Step 1: Read the current file, then add the cart icon**

Read `frontend/src/components/public/Header.jsx` in full first (it was modified in Sub-plan 1 to add customer login/account controls and `aria-label`s — reconcile against its current content rather than assuming).

Add the import:

```jsx
import { useCart } from "../../context/CartContext";
```

Inside the `Header` component, alongside the existing `useCustomerAuth()` call:

```jsx
const { itemCount } = useCart();
```

In the header's top action group, add a cart link with a badge — shown only when `isCustomerAuthenticated` (consistent with cart requiring login), placed next to the existing customer "Hi, {name}"/"Login" controls:

```jsx
{isCustomerAuthenticated && (
  <Link to="/cart" aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`} className="relative p-2 hover:text-brand-aqua">
    <CartIcon className="h-5 w-5" />
    {itemCount > 0 && (
      <span className="absolute -top-1 -right-1 bg-brand-aqua text-brand-dark text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
        {itemCount > 9 ? "9+" : itemCount}
      </span>
    )}
  </Link>
)}
```

Add a `CartIcon` function component near the top of the file, alongside the existing `SearchIcon`:

```jsx
function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 4h2l2.4 12h9.2L20 8H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
```

Also add a cart link to the mobile drawer's "Account" section (added in Sub-plan 1's Task 10) so mobile customers can reach the cart too — add it as a second `<NavLink>` right after the existing "My Account" link in that section, pointing to `/cart` with the text "Cart" (and, if the badge count is nonzero, append it inline, e.g. `Cart{itemCount > 0 ? \` (${itemCount})\` : ""}`).

- [ ] **Step 2: Manual verification**

Log in as a customer, add an item to the cart from a product page, confirm the header's cart badge appears/updates without a page reload (since `CartContext` is shared app-wide). Open the mobile drawer and confirm a "Cart" link is present under the Account section. Log out and confirm the cart icon disappears. Check on a narrow viewport that the additional icon doesn't cause new layout breakage beyond what's already tracked from Sub-plan 1.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/public/Header.jsx
git commit -m "feat(cart): show a live cart item-count badge in the header"
```

---

## Plan-level verification

After all 10 tasks:

Run: `cd backend && python manage.py test` — full backend suite passes (catalog + inquiries + core + accounts + cart).

Run: `cd frontend && npx vitest run` — full frontend suite passes.

Manual end-to-end pass: as a logged-in customer, browse to a category, add a product to the cart, adjust its quantity on `/cart`, confirm the header badge and subtotal stay in sync, remove the item, confirm the cart returns to empty; as staff, reduce a product's stock to 0 in the admin and confirm it becomes un-addable everywhere; confirm Sub-plan 1's accounts/address flows are completely unaffected.
