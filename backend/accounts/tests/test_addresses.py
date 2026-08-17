from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address

User = get_user_model()


class AddressViewSetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw123456789")
        self.other = User.objects.create_user(username="b@example.com", password="pw123456789")
        login = self.client.post("/api/v1/auth/login/", {"username": "a@example.com", "password": "pw123456789"})
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access']}"}

    def test_list_requires_authentication(self):
        response = self.client.get("/api/v1/addresses/")
        self.assertEqual(response.status_code, 401)

    def test_create_address(self):
        response = self.client.post("/api/v1/addresses/", {
            "full_name": "Asha K", "phone": "9876543210", "line1": "12 MG Road",
            "city": "Chennai", "state": "TN", "pincode": "600001",
        }, **self.auth_header)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Address.objects.get().user, self.user)

    def test_list_only_returns_own_addresses(self):
        Address.objects.create(
            user=self.other, full_name="Other", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        mine = Address.objects.create(
            user=self.user, full_name="Mine", phone="2", line1="y", city="c", state="s", pincode="600002",
        )
        response = self.client.get("/api/v1/addresses/", **self.auth_header)
        ids = [item["id"] for item in response.json()["results"]]
        self.assertEqual(ids, [mine.id])

    def test_setting_is_default_unsets_previous_default(self):
        first = Address.objects.create(
            user=self.user, full_name="A", phone="1", line1="x", city="c", state="s", pincode="600001",
            is_default=True,
        )
        response = self.client.post("/api/v1/addresses/", {
            "full_name": "B", "phone": "2", "line1": "y", "city": "c", "state": "s",
            "pincode": "600002", "is_default": True,
        }, **self.auth_header)
        self.assertEqual(response.status_code, 201)
        first.refresh_from_db()
        self.assertFalse(first.is_default)

    def test_updating_non_default_address_to_default_unsets_previous_default(self):
        first = Address.objects.create(
            user=self.user, full_name="A", phone="1", line1="x", city="c", state="s", pincode="600001",
            is_default=True,
        )
        second = Address.objects.create(
            user=self.user, full_name="B", phone="2", line1="y", city="c", state="s", pincode="600002",
            is_default=False,
        )
        response = self.client.patch(f"/api/v1/addresses/{second.id}/", {"is_default": True}, **self.auth_header)
        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        self.assertFalse(first.is_default)
        second.refresh_from_db()
        self.assertTrue(second.is_default)

    def test_cannot_access_another_users_address(self):
        theirs = Address.objects.create(
            user=self.other, full_name="Other", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        response = self.client.patch(f"/api/v1/addresses/{theirs.id}/", {"city": "Hacked"}, **self.auth_header)
        self.assertEqual(response.status_code, 404)

    def test_delete_own_address(self):
        mine = Address.objects.create(
            user=self.user, full_name="Mine", phone="2", line1="y", city="c", state="s", pincode="600002",
        )
        response = self.client.delete(f"/api/v1/addresses/{mine.id}/", **self.auth_header)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Address.objects.filter(pk=mine.id).exists())
