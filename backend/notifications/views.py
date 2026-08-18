from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from inquiries.models import Inquiry
from orders.models import Order

from .models import AdminNotificationState

LATEST_LIMIT = 5


def _unread_queryset(queryset, field, last_seen_at):
    if last_seen_at is None:
        return queryset
    return queryset.filter(**{f"{field}__gt": last_seen_at})


class AdminNotificationsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        as_of = timezone.now()
        state, _ = AdminNotificationState.objects.get_or_create(user=request.user)
        last_seen_at = state.last_seen_at

        unread_orders = _unread_queryset(
            Order.objects.select_related("user").order_by("-created_at"), "created_at", last_seen_at
        )
        unread_inquiries = _unread_queryset(
            Inquiry.objects.order_by("-created_at"), "created_at", last_seen_at
        )

        return Response({
            "as_of": as_of,
            "unread_orders_count": unread_orders.count(),
            "unread_inquiries_count": unread_inquiries.count(),
            "latest_orders": [
                {
                    "id": order.id,
                    "status": order.status,
                    "customer_name": order.user.first_name,
                    "customer_email": order.user.email,
                    "total_amount": str(order.total_amount),
                    "created_at": order.created_at,
                }
                for order in unread_orders[:LATEST_LIMIT]
            ],
            "latest_inquiries": [
                {
                    "id": inquiry.id,
                    "name": inquiry.name,
                    "type": inquiry.type,
                    "created_at": inquiry.created_at,
                }
                for inquiry in unread_inquiries[:LATEST_LIMIT]
            ],
        })


class AdminNotificationsSeenView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        now = timezone.now()
        seen_up_to = None
        raw = request.data.get("seen_up_to")
        if isinstance(raw, str):
            try:
                parsed = parse_datetime(raw)
            except (ValueError, TypeError):
                parsed = None
            if parsed is not None and timezone.is_aware(parsed) and parsed <= now:
                seen_up_to = parsed
        if seen_up_to is None:
            seen_up_to = now

        state, _ = AdminNotificationState.objects.get_or_create(user=request.user)
        state.last_seen_at = seen_up_to
        state.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
