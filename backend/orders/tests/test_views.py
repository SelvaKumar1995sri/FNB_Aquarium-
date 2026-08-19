import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Category, Product
from orders.models import CheckoutSession, Order, OrderItem

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
    def test_cod_checkout_creates_the_order_immediately_with_no_razorpay_charge(self, mock_get_client):
        response = self.client.post(
            "/api/v1/checkout/", {"address": self.address.id, "payment_method": "cod"}, **self.auth_header
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["payment_method"], "cod")
        self.assertEqual(data["total_amount"], "200.00")
        self.assertTrue(data["razorpay_order_id"].startswith("cod_"))
        mock_get_client.assert_not_called()

        order = Order.objects.get(razorpay_order_id=data["razorpay_order_id"])
        self.assertEqual(order.user, self.user)
        self.assertEqual(order.address, self.address)
        self.assertEqual(str(order.total_amount), "200.00")
        self.assertEqual(order.payment_method, "cod")
        self.assertEqual(str(order.cod_amount_due), "200.00")

        items = list(OrderItem.objects.filter(order=order))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].quantity, 2)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())

    @patch("orders.views.get_razorpay_client")
    def test_cod_checkout_is_allowed_for_low_cost_orders(self, mock_get_client):
        self.product.price = "3.99"
        self.product.save()
        CartItem.objects.filter(cart=self.cart).update(quantity=1)

        response = self.client.post(
            "/api/v1/checkout/", {"address": self.address.id, "payment_method": "cod"}, **self.auth_header
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["total_amount"], "3.99")
        mock_get_client.assert_not_called()

    @patch("orders.views.get_razorpay_client")
    def test_rejects_invalid_payment_method(self, mock_get_client):
        response = self.client.post(
            "/api/v1/checkout/", {"address": self.address.id, "payment_method": "bitcoin"}, **self.auth_header
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("payment_method", response.json())
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


class RazorpayWebhookViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
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
        self.session = CheckoutSession.objects.create(
            user=self.user,
            address=self.address,
            razorpay_order_id="order_webhook_test",
            amount="200.00",
            items_snapshot=[
                {"product_id": self.product.id, "name": "Tank", "unit_price": "100.00", "quantity": 2},
            ],
        )

    def _post_webhook(self, event="payment.captured", order_id="order_webhook_test", payment_id="pay_test1", signature=None):
        payload = {
            "event": event,
            "payload": {
                "payment": {"entity": {"id": payment_id, "order_id": order_id, "amount": 20000, "status": "captured"}}
            },
        }
        body = json.dumps(payload).encode()
        if signature is None:
            signature = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        return self.client.post(
            "/api/v1/payments/webhook/", data=body, content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
        )

    def test_rejects_invalid_signature(self):
        response = self._post_webhook(signature="not-a-real-signature")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_rejects_non_ascii_signature_header_without_crashing(self):
        # Django decodes headers as latin-1, so a header byte >0x7F surfaces to the view as a
        # non-ASCII str. The Razorpay SDK's underlying hmac.compare_digest() raises TypeError
        # for non-ASCII str comparisons; this must be treated as an invalid signature (400),
        # not propagate as an uncaught 500.
        response = self._post_webhook(signature="\xe9signature")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_ignores_non_captured_events(self):
        response = self._post_webhook(event="payment.failed")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Order.objects.exists())

    def test_ignores_unknown_razorpay_order_id(self):
        response = self._post_webhook(order_id="order_never_created")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Order.objects.exists())

    def test_creates_order_and_decrements_stock_on_captured_payment(self):
        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(razorpay_order_id="order_webhook_test")
        self.assertEqual(order.user, self.user)
        self.assertEqual(order.address, self.address)
        self.assertEqual(str(order.total_amount), "200.00")
        self.assertEqual(order.razorpay_payment_id, "pay_test1")

        items = list(OrderItem.objects.filter(order=order))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].product_name, "Tank")
        self.assertEqual(items[0].quantity, 2)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())

        self.session.refresh_from_db()
        self.assertEqual(self.session.order, order)

    def test_duplicate_webhook_delivery_is_idempotent(self):
        self._post_webhook()
        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Order.objects.filter(razorpay_order_id="order_webhook_test").count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

    def test_clamps_stock_at_zero_when_oversold(self):
        self.product.stock_quantity = 1
        self.product.save()

        response = self._post_webhook()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Order.objects.filter(razorpay_order_id="order_webhook_test").exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 0)


class OrderByRazorpayOrderViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
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
        self.order = Order.objects.create(
            user=self.user, address=self.address, total_amount="200.00", razorpay_order_id="order_lookup_test",
        )
        OrderItem.objects.create(
            order=self.order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )

    def test_requires_authentication(self):
        response = self.client.get("/api/v1/orders/by-razorpay-order/order_lookup_test/")
        self.assertEqual(response.status_code, 401)

    def test_returns_order_and_items(self):
        response = self.client.get(
            "/api/v1/orders/by-razorpay-order/order_lookup_test/", **self.auth_header
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], self.order.id)
        self.assertEqual(data["status"], "placed")
        self.assertEqual(data["total_amount"], "200.00")
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["product_name"], "Tank")

    def test_returns_404_before_the_order_exists(self):
        response = self.client.get(
            "/api/v1/orders/by-razorpay-order/order_not_created_yet/", **self.auth_header
        )
        self.assertEqual(response.status_code, 404)

    def test_returns_404_for_another_users_order(self):
        login = self.client.post("/api/v1/auth/login/", {"username": "b@example.com", "password": "pw12345678"})
        other_auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}

        response = self.client.get(
            "/api/v1/orders/by-razorpay-order/order_lookup_test/", **other_auth_header
        )
        self.assertEqual(response.status_code, 404)


class OrderViewSetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="a@example.com", password="pw12345678", first_name="Asha",
        )
        self.other = User.objects.create_user(username="b@example.com", password="pw12345678")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw12345678"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}
        self.address = Address.objects.create(
            user=self.user, full_name="Asha", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=5,
        )

    def test_requires_authentication_for_list(self):
        response = self.client.get("/api/v1/orders/")
        self.assertEqual(response.status_code, 401)

    def test_lists_only_own_orders(self):
        mine = Order.objects.create(
            user=self.user, address=self.address, total_amount="100.00", razorpay_order_id="order_mine",
        )
        theirs_address = Address.objects.create(
            user=self.other, full_name="B", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        Order.objects.create(
            user=self.other, address=theirs_address, total_amount="200.00", razorpay_order_id="order_theirs",
        )

        response = self.client.get("/api/v1/orders/", **self.auth_header)

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], mine.id)

    def test_orders_are_listed_newest_first(self):
        older = Order.objects.create(
            user=self.user, address=self.address, total_amount="100.00", razorpay_order_id="order_old",
        )
        newer = Order.objects.create(
            user=self.user, address=self.address, total_amount="150.00", razorpay_order_id="order_new",
        )

        response = self.client.get("/api/v1/orders/", **self.auth_header)

        ids = [item["id"] for item in response.json()["results"]]
        self.assertEqual(ids, [newer.id, older.id])

    def test_retrieve_own_order_detail_includes_address_and_items(self):
        order = Order.objects.create(
            user=self.user, address=self.address, total_amount="200.00", razorpay_order_id="order_detail_test",
        )
        OrderItem.objects.create(
            order=order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )

        response = self.client.get(f"/api/v1/orders/{order.id}/", **self.auth_header)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "placed")
        self.assertEqual(data["address"]["full_name"], "Asha")
        self.assertEqual(data["customer_name"], "Asha")
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["product_name"], "Tank")

    def test_cannot_retrieve_another_users_order(self):
        theirs_address = Address.objects.create(
            user=self.other, full_name="B", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        theirs = Order.objects.create(
            user=self.other, address=theirs_address, total_amount="200.00", razorpay_order_id="order_theirs_2",
        )

        response = self.client.get(f"/api/v1/orders/{theirs.id}/", **self.auth_header)

        self.assertEqual(response.status_code, 404)


class AdminOrderViewSetTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff@example.com", password="pw12345678", is_staff=True)
        self.customer = User.objects.create_user(
            username="a@example.com", password="pw12345678", first_name="Asha", email="a@example.com",
        )
        self.address = Address.objects.create(
            user=self.customer, full_name="Asha", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_anonymous_cannot_list_admin_orders(self):
        response = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_list_admin_orders(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(response.status_code, 403)

    def test_staff_can_list_all_orders(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_1",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/orders/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def test_staff_can_filter_orders_by_status(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_placed", status="placed",
        )
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="150.00",
            razorpay_order_id="order_packed", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/orders/", {"status": "packed"})

        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["razorpay_order_id"], "order_packed")

    def test_staff_can_retrieve_order_detail(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_detail",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get(f"/api/v1/admin/orders/{order.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["customer_email"], "a@example.com")

    def test_staff_can_move_order_from_placed_to_packed(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_transition",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "packed"})

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "packed")

    def test_rejects_skipping_a_status(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_skip",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "delivered"})

        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, "placed")

    def test_rejects_moving_backward(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_backward", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "placed"})

        self.assertEqual(response.status_code, 400)

    def test_can_cancel_from_placed(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_cancel_placed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "cancelled"})

        self.assertEqual(response.status_code, 200)

    def test_cannot_cancel_from_transported(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_cancel_transported", status="transported",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "cancelled"})

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_requires_tracking_info(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_transported_missing", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "transported"})

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_rejects_both_porter_and_courier(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_both", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported",
            "porter_name": "Ravi", "porter_phone": "9999999999",
            "courier_name": "BlueDart", "courier_tracking_number": "BD123",
        })

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_rejects_partial_porter_info(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_partial", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported", "porter_name": "Ravi",
        })

        self.assertEqual(response.status_code, 400)

    def test_moving_to_transported_with_porter_info_succeeds(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_porter_ok", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported", "porter_name": "Ravi", "porter_phone": "9999999999",
        })

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "transported")
        self.assertEqual(order.porter_name, "Ravi")

    def test_moving_to_transported_with_courier_info_succeeds(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_courier_ok", status="packed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported", "courier_name": "BlueDart", "courier_tracking_number": "BD123",
        })

        self.assertEqual(response.status_code, 200)

    def test_moving_to_delivered_after_transported(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_delivered",
            status="transported", courier_name="BlueDart", courier_tracking_number="BD123",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {"status": "delivered"})

        self.assertEqual(response.status_code, 200)

    def test_tracking_fields_rejected_on_non_transported_transition(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_packed_with_porter", status="placed",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "packed", "porter_name": "Ravi",
        })

        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.porter_name, "")

    def test_rejects_transported_when_porter_already_stored_and_courier_submitted(self):
        order = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00",
            razorpay_order_id="order_two_step_attack", status="packed",
            porter_name="Ravi", porter_phone="9999999999",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.patch(f"/api/v1/admin/orders/{order.id}/", {
            "status": "transported",
            "courier_name": "BlueDart", "courier_tracking_number": "BD123",
        })

        self.assertEqual(response.status_code, 400)
