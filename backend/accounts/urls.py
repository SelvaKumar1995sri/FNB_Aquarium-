from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MeView

router = DefaultRouter()

urlpatterns = [
    path("accounts/me/", MeView.as_view(), name="account-me"),
] + router.urls
