from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Category, Product
from orders.models import CheckoutSession

User = get_user_model()


class CheckoutViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.address = Address.objects.create(
            user=self.user, full_name="A", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5,
        )
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=self.cart, product=self.product, quantity=2)

    def test_requires_authentication(self):
        response = self.client.post("/api/v1/checkout/", {"address": self.address.id})
        self.assertEqual(response.status_code, 401)

    @patch("orders.views.get_razorpay_client")
    def test_creates_razorpay_order_and_checkout_session(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.order.create.return_value = {"id": "order_test123", "amount": 20000, "currency": "INR"}
        mock_get_client.return_value = mock_client

        response = self.client.post("/api/v1/checkout/", {"address": self.address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["razorpay_order_id"], "order_test123")
        self.assertEqual(data["amount"], "200.00")
        self.assertEqual(data["currency"], "INR")
        self.assertIn("razorpay_key_id", data)

        session = CheckoutSession.objects.get(razorpay_order_id="order_test123")
        self.assertEqual(session.user, self.user)
        self.assertEqual(session.address, self.address)
        self.assertEqual(str(session.amount), "200.00")
        self.assertEqual(len(session.items_snapshot), 1)
        self.assertEqual(session.items_snapshot[0]["quantity"], 2)
        mock_client.order.create.assert_called_once_with({"amount": 20000, "currency": "INR", "payment_capture": 1})

    @patch("orders.views.get_razorpay_client")
    def test_rejects_empty_cart(self, mock_get_client):
        CartItem.objects.filter(cart=self.cart).delete()

        response = self.client.post("/api/v1/checkout/", {"address": self.address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 400)
        self.assertIn("cart", response.json())
        mock_get_client.assert_not_called()

    @patch("orders.views.get_razorpay_client")
    def test_rejects_item_exceeding_current_stock(self, mock_get_client):
        self.product.stock_quantity = 1
        self.product.save()

        response = self.client.post("/api/v1/checkout/", {"address": self.address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 400)
        self.assertIn("cart", response.json())
        mock_get_client.assert_not_called()

    @patch("orders.views.get_razorpay_client")
    def test_rejects_invalid_address(self, mock_get_client):
        other = User.objects.create_user(username="b@example.com", password="pw12345678")
        their_address = Address.objects.create(
            user=other, full_name="B", phone="1", line1="x", city="c", state="s", pincode="500002",
        )

        response = self.client.post("/api/v1/checkout/", {"address": their_address.id}, **self.auth_header)

        self.assertEqual(response.status_code, 400)
        self.assertIn("address", response.json())
        mock_get_client.assert_not_called()
