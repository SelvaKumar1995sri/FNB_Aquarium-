from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import RegisterView, MeView

router = DefaultRouter()

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("accounts/me/", MeView.as_view(), name="account-me"),
] + router.urls
