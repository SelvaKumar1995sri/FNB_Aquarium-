from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product

from .models import Cart, CartItem
from .serializers import CartSerializer

EMPTY_CART = {"id": None, "items": [], "subtotal": "0.00"}


def _cart_response(request, cart_pk, status_code=status.HTTP_200_OK):
    cart = Cart.objects.filter(pk=cart_pk).prefetch_related("items__product__images").first()
    return Response(CartSerializer(cart, context={"request": request}).data, status=status_code)


class AddCartItemInputSerializer(serializers.Serializer):
    product = serializers.IntegerField(required=True)
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)


class UpdateCartItemInputSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, required=False)


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product__images").first()
        if not cart:
            return Response(EMPTY_CART)
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)


class AddCartItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        # Validate input format
        input_serializer = AddCartItemInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        product_id = input_serializer.validated_data["product"]
        quantity = input_serializer.validated_data["quantity"]

        try:
            product = Product.objects.get(pk=product_id)
        except (Product.DoesNotExist, ValueError, TypeError):
            raise serializers.ValidationError({"product": "This product does not exist."})

        cart, _ = Cart.objects.get_or_create(user=request.user)
        item, created = CartItem.objects.get_or_create(cart=cart, product=product, defaults={"quantity": quantity})
        requested_total = quantity if created else item.quantity + quantity

        if requested_total > product.stock_quantity:
            raise serializers.ValidationError(
                {"quantity": f"Only {product.stock_quantity} left in stock."}
            )

        if not created:
            item.quantity = requested_total
            item.save()

        return _cart_response(request, cart.pk, status_code=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_item(self, request, item_id):
        return get_object_or_404(CartItem, pk=item_id, cart__user=request.user)

    @transaction.atomic
    def patch(self, request, item_id):
        item = self.get_item(request, item_id)

        input_serializer = UpdateCartItemInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        quantity = input_serializer.validated_data.get("quantity", item.quantity)

        if quantity > item.product.stock_quantity and quantity > item.quantity:
            raise serializers.ValidationError(
                {"quantity": f"Only {item.product.stock_quantity} left in stock."}
            )

        item.quantity = quantity
        item.save()

        return _cart_response(request, item.cart_id)

    def delete(self, request, item_id):
        item = self.get_item(request, item_id)
        cart_id = item.cart_id
        item.delete()
        return _cart_response(request, cart_id)
