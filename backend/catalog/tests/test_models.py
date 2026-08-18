from django.db import IntegrityError, transaction
from django.test import TestCase

from catalog.models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video


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
        self.assertFalse(product.in_stock)
        self.assertFalse(product.is_featured)


class ProductUniqueNamePerCategoryConstraintTests(TestCase):
    def test_duplicate_name_in_same_category_is_rejected_case_insensitively_at_db_level(self):
        category = Category.objects.create(name="Fish", slug="fish")
        Product.objects.create(name="Discus", slug="discus", category=category, price=1200)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Product.objects.create(name="DISCUS", slug="discus-2", category=category, price=1300)

    def test_same_name_in_different_categories_is_allowed(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        plants = Category.objects.create(name="Plants", slug="plants")
        Product.objects.create(name="Discus", slug="discus", category=fish, price=1200)

        product = Product.objects.create(name="Discus", slug="discus-plants", category=plants, price=1300)

        self.assertIsNotNone(product.pk)


class ProductImageModelTests(TestCase):
    def test_related_name_is_images(self):
        category = Category.objects.create(name="Tanks", slug="tanks")
        product = Product.objects.create(
            name="60cm Rimless Tank", slug="60cm-rimless-tank", category=category, price=4500
        )
        ProductImage.objects.create(product=product, alt_text="Front view", order=1)
        self.assertEqual(product.images.count(), 1)


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

    def test_default_thumbnail_url_is_empty_for_malformed_url(self):
        video = Video.objects.create(
            title="Tank tour", youtube_url="https://example.com/not-a-youtube-link"
        )
        self.assertEqual(video.video_id, "")
        self.assertEqual(video.default_thumbnail_url, "")
