from django.contrib.auth import get_user_model

from rest_framework.test import APITestCase

from catalog.models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video

User = get_user_model()


class CategoryListViewTests(APITestCase):
    def test_list_categories_is_public(self):
        Category.objects.create(name="Fish", slug="fish")
        response = self.client.get("/api/v1/categories/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def test_retrieve_category_by_slug(self):
        Category.objects.create(name="Fish", slug="fish", description="Freshwater fish")

        response = self.client.get("/api/v1/categories/fish/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["slug"], "fish")
        self.assertEqual(data["name"], "Fish")
        self.assertEqual(data["description"], "Freshwater fish")

    def test_write_methods_are_rejected_for_anonymous_users(self):
        # Categories are now a staff-only write API (see CategoryWritePermissionTests
        # below) — anonymous writes are blocked by permissions (401), not routing (405).
        response = self.client.post("/api/v1/categories/", {"name": "New", "slug": "new"})

        self.assertEqual(response.status_code, 401)


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

    def test_filter_products_by_nonexistent_category_slug_returns_empty(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        Product.objects.create(name="Discus", slug="discus", category=fish, price=1200)

        response = self.client.get("/api/v1/products/", {"category": "does-not-exist"})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["results"], [])

    def test_retrieve_product_by_slug_includes_nested_images(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        discus = Product.objects.create(name="Discus", slug="discus", category=fish, price=1200)
        ProductImage.objects.create(product=discus, image="products/discus.jpg", alt_text="Discus")

        response = self.client.get("/api/v1/products/discus/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["slug"], "discus")
        self.assertEqual(len(data["images"]), 1)
        self.assertEqual(data["images"][0]["alt_text"], "Discus")


class PortfolioItemListViewTests(APITestCase):
    def test_list_portfolio_items_is_paginated(self):
        PortfolioItem.objects.create(title="Aquarium setup", description="A big tank")

        response = self.client.get("/api/v1/portfolio/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["title"], "Aquarium setup")


class BlogPostListViewTests(APITestCase):
    def test_list_blog_posts(self):
        BlogPost.objects.create(title="Fish care 101", slug="fish-care-101", body="Some tips")

        response = self.client.get("/api/v1/blog/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["slug"], "fish-care-101")

    def test_retrieve_blog_post_by_slug(self):
        BlogPost.objects.create(title="Fish care 101", slug="fish-care-101", body="Some tips")

        response = self.client.get("/api/v1/blog/fish-care-101/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Fish care 101")
        self.assertEqual(data["body"], "Some tips")


class VideoListViewTests(APITestCase):
    def test_only_active_videos_are_listed(self):
        Video.objects.create(title="Active", youtube_url="https://youtu.be/aaaaaaaaaaa", is_active=True)
        Video.objects.create(title="Inactive", youtube_url="https://youtu.be/bbbbbbbbbbb", is_active=False)

        response = self.client.get("/api/v1/videos/")

        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Active")


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
