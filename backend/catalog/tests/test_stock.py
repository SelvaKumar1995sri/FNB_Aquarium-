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
