from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AdminOrderViewSet, CheckoutView, OrderByRazorpayOrderView, OrderViewSet, RazorpayWebhookView

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")
router.register("admin/orders", AdminOrderViewSet, basename="admin-order")

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("payments/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path(
        "orders/by-razorpay-order/<str:razorpay_order_id>/",
        OrderByRazorpayOrderView.as_view(),
        name="order-by-razorpay-order",
    ),
] + router.urls
