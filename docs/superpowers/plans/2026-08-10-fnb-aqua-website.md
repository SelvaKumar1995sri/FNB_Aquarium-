# FNB Aqua Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, catalog + inquiry website for FNB Aquatic Studio (Django/DRF backend, React/Vite/Tailwind frontend) with a branded staff-only admin panel, matching the spec at `docs/superpowers/specs/2026-08-10-fnb-aqua-website-design.md`.

**Architecture:** Monorepo with `backend/` (Django + DRF REST API, PostgreSQL) and `frontend/` (React SPA, Vite, Tailwind, react-router-dom). The frontend consumes a versioned JSON API (`/api/v1/`); public endpoints are read-only plus inquiry creation, staff endpoints require JWT auth (`is_staff=True`). No cart, checkout, payment, or customer accounts in this phase.

**Tech Stack:** Django 5 + Django REST Framework + djangorestframework-simplejwt + django-cors-headers + django-environ + PostgreSQL (psycopg2) on the backend; React + Vite (JSX) + Tailwind CSS + react-router-dom + axios on the frontend.

## Global Constraints

- No shopping cart, checkout, online payment, or customer accounts anywhere in this build (spec §11).
- Database is PostgreSQL in both dev and production — no SQLite (spec §2, §9).
- All config (`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`) via environment variables, never hardcoded; `.env` files gitignored, `.env.example` committed (spec §9).
- All list API endpoints are paginated (DRF `PageNumberPagination`) (spec §9).
- The public inquiry-creation endpoint is rate-throttled per IP to prevent abuse (spec §9).
- Public site is mobile-first responsive (hamburger nav, fluid grids, swipeable video slider); admin dashboard must remain usable on mobile browsers (spec §9).
- Staff auth only — no customer signup/login. Admin accounts are created via `python manage.py createsuperuser`.
- Real shop content to seed: Address "No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai, Greater Chennai, Tamil Nadu 600100"; Phone "097898 27973"; Hours "Monday–Saturday 10am–10pm, Sunday 10am–10pm" with a note that holiday hours may differ (spec §6).
- Video feature: admin-managed YouTube videos, home page slider shows thumbnail banners, clicking opens the video on youtube.com in a new tab — no inline embed (spec §7).

---

## Phase 1 — Backend foundation

### Task 1: Backend project scaffold

**Files:**
- Create: `backend/manage.py`
- Create: `backend/config/__init__.py`
- Create: `backend/config/settings/__init__.py`
- Create: `backend/config/settings/base.py`
- Create: `backend/config/settings/dev.py`
- Create: `backend/config/settings/production.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/core/__init__.py`
- Create: `backend/core/views.py`
- Create: `backend/core/tests/__init__.py`
- Create: `backend/core/tests/test_health.py`
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `docker-compose.yml` (repo root)

**Interfaces:**
- Produces: `GET /api/v1/health/` → `{"status": "ok"}`, used later by AWS load balancer health checks.
- Produces: `config.settings.base.env` (a `django_environ.Env` instance) that later tasks read `env("...")` from.

- [ ] **Step 1: Write requirements.txt**

```text
Django>=5.0,<5.3
djangorestframework>=3.15,<3.16
djangorestframework-simplejwt>=5.3,<5.4
django-cors-headers>=4.4,<4.5
django-environ>=0.11,<0.12
psycopg2-binary>=2.9,<2.10
Pillow>=10.4,<10.5
gunicorn>=22.0,<23.0
whitenoise>=6.7,<6.8
django-storages>=1.14,<1.15
boto3>=1.34,<2.0
```

- [ ] **Step 2: Install dependencies and start the Django project**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
django-admin startproject config .
mkdir core
```

- [ ] **Step 3: Replace `config/settings.py` with a settings package**

Delete the auto-generated `config/settings.py`, create the files below instead.

`backend/config/settings/base.py`:

```python
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

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
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {"default": env.db("DATABASE_URL")}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.AllowAny",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {
        "inquiry_create": "5/hour",
    },
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
```

`backend/config/settings/dev.py`:

```python
from .base import *  # noqa

DEBUG = True
```

`backend/config/settings/production.py`:

```python
from .base import *  # noqa

DEBUG = False

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

STORAGES["default"] = {"BACKEND": "storages.backends.s3boto3.S3Boto3Storage"}
AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="ap-south-1")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
    },
}
```

- [ ] **Step 4: Add the health check view and URL wiring**

`backend/core/views.py`:

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET"])
def health_check(request):
    return Response({"status": "ok"})
```

`catalog.urls`, `inquiries.urls`, and `core.auth_urls` don't exist yet (they're created in Tasks 4, 7, and 9) — write `config/urls.py` with only the health check for now:

```python
from django.contrib import admin
from django.urls import path

from core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check),
]
```

Tasks 4, 7, and 9 will each add one `path("api/v1/...", include(...))` line to this file as those apps are built.

- [ ] **Step 5: Write the health check test**

`backend/core/tests/test_health.py`:

```python
from rest_framework.test import APITestCase


class HealthCheckTests(APITestCase):
    def test_health_check_returns_ok(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
```

- [ ] **Step 6: Create `.env` and `.env.example`**

`backend/.env.example`:

```text
DJANGO_SETTINGS_MODULE=config.settings.dev
SECRET_KEY=change-me
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://fnbaqua:fnbaqua@localhost:5432/fnbaqua
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Copy it to `backend/.env` with the same values for local dev.

`backend/.gitignore`:

```text
.venv/
__pycache__/
*.pyc
.env
staticfiles/
media/
```

- [ ] **Step 7: Add root `docker-compose.yml` for local Postgres**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: fnbaqua
      POSTGRES_USER: fnbaqua
      POSTGRES_PASSWORD: fnbaqua
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 8: Start Postgres, run migrations, run the test**

```bash
docker compose up -d db
cd backend
set DJANGO_SETTINGS_MODULE=config.settings.dev
python manage.py migrate
python manage.py test core
```

Expected: `OK` — the health check test passes, migrations for Django's built-in apps succeed against Postgres.

- [ ] **Step 9: Commit**

```bash
git add backend docker-compose.yml
git commit -m "chore: scaffold Django backend with Postgres, DRF, JWT, health check"
```

---

### Task 2: Catalog models — Category, Product, ProductImage

**Files:**
- Create: `backend/catalog/__init__.py`
- Create: `backend/catalog/apps.py`
- Create: `backend/catalog/models.py`
- Create: `backend/catalog/admin.py`
- Create: `backend/catalog/tests/__init__.py`
- Create: `backend/catalog/tests/test_models.py`
- Create: `backend/catalog/migrations/__init__.py`

**Interfaces:**
- Produces: `catalog.models.Category(name, slug, parent, image, description, order)`
- Produces: `catalog.models.Product(name, slug, category, description, price, in_stock, is_featured, created_at)`
- Produces: `catalog.models.ProductImage(product, image, alt_text, order)` with `related_name="images"` on `product`

- [ ] **Step 1: Scaffold the app**

```bash
cd backend
python manage.py startapp catalog
```

- [ ] **Step 2: Write the failing model tests**

`backend/catalog/tests/test_models.py`:

```python
from django.test import TestCase

from catalog.models import Category, Product, ProductImage


class CategoryModelTests(TestCase):
    def test_str_returns_name(self):
        category = Category.objects.create(name="Fish", slug="fish")
        self.assertEqual(str(category), "Fish")

    def test_supports_subcategories(self):
        parent = Category.objects.create(name="Fish", slug="fish")
        child = Category.objects.create(name="Discus", slug="discus", parent=parent)
        self.assertEqual(child.parent, parent)


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
        self.assertTrue(product.in_stock)
        self.assertFalse(product.is_featured)


class ProductImageModelTests(TestCase):
    def test_related_name_is_images(self):
        category = Category.objects.create(name="Tanks", slug="tanks")
        product = Product.objects.create(
            name="60cm Rimless Tank", slug="60cm-rimless-tank", category=category, price=4500
        )
        ProductImage.objects.create(product=product, alt_text="Front view", order=1)
        self.assertEqual(product.images.count(), 1)
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
python manage.py test catalog
```

Expected: `ModuleNotFoundError` / `ImportError` — `catalog.models` has no `Category`/`Product`/`ProductImage` yet.

- [ ] **Step 4: Write the models**

`backend/catalog/models.py`:

```python
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=110, unique=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="children", on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to="categories/", null=True, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=210, unique=True)
    category = models.ForeignKey(Category, related_name="products", on_delete=models.CASCADE)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    in_stock = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    product = models.ForeignKey(Product, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="products/")
    alt_text = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
```

`backend/catalog/admin.py`:

```python
from django.contrib import admin

from .models import Category, Product, ProductImage


admin.site.register(Category)
admin.site.register(Product)
admin.site.register(ProductImage)
```

- [ ] **Step 5: Make and run migrations, run tests**

```bash
python manage.py makemigrations catalog
python manage.py migrate
python manage.py test catalog
```

Expected: `OK` — all three model tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/catalog
git commit -m "feat: add Category, Product, ProductImage models"
```

---

### Task 3: Catalog models — PortfolioItem, BlogPost, Video

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/admin.py`
- Modify: `backend/catalog/tests/test_models.py`

**Interfaces:**
- Produces: `catalog.models.PortfolioItem(title, image, description, order)`
- Produces: `catalog.models.BlogPost(title, slug, body, cover_image, published_at)`
- Produces: `catalog.models.Video(title, youtube_url, thumbnail, order, is_active)` with `Video.video_id` property that extracts the YouTube video ID from `youtube_url`, and `Video.default_thumbnail_url` property (`https://img.youtube.com/vi/<video_id>/hqdefault.jpg`)

- [ ] **Step 1: Write the failing tests**

Append to `backend/catalog/tests/test_models.py`:

```python
from catalog.models import BlogPost, PortfolioItem, Video


class PortfolioItemModelTests(TestCase):
    def test_str_returns_title(self):
        item = PortfolioItem.objects.create(title="Living Room Reef Tank")
        self.assertEqual(str(item), "Living Room Reef Tank")


class BlogPostModelTests(TestCase):
    def test_str_returns_title(self):
        post = BlogPost.objects.create(title="How to cycle a new tank", slug="how-to-cycle-a-new-tank", body="...")
        self.assertEqual(str(post), "How to cycle a new tank")


class VideoModelTests(TestCase):
    def test_video_id_parses_watch_url(self):
        video = Video.objects.create(
            title="Tank tour", youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        self.assertEqual(video.video_id, "dQw4w9WgXcQ")

    def test_video_id_parses_short_url(self):
        video = Video.objects.create(title="Tank tour", youtube_url="https://youtu.be/dQw4w9WgXcQ")
        self.assertEqual(video.video_id, "dQw4w9WgXcQ")

    def test_default_thumbnail_url_uses_video_id(self):
        video = Video.objects.create(
            title="Tank tour", youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        self.assertEqual(
            video.default_thumbnail_url, "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
python manage.py test catalog
```

Expected: `ImportError` — `PortfolioItem`, `BlogPost`, `Video` don't exist yet.

- [ ] **Step 3: Write the models**

Append to `backend/catalog/models.py`:

```python
import re


class PortfolioItem(models.Model):
    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to="portfolio/", null=True, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title


class BlogPost(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=210, unique=True)
    body = models.TextField()
    cover_image = models.ImageField(upload_to="blog/", null=True, blank=True)
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at"]

    def __str__(self):
        return self.title


YOUTUBE_ID_PATTERN = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})"
)


class Video(models.Model):
    title = models.CharField(max_length=200)
    youtube_url = models.URLField()
    thumbnail = models.ImageField(upload_to="videos/", null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title

    @property
    def video_id(self):
        match = YOUTUBE_ID_PATTERN.search(self.youtube_url)
        return match.group(1) if match else ""

    @property
    def default_thumbnail_url(self):
        return f"https://img.youtube.com/vi/{self.video_id}/hqdefault.jpg"
```

Update `backend/catalog/admin.py`:

```python
from django.contrib import admin

from .models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(ProductImage)
admin.site.register(PortfolioItem)
admin.site.register(BlogPost)
admin.site.register(Video)
```

- [ ] **Step 4: Make and run migrations, run tests**

```bash
python manage.py makemigrations catalog
python manage.py migrate
python manage.py test catalog
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/catalog
git commit -m "feat: add PortfolioItem, BlogPost, Video models"
```

---

### Task 4: Public read-only catalog API

**Files:**
- Create: `backend/catalog/serializers.py`
- Create: `backend/catalog/views.py`
- Create: `backend/catalog/urls.py`
- Modify: `backend/config/urls.py` (re-enable the `catalog.urls` include)
- Create: `backend/catalog/tests/test_views.py`

**Interfaces:**
- Consumes: `Category`, `Product`, `ProductImage`, `PortfolioItem`, `BlogPost`, `Video` from Task 2/3.
- Produces: `GET /api/v1/categories/`, `GET /api/v1/categories/<slug>/`, `GET /api/v1/products/?category=<slug>`, `GET /api/v1/products/<slug>/`, `GET /api/v1/portfolio/`, `GET /api/v1/blog/`, `GET /api/v1/blog/<slug>/`, `GET /api/v1/videos/` — all paginated, all `AllowAny`.

- [ ] **Step 1: Write the failing API tests**

`backend/catalog/tests/test_views.py`:

```python
from rest_framework.test import APITestCase

from catalog.models import Category, Product, Video


class CategoryListViewTests(APITestCase):
    def test_list_categories_is_public(self):
        Category.objects.create(name="Fish", slug="fish")
        response = self.client.get("/api/v1/categories/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)


class ProductListViewTests(APITestCase):
    def test_filter_products_by_category_slug(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        plants = Category.objects.create(name="Plants", slug="plants")
        Product.objects.create(name="Discus", slug="discus", category=fish, price=1200)
        Product.objects.create(name="Anubias", slug="anubias", category=plants, price=300)

        response = self.client.get("/api/v1/products/", {"category": "fish"})

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["slug"], "discus")


class VideoListViewTests(APITestCase):
    def test_only_active_videos_are_listed(self):
        Video.objects.create(title="Active", youtube_url="https://youtu.be/aaaaaaaaaaa", is_active=True)
        Video.objects.create(title="Inactive", youtube_url="https://youtu.be/bbbbbbbbbbb", is_active=False)

        response = self.client.get("/api/v1/videos/")

        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Active")
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
python manage.py test catalog.tests.test_views
```

Expected: 404s — no `catalog.urls` wired yet.

- [ ] **Step 3: Write serializers**

`backend/catalog/serializers.py`:

```python
from rest_framework import serializers

from .models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "image", "description", "order"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "order"]


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "category", "description", "price",
            "in_stock", "is_featured", "created_at", "images",
        ]


class PortfolioItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioItem
        fields = ["id", "title", "image", "description", "order"]


class BlogPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ["id", "title", "slug", "body", "cover_image", "published_at"]


class VideoSerializer(serializers.ModelSerializer):
    video_id = serializers.ReadOnlyField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = ["id", "title", "youtube_url", "video_id", "thumbnail_url", "order", "is_active"]

    def get_thumbnail_url(self, obj):
        if obj.thumbnail:
            request = self.context.get("request")
            return request.build_absolute_uri(obj.thumbnail.url) if request else obj.thumbnail.url
        return obj.default_thumbnail_url
```

- [ ] **Step 4: Write views**

`backend/catalog/views.py`:

```python
from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .models import BlogPost, Category, PortfolioItem, Product, Video
from .serializers import (
    BlogPostSerializer, CategorySerializer, PortfolioItemSerializer,
    ProductSerializer, VideoSerializer,
)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Product.objects.select_related("category").prefetch_related("images")
        category_slug = self.request.query_params.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)
        return queryset


class PortfolioItemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PortfolioItem.objects.all()
    serializer_class = PortfolioItemSerializer
    permission_classes = [AllowAny]


class BlogPostViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BlogPost.objects.all()
    serializer_class = BlogPostSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"


class VideoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Video.objects.filter(is_active=True)
    serializer_class = VideoSerializer
    permission_classes = [AllowAny]
```

- [ ] **Step 5: Wire URLs**

`backend/catalog/urls.py`:

```python
from rest_framework.routers import DefaultRouter

from .views import BlogPostViewSet, CategoryViewSet, PortfolioItemViewSet, ProductViewSet, VideoViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("portfolio", PortfolioItemViewSet, basename="portfolio")
router.register("blog", BlogPostViewSet, basename="blog")
router.register("videos", VideoViewSet, basename="video")

urlpatterns = router.urls
```

Update `backend/config/urls.py` to add the catalog routes:

```python
from django.contrib import admin
from django.urls import include, path

from core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check),
    path("api/v1/", include("catalog.urls")),
]
```

- [ ] **Step 6: Run tests**

```bash
python manage.py test catalog
```

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add backend/catalog backend/config/urls.py
git commit -m "feat: expose public read-only catalog API"
```

---

### Task 5: Staff-only catalog write API

**Files:**
- Create: `backend/catalog/permissions.py`
- Modify: `backend/catalog/views.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/urls.py`
- Modify: `backend/catalog/tests/test_views.py`

**Interfaces:**
- Produces: `catalog.permissions.IsStaffOrReadOnly` (safe methods → `AllowAny`, else `request.user.is_staff`)
- Produces: `POST/PUT/PATCH/DELETE /api/v1/categories/`, `/api/v1/products/`, `/api/v1/videos/` (staff only); `GET/POST/PUT/DELETE /api/v1/product-images/` (staff only)

- [ ] **Step 1: Write the failing tests**

Append to `backend/catalog/tests/test_views.py`:

```python
from django.contrib.auth import get_user_model

from catalog.models import Category

User = get_user_model()


class CategoryWritePermissionTests(APITestCase):
    def test_anonymous_cannot_create_category(self):
        response = self.client.post("/api/v1/categories/", {"name": "Fish", "slug": "fish"})
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_create_category(self):
        user = User.objects.create_user(username="customer", password="pw12345")
        self.client.force_authenticate(user=user)
        response = self.client.post("/api/v1/categories/", {"name": "Fish", "slug": "fish"})
        self.assertEqual(response.status_code, 403)

    def test_staff_can_create_category(self):
        staff = User.objects.create_user(username="staff", password="pw12345", is_staff=True)
        self.client.force_authenticate(user=staff)
        response = self.client.post("/api/v1/categories/", {"name": "Fish", "slug": "fish"})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Category.objects.filter(slug="fish").exists())
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python manage.py test catalog.tests.test_views.CategoryWritePermissionTests
```

Expected: creates succeed with 200/201 regardless of auth (current `AllowAny` allows it, or fails differently) — not yet enforcing staff-only writes.

- [ ] **Step 3: Write the permission class**

`backend/catalog/permissions.py`:

```python
from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsStaffOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
```

- [ ] **Step 4: Apply the permission to Category/Product/Video, add ProductImage staff CRUD**

Modify `backend/catalog/views.py` — change `permission_classes = [AllowAny]` to `permission_classes = [IsStaffOrReadOnly]` on `CategoryViewSet`, `ProductViewSet`, and `VideoViewSet` (leave `PortfolioItemViewSet` and `BlogPostViewSet` as `AllowAny`, read-only — they're not staff-managed per spec §8). Add:

```python
from rest_framework.permissions import IsAdminUser

from .models import ProductImage
from .permissions import IsStaffOrReadOnly
from .serializers import ProductImageSerializer


class ProductImageViewSet(viewsets.ModelViewSet):
    queryset = ProductImage.objects.all()
    serializer_class = ProductImageSerializer
    permission_classes = [IsAdminUser]
```

Also update the three write-capable serializers (`CategorySerializer`, `ProductSerializer`, `VideoSerializer`) — no field changes needed, `ModelSerializer` already supports writes for the declared fields.

- [ ] **Step 5: Register the new route**

Add to `backend/catalog/urls.py`:

```python
router.register("product-images", ProductImageViewSet, basename="product-image")
```

Add this line above the existing `urlpatterns = router.urls` line, after the other `router.register(...)` calls.

- [ ] **Step 6: Run tests**

```bash
python manage.py test catalog
```

Expected: `OK` — anonymous gets 401, non-staff gets 403, staff gets 201.

- [ ] **Step 7: Commit**

```bash
git add backend/catalog
git commit -m "feat: restrict catalog writes to staff, add product-image management"
```

---

### Task 6: Inquiry model

**Files:**
- Create: `backend/inquiries/__init__.py`
- Create: `backend/inquiries/apps.py`
- Create: `backend/inquiries/models.py`
- Create: `backend/inquiries/admin.py`
- Create: `backend/inquiries/tests/__init__.py`
- Create: `backend/inquiries/tests/test_models.py`
- Create: `backend/inquiries/migrations/__init__.py`

**Interfaces:**
- Produces: `inquiries.models.Inquiry(name, phone, email, message, type, product, tank_size, tank_shape, budget_notes, status, created_at, updated_at)` with `type` choices `general`/`product`/`build_tank` and `status` choices `new`/`contacted`/`closed` (default `new`).

- [ ] **Step 1: Scaffold the app**

```bash
python manage.py startapp inquiries
```

- [ ] **Step 2: Write the failing tests**

`backend/inquiries/tests/test_models.py`:

```python
from django.test import TestCase

from catalog.models import Category, Product
from inquiries.models import Inquiry


class InquiryModelTests(TestCase):
    def test_defaults_to_new_status_and_general_type(self):
        inquiry = Inquiry.objects.create(name="Priya", phone="9876543210", message="Do you sell arowana?")
        self.assertEqual(inquiry.status, "new")
        self.assertEqual(inquiry.type, "general")

    def test_can_reference_a_product(self):
        category = Category.objects.create(name="Fish", slug="fish")
        product = Product.objects.create(name="Discus", slug="discus", category=category, price=1200)
        inquiry = Inquiry.objects.create(
            name="Priya", phone="9876543210", type="product", product=product, message="Interested"
        )
        self.assertEqual(inquiry.product, product)

    def test_str_includes_name_and_type(self):
        inquiry = Inquiry.objects.create(name="Priya", phone="9876543210", message="Hi")
        self.assertIn("Priya", str(inquiry))
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
python manage.py test inquiries
```

Expected: `ImportError` — `Inquiry` doesn't exist.

- [ ] **Step 4: Write the model**

`backend/inquiries/models.py`:

```python
from django.db import models

from catalog.models import Product


class Inquiry(models.Model):
    TYPE_CHOICES = [
        ("general", "General"),
        ("product", "Product"),
        ("build_tank", "Build Tank"),
    ]
    STATUS_CHOICES = [
        ("new", "New"),
        ("contacted", "Contacted"),
        ("closed", "Closed"),
    ]

    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="general")
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)
    tank_size = models.CharField(max_length=100, blank=True)
    tank_shape = models.CharField(max_length=100, blank=True)
    budget_notes = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "inquiries"
        indexes = [models.Index(fields=["status"]), models.Index(fields=["type"])]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"
```

`backend/inquiries/admin.py`:

```python
from django.contrib import admin

from .models import Inquiry

admin.site.register(Inquiry)
```

- [ ] **Step 5: Make and run migrations, run tests**

```bash
python manage.py makemigrations inquiries
python manage.py migrate
python manage.py test inquiries
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/inquiries
git commit -m "feat: add Inquiry model"
```

---

### Task 7: Public inquiry creation endpoint

**Files:**
- Create: `backend/inquiries/serializers.py`
- Create: `backend/inquiries/throttles.py`
- Create: `backend/inquiries/views.py`
- Create: `backend/inquiries/urls.py`
- Modify: `backend/config/urls.py` (re-enable the `inquiries.urls` include)
- Create: `backend/inquiries/tests/test_views.py`

**Interfaces:**
- Consumes: `Inquiry` model from Task 6.
- Produces: `POST /api/v1/inquiries/` (public, throttled, `AllowAny`) validating type-conditional fields.

- [ ] **Step 1: Write the failing tests**

`backend/inquiries/tests/test_views.py`:

```python
from rest_framework.test import APITestCase

from inquiries.models import Inquiry


class InquiryCreateViewTests(APITestCase):
    def test_general_inquiry_only_needs_name_phone_message(self):
        response = self.client.post("/api/v1/inquiries/", {
            "name": "Priya", "phone": "9876543210", "message": "Do you sell arowana?",
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Inquiry.objects.count(), 1)

    def test_product_inquiry_requires_product(self):
        response = self.client.post("/api/v1/inquiries/", {
            "name": "Priya", "phone": "9876543210", "message": "Interested", "type": "product",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("product", response.json())

    def test_build_tank_inquiry_requires_size_and_shape(self):
        response = self.client.post("/api/v1/inquiries/", {
            "name": "Priya", "phone": "9876543210", "message": "Custom tank please", "type": "build_tank",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("tank_size", response.json())
        self.assertIn("tank_shape", response.json())

    def test_public_cannot_list_inquiries(self):
        response = self.client.get("/api/v1/inquiries/")
        self.assertIn(response.status_code, (401, 403))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python manage.py test inquiries.tests.test_views
```

Expected: 404s — no URL wired yet.

- [ ] **Step 3: Write the serializer with type-conditional validation**

`backend/inquiries/serializers.py`:

```python
from rest_framework import serializers

from .models import Inquiry


class InquiryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = [
            "name", "phone", "email", "message", "type", "product",
            "tank_size", "tank_shape", "budget_notes",
        ]

    def validate(self, attrs):
        inquiry_type = attrs.get("type", "general")
        if inquiry_type == "product" and not attrs.get("product"):
            raise serializers.ValidationError({"product": "This field is required for product inquiries."})
        if inquiry_type == "build_tank":
            if not attrs.get("tank_size"):
                raise serializers.ValidationError({"tank_size": "This field is required for tank build inquiries."})
            if not attrs.get("tank_shape"):
                raise serializers.ValidationError({"tank_shape": "This field is required for tank build inquiries."})
        return attrs


class InquiryDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = [
            "id", "name", "phone", "email", "message", "type", "product",
            "tank_size", "tank_shape", "budget_notes", "status", "created_at", "updated_at",
        ]
        read_only_fields = [f for f in fields if f != "status"]


class InquiryStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = ["status"]
```

- [ ] **Step 4: Write the throttle**

`backend/inquiries/throttles.py`:

```python
from rest_framework.throttling import AnonRateThrottle


class InquiryCreateThrottle(AnonRateThrottle):
    scope = "inquiry_create"
```

- [ ] **Step 5: Write the view**

`backend/inquiries/views.py`:

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser

from .models import Inquiry
from .serializers import InquiryCreateSerializer, InquiryDetailSerializer, InquiryStatusUpdateSerializer
from .throttles import InquiryCreateThrottle


class InquiryViewSet(viewsets.ModelViewSet):
    queryset = Inquiry.objects.select_related("product").all()
    http_method_names = ["get", "post", "patch"]

    def get_serializer_class(self):
        if self.action == "create":
            return InquiryCreateSerializer
        if self.action == "partial_update":
            return InquiryStatusUpdateSerializer
        return InquiryDetailSerializer

    def get_permissions(self):
        if self.action == "create":
            return []
        return [IsAdminUser()]

    def get_throttles(self):
        if self.action == "create":
            return [InquiryCreateThrottle()]
        return super().get_throttles()
```

Note: `get_permissions` returning `[]` for `create` means no permission classes are checked (equivalent to `AllowAny`), since `DEFAULT_PERMISSION_CLASSES` is `AllowAny` anyway — but being explicit avoids relying on that default for a public write endpoint.

- [ ] **Step 6: Wire URLs**

`backend/inquiries/urls.py`:

```python
from rest_framework.routers import DefaultRouter

from .views import InquiryViewSet

router = DefaultRouter()
router.register("inquiries", InquiryViewSet, basename="inquiry")

urlpatterns = router.urls
```

Add `path("api/v1/", include("inquiries.urls"))` to the `urlpatterns` list in `backend/config/urls.py`, alongside the existing `catalog.urls` include from Task 4.

- [ ] **Step 7: Run tests**

```bash
python manage.py test inquiries
```

Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git add backend/inquiries backend/config/urls.py
git commit -m "feat: public inquiry creation with type-conditional validation and throttling"
```

---

### Task 8: Staff inquiry management endpoints

**Files:**
- Modify: `backend/inquiries/tests/test_views.py`

**Interfaces:**
- Consumes: `InquiryViewSet` from Task 7 (already has `list`/`retrieve`/`partial_update` wired to `IsAdminUser` and `InquiryDetailSerializer`/`InquiryStatusUpdateSerializer`).
- Produces: confirms `GET /api/v1/inquiries/` (staff, filterable by `?status=`), `GET /api/v1/inquiries/<id>/`, `PATCH /api/v1/inquiries/<id>/` (status only) all work end-to-end.

- [ ] **Step 1: Write the failing tests**

Append to `backend/inquiries/tests/test_views.py`:

```python
from django.contrib.auth import get_user_model

User = get_user_model()


class InquiryStaffManagementTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff", password="pw12345", is_staff=True)
        self.inquiry = Inquiry.objects.create(name="Priya", phone="9876543210", message="Hi")

    def test_staff_can_list_inquiries(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get("/api/v1/inquiries/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def test_staff_can_update_status(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.patch(f"/api/v1/inquiries/{self.inquiry.id}/", {"status": "contacted"})
        self.assertEqual(response.status_code, 200)
        self.inquiry.refresh_from_db()
        self.assertEqual(self.inquiry.status, "contacted")

    def test_non_staff_cannot_list_inquiries(self):
        customer = User.objects.create_user(username="customer", password="pw12345")
        self.client.force_authenticate(user=customer)
        response = self.client.get("/api/v1/inquiries/")
        self.assertEqual(response.status_code, 403)
```

- [ ] **Step 2: Add status filtering**

Modify `InquiryViewSet.get_queryset` in `backend/inquiries/views.py`:

```python
def get_queryset(self):
    queryset = Inquiry.objects.select_related("product").all()
    status_param = self.request.query_params.get("status")
    if status_param:
        queryset = queryset.filter(status=status_param)
    return queryset
```

Remove the old `queryset = Inquiry.objects.select_related("product").all()` class attribute line (replaced by the method above).

- [ ] **Step 3: Run tests**

```bash
python manage.py test inquiries
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/inquiries
git commit -m "feat: staff inquiry list/detail/status-update with status filtering"
```

---

### Task 9: JWT auth endpoints

**Files:**
- Create: `backend/core/auth_urls.py`
- Create: `backend/core/auth_views.py`
- Modify: `backend/config/urls.py` (re-enable `core.auth_urls` include)
- Create: `backend/core/tests/test_auth.py`

**Interfaces:**
- Produces: `POST /api/v1/auth/login/` (returns `access`/`refresh`), `POST /api/v1/auth/refresh/`, `GET /api/v1/auth/me/` (returns `{"username": ..., "is_staff": ...}`, requires auth).

- [ ] **Step 1: Write the failing tests**

`backend/core/tests/test_auth.py`:

```python
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()


class AuthTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff", password="pw12345", is_staff=True)

    def test_login_returns_access_and_refresh_tokens(self):
        response = self.client.post("/api/v1/auth/login/", {"username": "staff", "password": "pw12345"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())

    def test_login_fails_with_wrong_password(self):
        response = self.client.post("/api/v1/auth/login/", {"username": "staff", "password": "wrong"})
        self.assertEqual(response.status_code, 401)

    def test_me_requires_authentication(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_username_and_staff_flag(self):
        login = self.client.post("/api/v1/auth/login/", {"username": "staff", "password": "pw12345"})
        access = login.json()["access"]
        response = self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"username": "staff", "is_staff": True})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python manage.py test core.tests.test_auth
```

Expected: 404s — no auth URLs wired yet.

- [ ] **Step 3: Write the `me` view**

`backend/core/auth_views.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({"username": request.user.username, "is_staff": request.user.is_staff})
```

- [ ] **Step 4: Wire URLs**

`backend/core/auth_urls.py`:

```python
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .auth_views import me

urlpatterns = [
    path("login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", me, name="me"),
]
```

Add `path("api/v1/auth/", include("core.auth_urls"))` to the `urlpatterns` list in `backend/config/urls.py`, alongside the `catalog.urls` and `inquiries.urls` includes from Tasks 4 and 7.

- [ ] **Step 5: Run tests**

```bash
python manage.py test core
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/core backend/config/urls.py
git commit -m "feat: JWT login/refresh/me endpoints for staff auth"
```

---

### Task 10: Seed data management command

**Files:**
- Create: `backend/catalog/management/__init__.py`
- Create: `backend/catalog/management/commands/__init__.py`
- Create: `backend/catalog/management/commands/seed_data.py`
- Create: `backend/catalog/tests/test_seed_data.py`

**Interfaces:**
- Produces: `python manage.py seed_data` — idempotent (safe to re-run), creates sample categories/products/portfolio/blog/videos and is the source of truth for the real contact details used by the frontend's static footer/contact content (documented here, not stored as a model, per spec §6 which treats hours/address/phone as site content rather than DB rows).

- [ ] **Step 1: Write the failing test**

`backend/catalog/tests/test_seed_data.py`:

```python
from django.core.management import call_command
from django.test import TestCase

from catalog.models import Category, PortfolioItem, Product, Video


class SeedDataCommandTests(TestCase):
    def test_seed_data_creates_sample_content(self):
        call_command("seed_data")
        self.assertGreater(Category.objects.count(), 0)
        self.assertGreater(Product.objects.count(), 0)
        self.assertGreater(PortfolioItem.objects.count(), 0)
        self.assertGreater(Video.objects.count(), 0)

    def test_seed_data_is_idempotent(self):
        call_command("seed_data")
        first_count = Category.objects.count()
        call_command("seed_data")
        self.assertEqual(Category.objects.count(), first_count)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python manage.py test catalog.tests.test_seed_data
```

Expected: `CommandError: Unknown command: 'seed_data'`.

- [ ] **Step 3: Write the command**

`backend/catalog/management/commands/seed_data.py`:

```python
from django.core.management.base import BaseCommand

from catalog.models import BlogPost, Category, PortfolioItem, Product, Video


class Command(BaseCommand):
    help = "Seed placeholder catalog content for local development and demos."

    def handle(self, *args, **options):
        fish, _ = Category.objects.get_or_create(name="Fish", slug="fish", defaults={"order": 1})
        plants, _ = Category.objects.get_or_create(name="Plants", slug="plants", defaults={"order": 2})
        tanks, _ = Category.objects.get_or_create(name="Tanks", slug="tanks", defaults={"order": 3})

        Category.objects.get_or_create(name="Discus", slug="discus", defaults={"parent": fish, "order": 1})
        Category.objects.get_or_create(name="Arowana", slug="arowana", defaults={"parent": fish, "order": 2})

        Product.objects.get_or_create(
            slug="red-discus",
            defaults={"name": "Red Discus", "category": fish, "price": 1500, "description": "Vibrant red discus, 3 inch."},
        )
        Product.objects.get_or_create(
            slug="anubias-nana",
            defaults={"name": "Anubias Nana", "category": plants, "price": 250, "description": "Hardy low-light aquarium plant."},
        )
        Product.objects.get_or_create(
            slug="60cm-rimless-tank",
            defaults={"name": "60cm Rimless Tank", "category": tanks, "price": 4500, "is_featured": True,
                      "description": "Ultra-clear 60cm rimless glass tank."},
        )

        PortfolioItem.objects.get_or_create(
            title="Living Room Reef Tank", defaults={"description": "A 4ft custom reef build.", "order": 1}
        )

        BlogPost.objects.get_or_create(
            slug="how-to-cycle-a-new-tank",
            defaults={"title": "How to Cycle a New Tank", "body": "A new aquarium needs 2-4 weeks to cycle before adding fish..."},
        )

        Video.objects.get_or_create(
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            defaults={"title": "FNB Aqua Studio Tour", "order": 1},
        )

        self.stdout.write(self.style.SUCCESS("Seed data created."))
```

- [ ] **Step 4: Run tests**

```bash
python manage.py test catalog.tests.test_seed_data
python manage.py seed_data
```

Expected: `OK`, and the command prints "Seed data created." against the real dev database too.

- [ ] **Step 5: Commit**

```bash
git add backend/catalog/management backend/catalog/tests/test_seed_data.py
git commit -m "feat: add idempotent seed_data command for placeholder catalog content"
```

---

## Phase 2 — Frontend foundation

### Task 11: Frontend scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/youtube.js`
- Create: `frontend/src/api/youtube.test.js`

**Interfaces:**
- Produces: `api/client.js` exports a configured `axios` instance (`apiClient`) reading `import.meta.env.VITE_API_BASE_URL`.
- Produces: `api/youtube.js` exports `extractYoutubeVideoId(url)` — pure function, unit tested.

- [ ] **Step 1: Scaffold Vite + React (JSX, not TS)**

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom axios
npm install -D tailwindcss @tailwindcss/postcss postcss vitest
```

- [ ] **Step 2: Configure Tailwind**

`frontend/tailwind.config.js`:

```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#0b0f14",
          light: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
```

`frontend/postcss.config.js`:

```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

`frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Write the API client**

`frontend/.env.example`:

```text
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

`frontend/src/api/client.js`:

```javascript
import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});
```

- [ ] **Step 4: Write the YouTube ID utility and its failing test**

`frontend/src/api/youtube.test.js`:

```javascript
import { describe, expect, it } from "vitest";
import { extractYoutubeVideoId } from "./youtube";

describe("extractYoutubeVideoId", () => {
  it("parses a standard watch URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses a short youtu.be URL", () => {
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns empty string for an unrecognized URL", () => {
    expect(extractYoutubeVideoId("https://example.com")).toBe("");
  });
});
```

Run it to confirm it fails:

```bash
npx vitest run src/api/youtube.test.js
```

Expected: fails — `youtube.js` doesn't exist yet.

`frontend/src/api/youtube.js`:

```javascript
const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/;

export function extractYoutubeVideoId(url) {
  const match = YOUTUBE_ID_PATTERN.exec(url);
  return match ? match[1] : "";
}
```

Run again to confirm it passes:

```bash
npx vitest run src/api/youtube.test.js
```

Expected: 3 passed.

- [ ] **Step 5: Add react-router-dom skeleton**

`frontend/src/App.jsx`:

```jsx
import { BrowserRouter, Route, Routes } from "react-router-dom";

function Placeholder({ label }) {
  return <div className="p-8 text-brand-dark">{label}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder label="Home" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Run the dev server and confirm it boots**

```bash
npm run dev
```

Expected: Vite prints a local URL; opening it in a browser shows "Home" rendered.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "chore: scaffold Vite + React + Tailwind frontend with API client"
```

---

### Task 12: Responsive layout shell — Header, Footer, route skeleton

**Files:**
- Create: `frontend/src/layouts/PublicLayout.jsx`
- Create: `frontend/src/components/public/Header.jsx`
- Create: `frontend/src/components/public/Footer.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Produces: `PublicLayout` component wrapping `<Outlet />` with `Header`/`Footer`; all public page routes in later tasks nest under it.
- Consumes: none (static content plus the real shop details from spec §6, hardcoded here as footer content — no `ShopInfo` model exists per spec).

- [ ] **Step 1: Write the Header with a mobile hamburger menu**

`frontend/src/components/public/Header.jsx`:

```jsx
import { useState } from "react";
import { NavLink } from "react-router-dom";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/fish", label: "Fish" },
  { to: "/plants", label: "Plants" },
  { to: "/products", label: "Products" },
  { to: "/custom-tank-build", label: "Custom Tank Build" },
  { to: "/services", label: "Services" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="bg-brand-dark text-white sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-3">
        <NavLink to="/" className="font-bold text-lg">FNB Aquatic Studio</NavLink>
        <button
          className="md:hidden p-2"
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="block w-6 h-0.5 bg-white mb-1" />
          <span className="block w-6 h-0.5 bg-white mb-1" />
          <span className="block w-6 h-0.5 bg-white" />
        </button>
        <nav className="hidden md:flex gap-6">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="hover:text-yellow-400">
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {isOpen && (
        <nav className="md:hidden flex flex-col gap-3 px-4 pb-4">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setIsOpen(false)} className="hover:text-yellow-400">
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Write the Footer with real shop details**

`frontend/src/components/public/Footer.jsx`:

```jsx
const HOURS = [
  ["Monday", "10am–10pm"],
  ["Tuesday", "10am–10pm"],
  ["Wednesday", "10am–10pm"],
  ["Thursday", "10am–10pm"],
  ["Friday", "10am–10pm"],
  ["Saturday", "10am–10pm"],
  ["Sunday", "10am–10pm"],
];

export default function Footer() {
  return (
    <footer className="bg-brand-dark text-white px-4 py-8 mt-auto">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h3 className="font-semibold mb-2">Visit Us</h3>
          <p>No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai, Greater Chennai, Tamil Nadu 600100</p>
          <p className="mt-2">Phone: 097898 27973</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Hours</h3>
          <ul>
            {HOURS.map(([day, time]) => (
              <li key={day} className="flex justify-between max-w-xs">
                <span>{day}</span>
                <span>{time}</span>
              </li>
            ))}
          </ul>
          <p className="text-yellow-400 text-sm mt-1">Hours may differ on public holidays.</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">FNB Aquatic Studio</h3>
          <p>Custom aquariums, aquascaping, and aquatic livestock.</p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Write the layout and wire it into App**

`frontend/src/layouts/PublicLayout.jsx`:

```jsx
import { Outlet } from "react-router-dom";

import Footer from "../components/public/Footer";
import Header from "../components/public/Header";

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
```

`frontend/src/App.jsx`:

```jsx
import { BrowserRouter, Route, Routes } from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";

function Placeholder({ label }) {
  return <div className="p-8">{label}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Placeholder label="Home" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Manually verify responsiveness**

```bash
npm run dev
```

Open the dev server URL in a browser. At desktop width, confirm the full nav bar shows and the hamburger is hidden. Resize below 768px (or use browser device toolbar for a phone size), confirm the nav collapses to a hamburger button that toggles a vertical menu, and the footer's three columns stack into one on narrow screens.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: responsive header/footer and public layout shell"
```

---

## Phase 3 — Public pages

### Task 13: Home page

**Files:**
- Create: `frontend/src/pages/public/Home.jsx`
- Create: `frontend/src/components/public/ProductCard.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `apiClient` from Task 11; `GET /api/v1/products/?is_featured=true` is NOT filtered server-side (no such query param was built in Task 4) — instead, fetch `GET /api/v1/products/` and filter client-side on `is_featured` for v1 simplicity, since catalog size is small.
- Produces: `ProductCard({ product })` component reused by later catalog pages (Task 15, 16).

- [ ] **Step 1: Write the ProductCard component**

`frontend/src/components/public/ProductCard.jsx`:

```jsx
import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  const image = product.images?.[0];
  return (
    <Link to={`/product/${product.slug}`} className="border rounded-lg p-4 hover:shadow-md transition">
      {image && <img src={image.image} alt={image.alt_text || product.name} className="w-full h-40 object-cover rounded mb-3" />}
      <h3 className="font-semibold">{product.name}</h3>
      <p className="text-sm text-gray-600">₹{product.price}</p>
    </Link>
  );
}
```

- [ ] **Step 2: Write the Home page**

`frontend/src/pages/public/Home.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import ProductCard from "../../components/public/ProductCard";

const PROCESS_STEPS = ["Consultation", "Design & Custom Build", "Installation", "Fish Adding", "Maintenance"];

export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState([]);

  useEffect(() => {
    apiClient.get("/products/").then((response) => {
      setFeaturedProducts(response.data.results.filter((product) => product.is_featured));
    });
  }, []);

  return (
    <div>
      <section className="bg-brand-dark text-white px-4 py-16 text-center">
        <h1 className="text-3xl sm:text-5xl font-bold mb-4">FNB Aquatic Studio</h1>
        <p className="max-w-xl mx-auto mb-6">Custom aquariums, aquascaping, and exotic aquatic livestock in Chennai.</p>
        <Link to="/custom-tank-build" className="bg-yellow-400 text-brand-dark px-6 py-3 rounded font-semibold">
          Build Your Tank
        </Link>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6">Featured Products</h2>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="px-4 py-12 bg-gray-50">
        <h2 className="text-2xl font-semibold mb-6 text-center">Our Process</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {PROCESS_STEPS.map((step) => (
            <div key={step} className="bg-white border rounded-lg px-6 py-4 text-center">{step}</div>
          ))}
        </div>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-4">About FNB Aquatic Studio</h2>
        <p className="max-w-2xl">
          We design, build, and maintain custom aquariums for homes and businesses, and stock a
          curated range of exotic fish, plants, and aquascaping equipment.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Wire the route**

Replace the `Placeholder` Home route in `frontend/src/App.jsx` with:

```jsx
import Home from "./pages/public/Home";
// ...
<Route path="/" element={<Home />} />
```

- [ ] **Step 4: Manually verify**

Start the backend (`python manage.py runserver`) and run `python manage.py seed_data` if not already run. Start `npm run dev`. Visit `/` and confirm the hero, an empty-or-populated featured products grid (the seed data's "60cm Rimless Tank" has `is_featured=True`, so it should appear), the process steps, and the about blurb all render, and the grid reflows from 4 columns → 1 column as the viewport narrows.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: home page with featured products and process steps"
```

---

### Task 14: VideoSlider component + Home integration

**Files:**
- Create: `frontend/src/components/public/VideoSlider.jsx`
- Modify: `frontend/src/pages/public/Home.jsx`

**Interfaces:**
- Consumes: `GET /api/v1/videos/` (returns `video_id`, `thumbnail_url`, `title`).
- Produces: `VideoSlider({ videos })` — horizontally scrollable row of thumbnail banners, each an `<a target="_blank">` to `https://www.youtube.com/watch?v=<video_id>`.

- [ ] **Step 1: Write the VideoSlider component**

`frontend/src/components/public/VideoSlider.jsx`:

```jsx
export default function VideoSlider({ videos }) {
  if (videos.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2">
      {videos.map((video) => (
        <a
          key={video.id}
          href={`https://www.youtube.com/watch?v=${video.video_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex-shrink-0 w-64 h-36 snap-start rounded-lg overflow-hidden"
        >
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-brand-dark text-xl">
              ▶
            </span>
          </span>
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-sm px-2 py-1 truncate">
            {video.title}
          </span>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Fetch videos and render the slider on Home**

Modify `frontend/src/pages/public/Home.jsx` — add state and a fetch alongside the existing featured-products effect, and render the slider:

```jsx
import VideoSlider from "../../components/public/VideoSlider";
// ...
const [videos, setVideos] = useState([]);

useEffect(() => {
  apiClient.get("/videos/").then((response) => setVideos(response.data.results));
}, []);
```

Add a new section, e.g. right after the featured products section:

```jsx
<section className="px-4 py-12">
  <h2 className="text-2xl font-semibold mb-6">Watch Us in Action</h2>
  <VideoSlider videos={videos} />
</section>
```

- [ ] **Step 3: Manually verify**

With the backend running and seeded, reload Home and confirm the video slider shows the seeded "FNB Aqua Studio Tour" thumbnail with a play icon overlay, that it's horizontally scrollable (test by shrinking the browser width so multiple videos would overflow — with one seed video this just confirms layout doesn't break), and clicking it opens `https://www.youtube.com/watch?v=dQw4w9WgXcQ` in a new tab.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat: video slider on home page linking out to YouTube"
```

---

### Task 15: Catalog listing pages (Fish / Plants / Products)

**Files:**
- Create: `frontend/src/components/public/CategoryGrid.jsx`
- Create: `frontend/src/pages/public/CategoryProducts.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/v1/categories/`, `GET /api/v1/products/?category=<slug>`, `ProductCard` from Task 13.
- Produces: one reusable `CategoryProducts` page, parameterized by a `topLevelSlug` prop (`"fish"`, `"plants"`, or unset for the general Products page which shows all top-level non-fish/plants categories).

- [ ] **Step 1: Write CategoryGrid**

`frontend/src/components/public/CategoryGrid.jsx`:

```jsx
import { Link } from "react-router-dom";

export default function CategoryGrid({ categories }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/category/${category.slug}`}
          className="border rounded-lg p-4 text-center hover:shadow-md transition"
        >
          {category.image && <img src={category.image} alt={category.name} className="w-full h-28 object-cover rounded mb-2" />}
          <span className="font-medium">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the CategoryProducts page**

`frontend/src/pages/public/CategoryProducts.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import CategoryGrid from "../../components/public/CategoryGrid";
import ProductCard from "../../components/public/ProductCard";

export default function CategoryProducts({ fixedSlug, title }) {
  const params = useParams();
  const slug = fixedSlug || params.slug;
  const [subcategories, setSubcategories] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    apiClient.get("/categories/").then((response) => {
      setSubcategories(response.data.results.filter((category) => category.parent && String(category.parent) !== ""));
    });
  }, []);

  useEffect(() => {
    if (!slug) return;
    apiClient.get("/products/", { params: { category: slug } }).then((response) => {
      setProducts(response.data.results);
    });
  }, [slug]);

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">{title}</h1>
      {!fixedSlug && subcategories.length > 0 && (
        <div className="mb-8">
          <CategoryGrid categories={subcategories} />
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {products.length === 0 && <p className="text-gray-500">No products in this category yet.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire routes**

Modify `frontend/src/App.jsx`:

```jsx
import CategoryProducts from "./pages/public/CategoryProducts";
// ...
<Route path="/fish" element={<CategoryProducts fixedSlug="fish" title="Fish" />} />
<Route path="/plants" element={<CategoryProducts fixedSlug="plants" title="Plants" />} />
<Route path="/products" element={<CategoryProducts title="Products" />} />
<Route path="/category/:slug" element={<CategoryProducts title="Category" />} />
```

- [ ] **Step 4: Manually verify**

Visit `/fish` and confirm the seeded "Red Discus" product appears (category `fish`). Visit `/products` and confirm it lists top-level categories/products for `tanks` etc. Confirm the grid reflows responsively at phone width.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: category-driven Fish/Plants/Products listing pages"
```

---

### Task 16: Product detail page + inquiry form

**Files:**
- Create: `frontend/src/pages/public/ProductDetail.jsx`
- Create: `frontend/src/components/public/InquiryForm.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/v1/products/<slug>/`, `POST /api/v1/inquiries/`.
- Produces: `InquiryForm({ type, product, onSuccess })` — reused by Task 17 (Custom Tank Build) and Task 20 (Contact Us) with different `type` values.

- [ ] **Step 1: Write the reusable InquiryForm**

`frontend/src/components/public/InquiryForm.jsx`:

```jsx
import { useState } from "react";

import { apiClient } from "../../api/client";

export default function InquiryForm({ type = "general", product = null, extraFields = [] }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [extra, setExtra] = useState({});
  const [status, setStatus] = useState("idle");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("submitting");
    try {
      await apiClient.post("/inquiries/", {
        ...form,
        ...extra,
        type,
        product: product?.id ?? null,
      });
      setStatus("success");
      setForm({ name: "", phone: "", email: "", message: "" });
      setExtra({});
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return <p className="text-green-700">Thanks! We'll get back to you shortly.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 max-w-md">
      <input
        required
        placeholder="Your name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="border rounded px-3 py-2"
      />
      <input
        required
        placeholder="Phone number"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        className="border rounded px-3 py-2"
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="border rounded px-3 py-2"
      />
      {extraFields.map((field) => (
        <input
          key={field.name}
          required
          placeholder={field.label}
          value={extra[field.name] || ""}
          onChange={(e) => setExtra({ ...extra, [field.name]: e.target.value })}
          className="border rounded px-3 py-2"
        />
      ))}
      <textarea
        required
        placeholder="Message"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        className="border rounded px-3 py-2"
        rows={4}
      />
      <button type="submit" disabled={status === "submitting"} className="bg-brand-dark text-white rounded px-4 py-2">
        {status === "submitting" ? "Sending..." : "Send Inquiry"}
      </button>
      {status === "error" && <p className="text-red-600">Something went wrong. Please try again.</p>}
    </form>
  );
}
```

- [ ] **Step 2: Write the ProductDetail page**

`frontend/src/pages/public/ProductDetail.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import InquiryForm from "../../components/public/InquiryForm";

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);

  useEffect(() => {
    apiClient.get(`/products/${slug}/`).then((response) => setProduct(response.data));
  }, [slug]);

  if (!product) return <div className="p-8">Loading...</div>;

  return (
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
        <h2 className="text-xl font-semibold mt-8 mb-3">Enquire about this product</h2>
        <InquiryForm type="product" product={product} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the route**

Modify `frontend/src/App.jsx`:

```jsx
import ProductDetail from "./pages/public/ProductDetail";
// ...
<Route path="/product/:slug" element={<ProductDetail />} />
```

- [ ] **Step 4: Manually verify**

Visit `/product/60cm-rimless-tank`, confirm product details render, submit the inquiry form with a name/phone/message and confirm the success message appears; check the Django admin (`/admin/inquiries/inquiry/`) to confirm the row was created with `type="product"` and the correct `product` FK.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: product detail page with reusable inquiry form"
```

---

### Task 17: Custom Tank Build page

**Files:**
- Create: `frontend/src/pages/public/CustomTankBuild.jsx`
- Modify: `frontend/src/components/public/InquiryForm.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `InquiryForm` from Task 16, extended to submit `tank_size`/`tank_shape`/`budget_notes` via its existing `extraFields` mechanism.

- [ ] **Step 1: Confirm InquiryForm's extraFields already covers this**

No changes needed to `InquiryForm.jsx` — its `extraFields` prop already maps arbitrary `{name, label}` pairs into the submitted payload, which covers `tank_size`, `tank_shape`, and `budget_notes`.

- [ ] **Step 2: Write the CustomTankBuild page**

`frontend/src/pages/public/CustomTankBuild.jsx`:

```jsx
import InquiryForm from "../../components/public/InquiryForm";

const TANK_BUILD_FIELDS = [
  { name: "tank_size", label: "Tank size (e.g. 4ft x 2ft x 2ft)" },
  { name: "tank_shape", label: "Tank shape (e.g. rectangular, bow-front)" },
  { name: "budget_notes", label: "Budget (optional)" },
];

export default function CustomTankBuild() {
  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Build Your Tank</h1>
      <p className="mb-6 text-gray-700">
        Tell us the size and shape of the aquarium you want, and we'll get back to you with a
        customized quote.
      </p>
      <InquiryForm type="build_tank" extraFields={TANK_BUILD_FIELDS} />
    </div>
  );
}
```

- [ ] **Step 3: Make `budget_notes` optional in the form**

The backend requires `tank_size` and `tank_shape` but not `budget_notes` (Task 6/7). Modify `InquiryForm.jsx`'s `extraFields.map` to accept an optional `required` flag per field, defaulting to `true`:

```jsx
{extraFields.map((field) => (
  <input
    key={field.name}
    required={field.required !== false}
    placeholder={field.label}
    value={extra[field.name] || ""}
    onChange={(e) => setExtra({ ...extra, [field.name]: e.target.value })}
    className="border rounded px-3 py-2"
  />
))}
```

Update `TANK_BUILD_FIELDS`'s budget entry to `{ name: "budget_notes", label: "Budget (optional)", required: false }`.

- [ ] **Step 4: Wire the route**

Modify `frontend/src/App.jsx`:

```jsx
import CustomTankBuild from "./pages/public/CustomTankBuild";
// ...
<Route path="/custom-tank-build" element={<CustomTankBuild />} />
```

- [ ] **Step 5: Manually verify**

Visit `/custom-tank-build`, submit with a tank size and shape filled in, confirm success. Submit again leaving tank size blank — browser's native `required` validation should block submission before it reaches the API.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: custom tank build inquiry page"
```

---

### Task 18: Services and About pages

**Files:**
- Create: `frontend/src/pages/public/Services.jsx`
- Create: `frontend/src/pages/public/About.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- No API dependency — static content pages per spec (Services/About aren't backed by a dedicated model in §5).

- [ ] **Step 1: Write the Services page**

`frontend/src/pages/public/Services.jsx`:

```jsx
const SERVICES = [
  { title: "Custom Aquarium Design & Build", description: "Bespoke tanks designed and installed for homes and businesses." },
  { title: "Aquascaping", description: "Planted and hardscape aquascaping for freshwater and marine setups." },
  { title: "Maintenance Contracts", description: "Scheduled cleaning, water testing, and livestock health checks." },
  { title: "Livestock Sourcing", description: "Sourcing of exotic fish and plants on request." },
];

export default function Services() {
  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Services</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        {SERVICES.map((service) => (
          <div key={service.title} className="border rounded-lg p-4">
            <h2 className="font-semibold mb-1">{service.title}</h2>
            <p className="text-gray-700">{service.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the About page**

`frontend/src/pages/public/About.jsx`:

```jsx
export default function About() {
  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">About FNB Aquatic Studio</h1>
      <p className="mb-4">
        FNB Aquatic Studio designs, builds, and maintains custom aquariums for homes and
        businesses in Chennai, and stocks a curated range of exotic fish, aquatic plants, and
        aquascaping equipment.
      </p>
      <p>
        Visit our studio at No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai,
        Greater Chennai, Tamil Nadu 600100, open daily from 10am to 10pm.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Wire routes**

Modify `frontend/src/App.jsx`:

```jsx
import About from "./pages/public/About";
import Services from "./pages/public/Services";
// ...
<Route path="/services" element={<Services />} />
<Route path="/about" element={<About />} />
```

- [ ] **Step 4: Manually verify**

Visit `/services` and `/about`, confirm content renders and reflows correctly on mobile width.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: services and about pages"
```

---

### Task 19: Portfolio and Blog pages

**Files:**
- Create: `frontend/src/pages/public/Portfolio.jsx`
- Create: `frontend/src/pages/public/Blog.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/v1/portfolio/`, `GET /api/v1/blog/`.

- [ ] **Step 1: Write the Portfolio page**

`frontend/src/pages/public/Portfolio.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function Portfolio() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    apiClient.get("/portfolio/").then((response) => setItems(response.data.results));
  }, []);

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Portfolio</h1>
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="border rounded-lg overflow-hidden">
            {item.image && <img src={item.image} alt={item.title} className="w-full h-48 object-cover" />}
            <div className="p-4">
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-gray-600 text-sm">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the Blog page**

`frontend/src/pages/public/Blog.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function Blog() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    apiClient.get("/blog/").then((response) => setPosts(response.data.results));
  }, []);

  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Blog</h1>
      <div className="grid gap-6">
        {posts.map((post) => (
          <article key={post.id} className="border-b pb-4">
            <h2 className="font-semibold text-lg">{post.title}</h2>
            <p className="text-gray-700 mt-1">{post.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire routes**

Modify `frontend/src/App.jsx`:

```jsx
import Blog from "./pages/public/Blog";
import Portfolio from "./pages/public/Portfolio";
// ...
<Route path="/portfolio" element={<Portfolio />} />
<Route path="/blog" element={<Blog />} />
```

- [ ] **Step 4: Manually verify**

Visit `/portfolio` and `/blog`, confirm the seeded "Living Room Reef Tank" and "How to Cycle a New Tank" entries render, and that grids reflow on mobile width.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: portfolio and blog listing pages"
```

---

### Task 20: Contact Us page

**Files:**
- Create: `frontend/src/pages/public/Contact.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `InquiryForm` (type `"general"`).

- [ ] **Step 1: Write the Contact page**

`frontend/src/pages/public/Contact.jsx`:

```jsx
import InquiryForm from "../../components/public/InquiryForm";

export default function Contact() {
  return (
    <div className="px-4 py-8 grid gap-8 md:grid-cols-2 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Contact Us</h1>
        <p>No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai, Greater Chennai, Tamil Nadu 600100</p>
        <p className="mt-2">Phone: 097898 27973</p>
        <p className="mt-2 text-sm text-gray-600">Open daily 10am–10pm. Hours may differ on public holidays.</p>
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-3">Send us a message</h2>
        <InquiryForm type="general" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

Modify `frontend/src/App.jsx`:

```jsx
import Contact from "./pages/public/Contact";
// ...
<Route path="/contact" element={<Contact />} />
```

- [ ] **Step 3: Manually verify**

Visit `/contact`, confirm shop details render, submit the general inquiry form, confirm success and that the created `Inquiry` row has `type="general"`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat: contact us page with shop details and general inquiry form"
```

---

### Task 21: Policy pages

**Files:**
- Create: `frontend/src/pages/public/StaticPage.jsx`
- Create: `frontend/src/content/policies.js`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Produces: one reusable `StaticPage` component driven by a `slug` route param and a `POLICIES` lookup object.

- [ ] **Step 1: Write the policy content**

`frontend/src/content/policies.js`:

```javascript
export const POLICIES = {
  "privacy-policy": {
    title: "Privacy Policy",
    body: "We collect only the contact details you provide through our inquiry forms, used solely to respond to your request. We do not sell or share your information with third parties.",
  },
  "shipping-policy": {
    title: "Shipping Policy",
    body: "Livestock and equipment delivery is arranged directly with our team after your inquiry is confirmed; delivery timelines depend on species and location.",
  },
  "terms-conditions": {
    title: "Terms & Conditions",
    body: "All product information on this site is indicative. Final pricing and availability are confirmed directly with our team before any sale.",
  },
  "return-policy": {
    title: "Return Policy",
    body: "Due to the nature of live aquatic stock, returns are handled case-by-case — please contact us within 24 hours of receiving livestock with any concerns.",
  },
};
```

- [ ] **Step 2: Write the StaticPage component**

`frontend/src/pages/public/StaticPage.jsx`:

```jsx
import { useParams } from "react-router-dom";

import { POLICIES } from "../../content/policies";

export default function StaticPage() {
  const { slug } = useParams();
  const policy = POLICIES[slug];

  if (!policy) return <div className="p-8">Page not found.</div>;

  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">{policy.title}</h1>
      <p>{policy.body}</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire the route**

Modify `frontend/src/App.jsx`:

```jsx
import StaticPage from "./pages/public/StaticPage";
// ...
<Route path="/policies/:slug" element={<StaticPage />} />
```

Add links to these in the Footer (`frontend/src/components/public/Footer.jsx`), e.g. a fourth column:

```jsx
<div>
  <h3 className="font-semibold mb-2">Policies</h3>
  <ul className="grid gap-1">
    <li><a href="/policies/privacy-policy">Privacy Policy</a></li>
    <li><a href="/policies/shipping-policy">Shipping Policy</a></li>
    <li><a href="/policies/terms-conditions">Terms & Conditions</a></li>
    <li><a href="/policies/return-policy">Return Policy</a></li>
  </ul>
</div>
```

- [ ] **Step 4: Manually verify**

Visit `/policies/privacy-policy` through `/policies/return-policy`, confirm each renders its own title/body, and confirm footer links navigate correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: policy pages via reusable static page component"
```

---

## Phase 4 — Admin panel

### Task 22: Auth context, admin login, protected route guard

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Create: `frontend/src/pages/admin/Login.jsx`
- Create: `frontend/src/components/admin/AdminGuard.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Produces: `AuthContext` exposing `{ isAuthenticated, isStaff, login(username, password), logout() }`; `apiClient` request interceptor attaches `Authorization: Bearer <access>` when present.
- Consumes: `POST /api/v1/auth/login/`, `GET /api/v1/auth/me/`.

- [ ] **Step 1: Write the AuthContext**

`frontend/src/context/AuthContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("access"));
  const [isStaff, setIsStaff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const interceptorId = apiClient.interceptors.request.use((config) => {
      const token = localStorage.getItem("access");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => apiClient.interceptors.request.eject(interceptorId);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    apiClient
      .get("/auth/me/")
      .then((response) => setIsStaff(response.data.is_staff))
      .catch(() => {
        setAccessToken(null);
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  const login = async (username, password) => {
    const response = await apiClient.post("/auth/login/", { username, password });
    localStorage.setItem("access", response.data.access);
    localStorage.setItem("refresh", response.data.refresh);
    setAccessToken(response.data.access);
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    setAccessToken(null);
    setIsStaff(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: Boolean(accessToken), isStaff, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Wrap the app in AuthProvider**

`frontend/src/main.jsx` — wrap `<App />` with `<AuthProvider>`:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Write the AdminGuard**

`frontend/src/components/admin/AdminGuard.jsx`:

```jsx
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

export default function AdminGuard() {
  const { isAuthenticated, isStaff, isLoading } = useAuth();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!isAuthenticated || !isStaff) return <Navigate to="/admin/login" replace />;

  return <Outlet />;
}
```

- [ ] **Step 4: Write the Login page**

`frontend/src/pages/admin/Login.jsx`:

```jsx
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (isAuthenticated) return <Navigate to="/admin" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/admin");
    } catch {
      setError("Invalid username or password.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-8 w-full max-w-sm grid gap-3">
        <h1 className="text-xl font-semibold mb-2">FNB Aqua Admin</h1>
        <input
          required
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          required
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded px-3 py-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="bg-brand-dark text-white rounded px-4 py-2">Log in</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Wire routes**

Modify `frontend/src/App.jsx`:

```jsx
import AdminGuard from "./components/admin/AdminGuard";
import Login from "./pages/admin/Login";
// ...
<Route path="/admin/login" element={<Login />} />
<Route path="/admin" element={<AdminGuard />}>
  <Route index element={<div className="p-8">Admin Dashboard (Task 23)</div>} />
</Route>
```

- [ ] **Step 6: Manually verify**

Create a staff user (`python manage.py createsuperuser`) if not already done. Visit `/admin`, confirm it redirects to `/admin/login`. Log in with valid credentials, confirm redirect to `/admin` shows the placeholder dashboard text. Reload the page — confirm it stays authenticated (token persisted in `localStorage`). Log out (temporarily call `logout()` from browser devtools console via React context, or wire a logout button in Task 23) and confirm `/admin` redirects to login again.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: JWT auth context, admin login, and protected admin route guard"
```

---

### Task 23: Admin dashboard shell + Categories & Products management

**Files:**
- Create: `frontend/src/layouts/AdminLayout.jsx`
- Create: `frontend/src/pages/admin/CategoriesManager.jsx`
- Create: `frontend/src/pages/admin/ProductsManager.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/v1/categories/`, `/api/v1/products/` (JWT-authenticated via the `AuthContext` interceptor from Task 22).

- [ ] **Step 1: Write the AdminLayout with sidebar**

`frontend/src/layouts/AdminLayout.jsx`:

```jsx
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/videos", label: "Videos" },
  { to: "/admin/inquiries", label: "Inquiries" },
];

export default function AdminLayout() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <nav className="bg-brand-dark text-white flex md:flex-col gap-2 p-4 md:w-56">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} className="hover:text-yellow-400">
            {link.label}
          </NavLink>
        ))}
        <button onClick={logout} className="mt-auto text-left hover:text-yellow-400">Log out</button>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Write CategoriesManager**

`frontend/src/pages/admin/CategoriesManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", slug: "" });

  const load = () => apiClient.get("/categories/").then((response) => setCategories(response.data.results));

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await apiClient.post("/categories/", form);
    setForm({ name: "", slug: "" });
    load();
  };

  const handleDelete = async (slug) => {
    await apiClient.delete(`/categories/${slug}/`);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Categories</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded px-3 py-2"
        />
        <input
          required
          placeholder="Slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="border rounded px-3 py-2"
        />
        <button type="submit" className="bg-brand-dark text-white rounded px-4 py-2">Add</button>
      </form>
      <table className="w-full text-left">
        <thead>
          <tr><th>Name</th><th>Slug</th><th></th></tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className="border-t">
              <td>{category.name}</td>
              <td>{category.slug}</td>
              <td><button onClick={() => handleDelete(category.slug)} className="text-red-600">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Write ProductsManager**

`frontend/src/pages/admin/ProductsManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", slug: "", category: "", price: "", description: "" });

  const load = () => apiClient.get("/products/").then((response) => setProducts(response.data.results));

  useEffect(() => {
    load();
    apiClient.get("/categories/").then((response) => setCategories(response.data.results));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await apiClient.post("/products/", { ...form, category: Number(form.category), price: Number(form.price) });
    setForm({ name: "", slug: "", category: "", price: "", description: "" });
    load();
  };

  const handleDelete = async (slug) => {
    await apiClient.delete(`/products/${slug}/`);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Products</h1>
      <form onSubmit={handleSubmit} className="grid gap-2 mb-6 max-w-md">
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2" />
        <input required placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="border rounded px-3 py-2" />
        <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded px-3 py-2">
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <input required type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="border rounded px-3 py-2" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-3 py-2" />
        <button type="submit" className="bg-brand-dark text-white rounded px-4 py-2">Add Product</button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Name</th><th>Price</th><th></th></tr></thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t">
              <td>{product.name}</td>
              <td>₹{product.price}</td>
              <td><button onClick={() => handleDelete(product.slug)} className="text-red-600">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Wire routes**

Modify `frontend/src/App.jsx` — replace the placeholder `/admin` route with a nested `AdminLayout`:

```jsx
import AdminLayout from "./layouts/AdminLayout";
import CategoriesManager from "./pages/admin/CategoriesManager";
import ProductsManager from "./pages/admin/ProductsManager";
// ...
<Route path="/admin" element={<AdminGuard />}>
  <Route element={<AdminLayout />}>
    <Route index element={<Navigate to="/admin/categories" replace />} />
    <Route path="categories" element={<CategoriesManager />} />
    <Route path="products" element={<ProductsManager />} />
  </Route>
</Route>
```

(Import `Navigate` from `react-router-dom` if not already imported in `App.jsx`.)

- [ ] **Step 5: Manually verify**

Log in at `/admin/login`, confirm the sidebar shows, add a new category, confirm it appears in the table and (in another tab) in `GET /api/v1/categories/`. Add a product referencing that category, confirm it appears. Delete both, confirm they disappear. Test on a narrow viewport — sidebar should stack above content per the `flex md:flex-row` layout.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: admin dashboard shell with categories and products management"
```

---

### Task 24: Admin Videos and Inquiries management

**Files:**
- Create: `frontend/src/pages/admin/VideosManager.jsx`
- Create: `frontend/src/pages/admin/InquiriesManager.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/v1/videos/`, `GET /api/v1/inquiries/?status=`, `PATCH /api/v1/inquiries/<id>/`.

- [ ] **Step 1: Write VideosManager**

`frontend/src/pages/admin/VideosManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function VideosManager() {
  const [videos, setVideos] = useState([]);
  const [form, setForm] = useState({ title: "", youtube_url: "" });

  const load = () => apiClient.get("/videos/").then((response) => setVideos(response.data.results));

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await apiClient.post("/videos/", form);
    setForm({ title: "", youtube_url: "" });
    load();
  };

  const handleDelete = async (id) => {
    await apiClient.delete(`/videos/${id}/`);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Videos</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border rounded px-3 py-2" />
        <input required placeholder="YouTube URL" value={form.youtube_url} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} className="border rounded px-3 py-2 flex-1" />
        <button type="submit" className="bg-brand-dark text-white rounded px-4 py-2">Add</button>
      </form>
      <ul className="grid gap-2">
        {videos.map((video) => (
          <li key={video.id} className="flex items-center gap-3 border-t pt-2">
            <img src={video.thumbnail_url} alt={video.title} className="w-20 h-12 object-cover rounded" />
            <span className="flex-1">{video.title}</span>
            <button onClick={() => handleDelete(video.id)} className="text-red-600">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Write InquiriesManager**

`frontend/src/pages/admin/InquiriesManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

const STATUS_OPTIONS = ["new", "contacted", "closed"];

export default function InquiriesManager() {
  const [inquiries, setInquiries] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () =>
    apiClient
      .get("/inquiries/", { params: statusFilter ? { status: statusFilter } : {} })
      .then((response) => setInquiries(response.data.results));

  useEffect(() => {
    load();
  }, [statusFilter]);

  const updateStatus = async (id, status) => {
    await apiClient.patch(`/inquiries/${id}/`, { status });
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Inquiries</h1>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 mb-4">
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <div className="grid gap-3">
        {inquiries.map((inquiry) => (
          <div key={inquiry.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{inquiry.name} — {inquiry.phone}</p>
                <p className="text-sm text-gray-600">{inquiry.type} · {new Date(inquiry.created_at).toLocaleString()}</p>
              </div>
              <select value={inquiry.status} onChange={(e) => updateStatus(inquiry.id, e.target.value)} className="border rounded px-2 py-1">
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <p className="mt-2">{inquiry.message}</p>
            {inquiry.tank_size && <p className="text-sm text-gray-600">Tank: {inquiry.tank_size}, {inquiry.tank_shape}</p>}
          </div>
        ))}
        {inquiries.length === 0 && <p className="text-gray-500">No inquiries.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire routes**

Modify `frontend/src/App.jsx`, adding under the existing `AdminLayout` nested routes:

```jsx
import InquiriesManager from "./pages/admin/InquiriesManager";
import VideosManager from "./pages/admin/VideosManager";
// ...
<Route path="videos" element={<VideosManager />} />
<Route path="inquiries" element={<InquiriesManager />} />
```

- [ ] **Step 4: Manually verify**

Add a video via the admin form using a real YouTube URL, confirm the thumbnail preview loads and it appears on the public Home slider (Task 14). Submit a public inquiry from `/contact`, confirm it shows under `/admin/inquiries` with status "new", change its status to "contacted" via the dropdown, reload and confirm the change persisted. Filter by status and confirm the list narrows correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: admin videos and inquiries management"
```

---

## Phase 5 — Branding & polish

### Task 25: Logo asset and integration

**Files:**
- Create: `frontend/public/logo.svg`
- Create: `frontend/public/favicon.svg`
- Modify: `frontend/index.html`
- Modify: `frontend/src/components/public/Header.jsx`
- Modify: `frontend/src/components/public/Footer.jsx`

**Interfaces:**
- Produces: `/logo.svg` usable by `<img src="/logo.svg" />` in Header/Footer; `/favicon.svg` referenced from `index.html`.

- [ ] **Step 1: Create the high-resolution logo SVG**

Recreate the "FNB AQUATIC STUDIO" mark as a clean vector — a stylized wave/fish curve above bold wordmark text, matching the dark navy/white palette of the original.

`frontend/public/logo.svg`:

```xml
<svg viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="FNB Aquatic Studio logo">
  <rect width="400" height="160" fill="#0b0f14"/>
  <path d="M40 60 Q100 20 160 60 T280 60 T360 60" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round"/>
  <text x="200" y="105" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="46" fill="#ffffff" letter-spacing="4">FNB</text>
  <text x="200" y="135" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="16" fill="#ffffff" letter-spacing="3">AQUATIC STUDIO</text>
</svg>
```

`frontend/public/favicon.svg` (a simplified square mark for small sizes):

```xml
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" fill="#0b0f14"/>
  <path d="M8 32 Q20 20 32 32 T56 32" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <text x="32" y="50" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="#ffffff">F</text>
</svg>
```

- [ ] **Step 2: Wire the favicon**

Modify `frontend/index.html` — replace the default `<link rel="icon" ...>` with:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

- [ ] **Step 3: Use the logo in Header and Footer**

Modify `frontend/src/components/public/Header.jsx` — replace the text `NavLink` brand with:

```jsx
<NavLink to="/" className="flex items-center gap-2">
  <img src="/logo.svg" alt="FNB Aquatic Studio" className="h-10 w-auto" />
</NavLink>
```

Modify `frontend/src/components/public/Footer.jsx` — add near the top of the footer grid:

```jsx
<img src="/logo.svg" alt="FNB Aquatic Studio" className="h-12 w-auto mb-3" />
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, confirm the browser tab shows the favicon, and the header/footer both render the logo crisply at different viewport widths (no pixelation, since it's SVG).

- [ ] **Step 5: Commit**

```bash
git add frontend/public frontend/index.html frontend/src/components/public
git commit -m "feat: add recreated FNB Aquatic Studio logo and favicon"
```

---

### Task 26: Responsive QA pass and production build verification

**Files:**
- No new files — verification and any small fixes discovered during QA land as amendments to existing files from Tasks 12–25.

**Interfaces:**
- N/A — this is a verification task.

- [ ] **Step 1: Backend production settings sanity check**

```bash
cd backend
set DJANGO_SETTINGS_MODULE=config.settings.production
set SECRET_KEY=test-only-secret
set DATABASE_URL=postgres://fnbaqua:fnbaqua@localhost:5432/fnbaqua
set AWS_STORAGE_BUCKET_NAME=test-bucket
python manage.py check --deploy
```

Expected: no errors (warnings about things genuinely deferred to real deployment, like `SECRET_KEY` strength in this test run, are acceptable here — this just confirms the production settings module imports and validates cleanly).

- [ ] **Step 2: Frontend production build**

```bash
cd frontend
npm run build
npm run preview
```

Expected: build completes without errors; `npm run preview` serves the production bundle — open it and confirm the Home page and a couple of other routes load correctly (client-side routing on a static preview server may 404 on direct sub-route loads, which is expected and resolved by proper server-side rewrite rules at actual deployment time, not part of this task).

- [ ] **Step 3: Manual responsive sweep**

Using the browser's device toolbar (or by resizing the window), check each of these at phone (~375px), tablet (~768px), and desktop (~1280px) widths: Home, a category listing page, a product detail page, Contact, and the admin dashboard (Categories + Inquiries views). Confirm: nav collapses/expands correctly at the `md` breakpoint, grids reflow to fewer columns on narrow widths, the video slider remains horizontally scrollable and swipeable, forms remain usable (no overflow, tap targets aren't cramped), and the admin sidebar stacks above content on mobile.

- [ ] **Step 4: Fix any issues found**

If any breakpoint issue is found, fix it directly in the relevant component from Tasks 12–24 (e.g., adjusting a Tailwind responsive class), then re-check that specific page at all three widths.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: responsive QA pass and production build verification"
```
