from django.urls import path

from .views import CheckoutView, OrderByRazorpayOrderView, RazorpayWebhookView

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path(
        "orders/by-razorpay-order/<str:razorpay_order_id>/",
        OrderByRazorpayOrderView.as_view(),
        name="order-by-razorpay-order",
    ),
]
