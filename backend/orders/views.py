from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.models import Cart

from .models import CheckoutSession
from .razorpay_client import get_razorpay_client


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        address_id = request.data.get("address")
        address = Address.objects.filter(pk=address_id, user=request.user).first()
        if not address:
            raise serializers.ValidationError({"address": "Please select a valid delivery address."})

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
                "currency": "INR",
            },
            status=status.HTTP_201_CREATED,
        )
