from django.core.management import call_command
from django.test import TestCase

from catalog.models import BlogPost, Category, PortfolioItem, Product, Video


class SeedDataCommandTests(TestCase):
    def test_seed_data_creates_sample_content(self):
        call_command("seed_data")
        self.assertGreater(Category.objects.count(), 0)
        self.assertGreater(Product.objects.count(), 0)
        self.assertGreater(PortfolioItem.objects.count(), 0)
        self.assertGreater(Video.objects.count(), 0)

    def test_seed_data_is_idempotent(self):
        call_command("seed_data")
        first_count_categories = Category.objects.count()
        first_count_products = Product.objects.count()
        first_count_portfolio = PortfolioItem.objects.count()
        first_count_blog = BlogPost.objects.count()
        first_count_videos = Video.objects.count()

        call_command("seed_data")

        self.assertEqual(Category.objects.count(), first_count_categories)
        self.assertEqual(Product.objects.count(), first_count_products)
        self.assertEqual(PortfolioItem.objects.count(), first_count_portfolio)
        self.assertEqual(BlogPost.objects.count(), first_count_blog)
        self.assertEqual(Video.objects.count(), first_count_videos)
