from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import Address, CustomerProfile

User = get_user_model()


class CustomerProfileModelTests(TestCase):
    def test_str_uses_full_name_when_present(self):
        user = User.objects.create_user(username="a@example.com", first_name="Asha", password="pw12345678")
        profile = CustomerProfile.objects.create(user=user, phone="9999999999")
        self.assertEqual(str(profile), "Asha profile")

    def test_str_falls_back_to_username(self):
        user = User.objects.create_user(username="b@example.com", password="pw12345678")
        profile = CustomerProfile.objects.create(user=user, phone="9999999999")
        self.assertEqual(str(profile), "b@example.com profile")


class AddressModelTests(TestCase):
    def test_str_format(self):
        user = User.objects.create_user(username="c@example.com", password="pw12345678")
        address = Address.objects.create(
            user=user, full_name="Asha K", phone="9999999999",
            line1="12 MG Road", city="Chennai", state="TN", pincode="600001",
        )
        self.assertEqual(str(address), "Asha K, Chennai")

    def test_default_address_sorts_first(self):
        user = User.objects.create_user(username="d@example.com", password="pw12345678")
        Address.objects.create(
            user=user, full_name="A", phone="1", line1="x", city="c", state="s", pincode="600001",
        )
        default = Address.objects.create(
            user=user, full_name="B", phone="2", line1="y", city="c", state="s", pincode="600002",
            is_default=True,
        )
        self.assertEqual(list(Address.objects.filter(user=user))[0], default)
