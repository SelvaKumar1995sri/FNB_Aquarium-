from rest_framework import serializers

from .models import Inquiry


class InquiryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = [
            "name", "phone", "email", "message", "type", "product",
            "tank_size", "tank_shape", "budget_notes",
        ]

    def validate(self, attrs):
        inquiry_type = attrs.get("type", "general")
        errors = {}
        if inquiry_type == "product" and not attrs.get("product"):
            errors["product"] = "This field is required for product inquiries."
        if inquiry_type == "build_tank":
            if not attrs.get("tank_size"):
                errors["tank_size"] = "This field is required for tank build inquiries."
            if not attrs.get("tank_shape"):
                errors["tank_shape"] = "This field is required for tank build inquiries."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class InquiryDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = [
            "id", "name", "phone", "email", "message", "type", "product",
            "tank_size", "tank_shape", "budget_notes", "status", "created_at", "updated_at",
        ]
        read_only_fields = [f for f in fields if f != "status"]


class InquiryStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = ["status"]
