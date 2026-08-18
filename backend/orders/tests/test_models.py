from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from accounts.models import Address
from catalog.models import Category, Product
from orders.models import CheckoutSession, Order, OrderItem

User = get_user_model()


class OrderModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="A", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_str_includes_id_and_user(self):
        order = Order.objects.create(
            user=self.user, address=self.address, total_amount="500.00", razorpay_order_id="order_test1",
        )
        self.assertIn(str(order.id), str(order))
        self.assertIn(str(self.user), str(order))

    def test_default_status_is_placed(self):
        order = Order.objects.create(
            user=self.user, address=self.address, total_amount="500.00", razorpay_order_id="order_test2",
        )
        self.assertEqual(order.status, "placed")


class OrderItemModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="b@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="B", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )
        self.order = Order.objects.create(
            user=self.user, address=self.address, total_amount="200.00", razorpay_order_id="order_test3",
        )
        self.category = Category.objects.create(name="Tanks", slug="tanks")
        self.product = Product.objects.create(
            name="Tank", slug="tank", category=self.category, price="100.00", stock_quantity=10,
        )

    def test_str_includes_quantity_and_product_name(self):
        item = OrderItem.objects.create(
            order=self.order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )
        self.assertEqual(str(item), "2 x Tank")

    def test_survives_product_deletion(self):
        item = OrderItem.objects.create(
            order=self.order, product=self.product, product_name="Tank", unit_price="100.00", quantity=2,
        )
        self.product.delete()
        item.refresh_from_db()
        self.assertIsNone(item.product)
        self.assertEqual(item.product_name, "Tank")


class CheckoutSessionModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="c@example.com", password="pw12345678")
        self.address = Address.objects.create(
            user=self.user, full_name="C", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_razorpay_order_id_is_unique(self):
        CheckoutSession.objects.create(
            user=self.user, address=self.address, razorpay_order_id="order_dup",
            amount="100.00", items_snapshot=[],
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CheckoutSession.objects.create(
                    user=self.user, address=self.address, razorpay_order_id="order_dup",
                    amount="100.00", items_snapshot=[],
                )

    def test_order_is_null_until_webhook_processes_it(self):
        session = CheckoutSession.objects.create(
            user=self.user, address=self.address, razorpay_order_id="order_pending",
            amount="100.00", items_snapshot=[],
        )
        self.assertIsNone(session.order)
