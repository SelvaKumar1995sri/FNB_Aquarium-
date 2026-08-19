import json
import logging
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart, CartItem
from catalog.models import Product
from razorpay.errors import SignatureVerificationError

from .models import CheckoutSession, Order, OrderItem
from .razorpay_client import get_razorpay_client
from .serializers import AdminOrderStatusUpdateSerializer, OrderSerializer

logger = logging.getLogger(__name__)


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        address_id = request.data.get("address")
        address = Address.objects.filter(pk=address_id, user=request.user).first()
        if not address:
            raise serializers.ValidationError({"address": "Please select a valid delivery address."})

        payment_method = request.data.get("payment_method", "online")
        if payment_method not in ("online", "cod"):
            raise serializers.ValidationError({"payment_method": "Invalid payment method."})

        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product").first()
        items = list(cart.items.all()) if cart else []
        if not items:
            raise serializers.ValidationError({"cart": "Your cart is empty."})

        for item in items:
            if item.quantity > item.product.stock_quantity:
                raise serializers.ValidationError(
                    {"cart": f"{item.product.name} only has {item.product.stock_quantity} left in stock."}
                )

        total = sum((item.product.price * item.quantity for item in items), start=Decimal("0"))

        if payment_method == "cod":
            return self._place_cod_order(request, address, items, total)

        snapshot = [
            {
                "product_id": item.product.id,
                "name": item.product.name,
                "unit_price": str(item.product.price),
                "quantity": item.quantity,
            }
            for item in items
        ]

        client = get_razorpay_client()
        razorpay_order = client.order.create({
            "amount": int(total * 100),
            "currency": "INR",
            "payment_capture": 1,
        })

        CheckoutSession.objects.create(
            user=request.user,
            address=address,
            razorpay_order_id=razorpay_order["id"],
            amount=total,
            items_snapshot=snapshot,
        )

        return Response(
            {
                "razorpay_order_id": razorpay_order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
                "amount": f"{total:.2f}",
                "payment_method": "online",
                "currency": "INR",
            },
            status=status.HTTP_201_CREATED,
        )

    def _place_cod_order(self, request, address, items, total):
        # No Razorpay/CheckoutSession involved — Cash on Delivery orders are
        # placed immediately with no online charge; the porter/delivery
        # charge is determined and collected in cash when the order is
        # dispatched, not calculated here.
        with transaction.atomic():
            order = Order.objects.create(
                user=request.user,
                address=address,
                total_amount=total,
                payment_method="cod",
                cod_amount_due=total,
                razorpay_order_id=f"cod_{uuid.uuid4().hex}",
            )
            locked_products = {
                product.id: product
                for product in Product.objects.select_for_update().filter(
                    id__in=[item.product_id for item in items]
                )
            }
            for item in items:
                OrderItem.objects.create(
                    order=order,
                    product=item.product,
                    product_name=item.product.name,
                    unit_price=item.product.price,
                    quantity=item.quantity,
                )
                product = locked_products.get(item.product_id)
                if product:
                    product.stock_quantity = max(0, product.stock_quantity - item.quantity)
                    product.save()

            CartItem.objects.filter(cart__user=request.user).delete()

        return Response(
            {
                "razorpay_order_id": order.razorpay_order_id,
                "payment_method": "cod",
                "total_amount": f"{total:.2f}",
            },
            status=status.HTTP_201_CREATED,
        )


class RazorpayWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        signature = request.headers.get("X-Razorpay-Signature", "")
        client = get_razorpay_client()
        try:
            client.utility.verify_webhook_signature(
                request.body.decode("utf-8"), signature, settings.RAZORPAY_WEBHOOK_SECRET
            )
        except (SignatureVerificationError, TypeError, UnicodeDecodeError):
            logger.error("Razorpay webhook rejected: invalid or malformed signature")
            return Response(status=status.HTTP_400_BAD_REQUEST)

        payload = json.loads(request.body)
        if payload.get("event") != "payment.captured":
            return Response(status=status.HTTP_200_OK)

        payment_entity = payload["payload"]["payment"]["entity"]
        razorpay_order_id = payment_entity["order_id"]
        razorpay_payment_id = payment_entity["id"]

        with transaction.atomic():
            session = (
                CheckoutSession.objects.select_for_update()
                .filter(razorpay_order_id=razorpay_order_id)
                .first()
            )
            if not session:
                logger.error(
                    "Razorpay webhook payment.captured for unknown razorpay_order_id=%s "
                    "razorpay_payment_id=%s: no matching CheckoutSession",
                    razorpay_order_id, razorpay_payment_id,
                )
                return Response(status=status.HTTP_200_OK)
            if session.order_id:
                logger.info(
                    "Razorpay webhook duplicate delivery for razorpay_order_id=%s: already processed",
                    razorpay_order_id,
                )
                return Response(status=status.HTTP_200_OK)

            order = Order.objects.create(
                user=session.user,
                address=session.address,
                total_amount=session.amount,
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
            )

            product_ids = [item["product_id"] for item in session.items_snapshot if item["product_id"]]
            locked_products = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            for item in session.items_snapshot:
                product = locked_products.get(item["product_id"])
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=item["name"],
                    unit_price=item["unit_price"],
                    quantity=item["quantity"],
                )
                if product:
                    product.stock_quantity = max(0, product.stock_quantity - item["quantity"])
                    product.save()

            session.order = order
            session.save()

            CartItem.objects.filter(cart__user=session.user).delete()

        return Response(status=status.HTTP_200_OK)


class OrderByRazorpayOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, razorpay_order_id):
        order = (
            Order.objects.filter(razorpay_order_id=razorpay_order_id, user=request.user)
            .prefetch_related("items")
            .first()
        )
        if not order:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order).data)


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Order.objects.filter(user=self.request.user)
            .select_related("address", "user")
            .prefetch_related("items")
        )


class AdminOrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "patch"]

    def get_queryset(self):
        queryset = Order.objects.select_related("address", "user").prefetch_related("items")
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = AdminOrderStatusUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OrderSerializer(instance, context={"request": request}).data)
