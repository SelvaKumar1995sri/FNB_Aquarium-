from django.contrib import admin
from django.urls import include, path

from core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check),
    path("api/v1/", include("catalog.urls")),
    path("api/v1/", include("inquiries.urls")),
]
