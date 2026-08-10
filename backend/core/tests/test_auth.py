from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()


class AuthTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff", password="pw12345", is_staff=True)

    def test_login_returns_access_and_refresh_tokens(self):
        response = self.client.post("/api/v1/auth/login/", {"username": "staff", "password": "pw12345"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())

    def test_login_fails_with_wrong_password(self):
        response = self.client.post("/api/v1/auth/login/", {"username": "staff", "password": "wrong"})
        self.assertEqual(response.status_code, 401)

    def test_me_requires_authentication(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_username_and_staff_flag(self):
        login = self.client.post("/api/v1/auth/login/", {"username": "staff", "password": "pw12345"})
        access = login.json()["access"]
        response = self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"username": "staff", "is_staff": True})
