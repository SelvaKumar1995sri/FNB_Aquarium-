from django.urls import path

from .views import AddCartItemView, CartDetailView

urlpatterns = [
    path("cart/", CartDetailView.as_view(), name="cart-detail"),
    path("cart/items/", AddCartItemView.as_view(), name="cart-item-add"),
]
