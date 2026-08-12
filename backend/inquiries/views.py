from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser

from .models import Inquiry
from .serializers import InquiryCreateSerializer, InquiryDetailSerializer, InquiryStatusUpdateSerializer
from .throttles import InquiryCreateThrottle


class InquiryViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        queryset = Inquiry.objects.select_related("product").all()
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return InquiryCreateSerializer
        if self.action == "partial_update":
            return InquiryStatusUpdateSerializer
        return InquiryDetailSerializer

    def get_permissions(self):
        if self.action == "create":
            return []
        return [IsAdminUser()]

    def get_throttles(self):
        if self.action == "create":
            return [InquiryCreateThrottle()]
        return super().get_throttles()
