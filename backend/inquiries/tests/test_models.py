from django.test import TestCase

from catalog.models import Category, Product
from inquiries.models import Inquiry


class InquiryModelTests(TestCase):
    def test_defaults_to_new_status_and_general_type(self):
        inquiry = Inquiry.objects.create(name="Priya", phone="9876543210", message="Do you sell arowana?")
        self.assertEqual(inquiry.status, "new")
        self.assertEqual(inquiry.type, "general")

    def test_can_reference_a_product(self):
        category = Category.objects.create(name="Fish", slug="fish")
        product = Product.objects.create(name="Discus", slug="discus", category=category, price=1200)
        inquiry = Inquiry.objects.create(
            name="Priya", phone="9876543210", type="product", product=product, message="Interested"
        )
        self.assertEqual(inquiry.product, product)

    def test_str_includes_name_and_type(self):
        inquiry = Inquiry.objects.create(name="Priya", phone="9876543210", message="Hi")
        self.assertIn("Priya", str(inquiry))
