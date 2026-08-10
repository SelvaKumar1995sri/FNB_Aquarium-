from rest_framework.test import APITestCase

from inquiries.models import Inquiry


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
