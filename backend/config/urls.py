from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts.views import RegisterView
from core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check),
    path("api/v1/auth/", include("core.auth_urls")),
    path("api/v1/auth/register/", RegisterView.as_view(), name="register"),
    path("api/v1/", include("catalog.urls")),
    path("api/v1/", include("inquiries.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("cart.urls")),
    path("api/v1/", include("orders.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
