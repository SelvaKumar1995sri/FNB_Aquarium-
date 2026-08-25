from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from catalog.models import Category, Product
from notifications.models import CustomerNotification, StockAlertSubscription

User = get_user_model()


class StockAlertSubscriptionModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_notified_at_defaults_to_null(self):
        subscription = StockAlertSubscription.objects.create(user=self.user, product=self.product)
        self.assertIsNone(subscription.notified_at)

    def test_duplicate_user_product_subscription_is_rejected(self):
        StockAlertSubscription.objects.create(user=self.user, product=self.product)
        with self.assertRaises(IntegrityError):
            StockAlertSubscription.objects.create(user=self.user, product=self.product)


class CustomerNotificationModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="a@example.com", password="pw12345678")
        self.category = Category.objects.create(name="Fish", slug="fish")
        self.product = Product.objects.create(name="Discus", slug="discus", category=self.category, price=1200)

    def test_read_at_defaults_to_null(self):
        notification = CustomerNotification.objects.create(user=self.user, product=self.product, message="Back in stock")
        self.assertIsNone(notification.read_at)

    def test_newest_first_ordering(self):
        older = CustomerNotification.objects.create(user=self.user, product=self.product, message="Older")
        newer = CustomerNotification.objects.create(user=self.user, product=self.product, message="Newer")

        ids = list(CustomerNotification.objects.values_list("id", flat=True))

        self.assertEqual(ids, [newer.id, older.id])

    def test_surviving_product_deletion_sets_product_to_null(self):
        notification = CustomerNotification.objects.create(user=self.user, product=self.product, message="Back in stock")

        self.product.delete()
        notification.refresh_from_db()

        self.assertIsNone(notification.product)
