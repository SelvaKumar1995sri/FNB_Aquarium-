from django.urls import path

from .views import CheckoutView, RazorpayWebhookView

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
]
