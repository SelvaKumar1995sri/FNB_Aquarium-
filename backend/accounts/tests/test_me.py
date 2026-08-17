from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import CustomerProfile

User = get_user_model()


class MeViewTests(APITestCase):
    def _access_token(self, username, password):
        response = self.client.post("/api/v1/auth/login/", {"username": username, "password": password})
        return response.json()["access"]

    def test_me_requires_authentication(self):
        response = self.client.get("/api/v1/accounts/me/")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_customer_profile_fields(self):
        user = User.objects.create_user(
            username="asha@example.com", email="asha@example.com",
            first_name="Asha Kumar", password="pw123456789",
        )
        CustomerProfile.objects.create(user=user, phone="9876543210")
        access = self._access_token("asha@example.com", "pw123456789")

        response = self.client.get("/api/v1/accounts/me/", HTTP_AUTHORIZATION=f"Bearer {access}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "id": user.id, "email": "asha@example.com", "name": "Asha Kumar",
            "phone": "9876543210", "is_staff": False,
        })

    def test_me_handles_user_without_customer_profile(self):
        User.objects.create_user(username="staffuser", password="pw123456789", is_staff=True)
        access = self._access_token("staffuser", "pw123456789")

        response = self.client.get("/api/v1/accounts/me/", HTTP_AUTHORIZATION=f"Bearer {access}")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["phone"], "")
        self.assertTrue(body["is_staff"])
