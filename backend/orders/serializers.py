from rest_framework import serializers

from accounts.serializers import AddressSerializer

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "unit_price", "quantity"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    address = AddressSerializer(read_only=True)
    customer_name = serializers.CharField(source="user.first_name", read_only=True)
    customer_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "status", "total_amount", "razorpay_order_id", "created_at", "updated_at",
            "address", "customer_name", "customer_email",
            "porter_name", "porter_phone", "courier_name", "courier_tracking_number",
            "items",
        ]
