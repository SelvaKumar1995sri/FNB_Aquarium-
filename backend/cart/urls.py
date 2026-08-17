from django.urls import path

from .views import CartDetailView

urlpatterns = [
    path("cart/", CartDetailView.as_view(), name="cart-detail"),
]
