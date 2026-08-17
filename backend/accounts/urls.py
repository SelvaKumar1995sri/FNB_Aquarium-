from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AddressViewSet, MeView

router = DefaultRouter()
router.register("addresses", AddressViewSet, basename="address")

urlpatterns = [
    path("accounts/me/", MeView.as_view(), name="account-me"),
] + router.urls
