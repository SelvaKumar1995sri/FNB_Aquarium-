from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product
from inquiries.models import Inquiry
from orders.models import Order

from .models import AdminNotificationState, CustomerNotification, StockAlertSubscription

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


class StockAlertSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_id = request.data.get("product")
        try:
            product_id = int(product_id)
        except (TypeError, ValueError):
            return Response({"product": "A valid product id is required."}, status=status.HTTP_400_BAD_REQUEST)
        product = get_object_or_404(Product, pk=product_id)
        if product.in_stock:
            return Response({"detail": "This product is already in stock."}, status=status.HTTP_400_BAD_REQUEST)
        StockAlertSubscription.objects.update_or_create(
            user=request.user, product=product, defaults={"notified_at": None}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = CustomerNotification.objects.filter(user=request.user)
        unread_count = queryset.filter(read_at__isnull=True).count()
        latest = queryset.select_related("product")[:20]
        return Response({
            "unread_count": unread_count,
            "notifications": [
                {
                    "id": notification.id,
                    "message": notification.message,
                    "product_slug": notification.product.slug if notification.product else None,
                    "created_at": notification.created_at,
                    "read_at": notification.read_at,
                }
                for notification in latest
            ],
        })


class CustomerNotificationsMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        CustomerNotification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)
