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
