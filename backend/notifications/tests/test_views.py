from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address
from inquiries.models import Inquiry
from orders.models import Order

User = get_user_model()


class AdminNotificationsViewTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff@example.com", password="pw12345678", is_staff=True)
        self.customer = User.objects.create_user(
            username="a@example.com", password="pw12345678", email="a@example.com", first_name="Asha",
        )
        self.address = Address.objects.create(
            user=self.customer, full_name="Asha", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_anonymous_cannot_view_notifications(self):
        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_view_notifications(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.status_code, 403)

    def test_first_check_counts_all_existing_orders_and_inquiries_as_unread(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_1",
        )
        Inquiry.objects.create(name="Ravi", phone="9999999999", message="Hi")
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["unread_orders_count"], 1)
        self.assertEqual(data["unread_inquiries_count"], 1)
        self.assertEqual(len(data["latest_orders"]), 1)
        self.assertEqual(len(data["latest_inquiries"]), 1)

    def test_latest_orders_include_customer_name_and_are_newest_first(self):
        older = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_old",
        )
        newer = Order.objects.create(
            user=self.customer, address=self.address, total_amount="150.00", razorpay_order_id="order_new",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/notifications/")

        latest = response.json()["latest_orders"]
        self.assertEqual([item["id"] for item in latest], [newer.id, older.id])
        self.assertEqual(latest[0]["customer_name"], "Asha")

    def test_latest_lists_are_capped_at_five(self):
        for i in range(7):
            Order.objects.create(
                user=self.customer, address=self.address, total_amount="10.00", razorpay_order_id=f"order_{i}",
            )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/notifications/")

        data = response.json()
        self.assertEqual(data["unread_orders_count"], 7)
        self.assertEqual(len(data["latest_orders"]), 5)

    def test_seen_marks_existing_items_as_read(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_before",
        )
        self.client.force_authenticate(user=self.staff)

        seen_response = self.client.post("/api/v1/admin/notifications/seen/")
        self.assertEqual(seen_response.status_code, 204)

        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.json()["unread_orders_count"], 0)

    def test_new_orders_after_seen_are_still_unread(self):
        self.client.force_authenticate(user=self.staff)
        self.client.post("/api/v1/admin/notifications/seen/")

        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_after",
        )

        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.json()["unread_orders_count"], 1)

    def test_anonymous_cannot_mark_seen(self):
        response = self.client.post("/api/v1/admin/notifications/seen/")
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_mark_seen(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.post("/api/v1/admin/notifications/seen/")
        self.assertEqual(response.status_code, 403)
