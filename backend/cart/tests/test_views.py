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
