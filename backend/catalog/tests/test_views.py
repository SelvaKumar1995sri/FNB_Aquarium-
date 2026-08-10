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
