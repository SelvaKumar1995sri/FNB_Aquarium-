from rest_framework import serializers

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    product_price = serializers.DecimalField(source="product.price", max_digits=10, decimal_places=2, read_only=True)
    product_stock_quantity = serializers.IntegerField(source="product.stock_quantity", read_only=True)
    product_image = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            "id", "product", "product_name", "product_slug", "product_price",
            "product_stock_quantity", "product_image", "quantity", "line_total",
        ]

    def get_product_image(self, obj):
        image = obj.product.images.first()
        if not image or not image.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(image.image.url) if request else image.image.url

    def get_line_total(self, obj):
        return str(obj.product.price * obj.quantity)


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "items", "subtotal"]

    def get_subtotal(self, obj):
        total = sum((item.product.price * item.quantity for item in obj.items.all()), start=0)
        return f"{total:.2f}"
