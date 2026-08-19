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
            "id", "status", "total_amount", "payment_method", "cod_amount_due",
            "razorpay_order_id", "created_at", "updated_at",
            "address", "customer_name", "customer_email",
            "porter_name", "porter_phone", "courier_name", "courier_tracking_number",
            "items",
        ]


class AdminOrderStatusUpdateSerializer(serializers.ModelSerializer):
    VALID_TRANSITIONS = {
        "placed": {"packed", "cancelled"},
        "packed": {"transported", "cancelled"},
        "transported": {"delivered"},
        "delivered": set(),
        "cancelled": set(),
    }

    class Meta:
        model = Order
        fields = ["status", "porter_name", "porter_phone", "courier_name", "courier_tracking_number"]

    def _tracking_value(self, attrs, field):
        return attrs.get(field, getattr(self.instance, field, "") or "")

    def validate(self, attrs):
        if "status" not in attrs:
            raise serializers.ValidationError({"status": "Status is required."})

        new_status = attrs["status"]
        allowed = self.VALID_TRANSITIONS.get(self.instance.status, set())
        if new_status not in allowed:
            raise serializers.ValidationError(
                {"status": f"Cannot move an order from '{self.instance.status}' to '{new_status}'."}
            )

        tracking_fields = ("porter_name", "porter_phone", "courier_name", "courier_tracking_number")
        if new_status != "transported" and any(field in attrs for field in tracking_fields):
            raise serializers.ValidationError(
                "Tracking details can only be set when moving an order to transported."
            )

        if new_status == "transported":
            porter_name = self._tracking_value(attrs, "porter_name")
            porter_phone = self._tracking_value(attrs, "porter_phone")
            courier_name = self._tracking_value(attrs, "courier_name")
            courier_tracking_number = self._tracking_value(attrs, "courier_tracking_number")
            porter_complete = bool(porter_name) and bool(porter_phone)
            courier_complete = bool(courier_name) and bool(courier_tracking_number)
            porter_partial = bool(porter_name) != bool(porter_phone)
            courier_partial = bool(courier_name) != bool(courier_tracking_number)
            if porter_partial or courier_partial:
                raise serializers.ValidationError(
                    "Provide both porter name and phone, or both courier name and tracking number."
                )
            if porter_complete and courier_complete:
                raise serializers.ValidationError(
                    "Provide either porter details or courier details, not both."
                )
            if not porter_complete and not courier_complete:
                raise serializers.ValidationError(
                    "Provide either porter name and phone, or courier name and tracking number."
                )
        return attrs
