from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from inquiries.models import Inquiry

User = get_user_model()


class InquiryCreateViewTests(APITestCase):
    def test_general_inquiry_only_needs_name_phone_message(self):
        response = self.client.post("/api/v1/inquiries/", {
            "name": "Priya", "phone": "9876543210", "message": "Do you sell arowana?",
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Inquiry.objects.count(), 1)

    def test_product_inquiry_requires_product(self):
        response = self.client.post("/api/v1/inquiries/", {
            "name": "Priya", "phone": "9876543210", "message": "Interested", "type": "product",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("product", response.json())

    def test_build_tank_inquiry_requires_size_and_shape(self):
        response = self.client.post("/api/v1/inquiries/", {
            "name": "Priya", "phone": "9876543210", "message": "Custom tank please", "type": "build_tank",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("tank_size", response.json())
        self.assertIn("tank_shape", response.json())

    def test_public_cannot_list_inquiries(self):
        response = self.client.get("/api/v1/inquiries/")
        self.assertIn(response.status_code, (401, 403))


class InquiryStaffManagementTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff", password="pw12345", is_staff=True)
        self.inquiry = Inquiry.objects.create(name="Priya", phone="9876543210", message="Hi")

    def test_staff_can_list_inquiries(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get("/api/v1/inquiries/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def test_staff_can_update_status(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.patch(f"/api/v1/inquiries/{self.inquiry.id}/", {"status": "contacted"})
        self.assertEqual(response.status_code, 200)
        self.inquiry.refresh_from_db()
        self.assertEqual(self.inquiry.status, "contacted")

    def test_non_staff_cannot_list_inquiries(self):
        customer = User.objects.create_user(username="customer", password="pw12345")
        self.client.force_authenticate(user=customer)
        response = self.client.get("/api/v1/inquiries/")
        self.assertEqual(response.status_code, 403)

    def test_status_filter_works(self):
        # Create two inquiries with different statuses
        inquiry_new = Inquiry.objects.create(name="Alice", phone="1111111111", message="New inquiry", status="new")
        inquiry_contacted = Inquiry.objects.create(name="Bob", phone="2222222222", message="Contacted inquiry", status="contacted")

        self.client.force_authenticate(user=self.staff)

        # Filter by "contacted" status
        response = self.client.get("/api/v1/inquiries/?status=contacted")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["id"], inquiry_contacted.id)
