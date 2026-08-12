from rest_framework.routers import DefaultRouter

from .views import InquiryViewSet

router = DefaultRouter()
router.register("inquiries", InquiryViewSet, basename="inquiry")

urlpatterns = router.urls
