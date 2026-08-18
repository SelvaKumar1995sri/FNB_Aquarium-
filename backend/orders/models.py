from django.conf import settings
from django.db import models

from accounts.models import Address
from catalog.models import Product


class Order(models.Model):
    STATUS_CHOICES = [
        ("placed", "Placed"),
        ("packed", "Packed"),
        ("transported", "Transported"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="orders")
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="placed")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    razorpay_order_id = models.CharField(max_length=100)
    razorpay_payment_id = models.CharField(max_length=100, blank=True)

    # Tracking — admin fills in ONE of these two groups when moving to "transported" (Sub-plan 4)
    porter_name = models.CharField(max_length=100, blank=True)
    porter_phone = models.CharField(max_length=20, blank=True)
    courier_name = models.CharField(max_length=100, blank=True)
    courier_tracking_number = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"Order #{self.id} ({self.user})"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, null=True, on_delete=models.SET_NULL)
    product_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.quantity} x {self.product_name}"


class CheckoutSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    address = models.ForeignKey(Address, on_delete=models.PROTECT)
    razorpay_order_id = models.CharField(max_length=100, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    items_snapshot = models.JSONField()
    order = models.OneToOneField(Order, null=True, blank=True, on_delete=models.SET_NULL, related_name="checkout_session")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Checkout session for {self.user} ({self.razorpay_order_id})"
