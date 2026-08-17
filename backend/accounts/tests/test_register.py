from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import CustomerProfile

User = get_user_model()

VALID_PAYLOAD = {
    "name": "Asha Kumar",
    "email": "asha@example.com",
    "phone": "9876543210",
    "password": "correct-horse-battery-staple",
}


class RegisterViewTests(APITestCase):
    def test_register_creates_user_and_profile(self):
        response = self.client.post("/api/v1/auth/register/", VALID_PAYLOAD)
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="asha@example.com")
        self.assertEqual(user.first_name, "Asha Kumar")
        self.assertEqual(user.email, "asha@example.com")
        self.assertFalse(user.is_staff)
        self.assertEqual(CustomerProfile.objects.get(user=user).phone, "9876543210")

    def test_register_returns_access_and_refresh_tokens(self):
        response = self.client.post("/api/v1/auth/register/", VALID_PAYLOAD)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(username="dup@example.com", password="pw12345678")
        response = self.client.post("/api/v1/auth/register/", {**VALID_PAYLOAD, "email": "dup@example.com"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_register_rejects_duplicate_email_case_insensitively(self):
        User.objects.create_user(username="dup2@example.com", password="pw12345678")
        response = self.client.post("/api/v1/auth/register/", {**VALID_PAYLOAD, "email": "DUP2@example.com"})
        self.assertEqual(response.status_code, 400)

    def test_register_rejects_weak_password(self):
        response = self.client.post("/api/v1/auth/register/", {**VALID_PAYLOAD, "password": "12345678"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())

    def test_register_requires_all_fields(self):
        response = self.client.post("/api/v1/auth/register/", {"email": "incomplete@example.com"})
        self.assertEqual(response.status_code, 400)

    def test_login_works_immediately_after_registration(self):
        self.client.post("/api/v1/auth/register/", VALID_PAYLOAD)
        response = self.client.post(
            "/api/v1/auth/login/", {"username": "asha@example.com", "password": VALID_PAYLOAD["password"]}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
