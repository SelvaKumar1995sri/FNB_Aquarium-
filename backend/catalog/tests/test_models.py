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
