from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cart
from .serializers import CartSerializer

EMPTY_CART = {"id": None, "items": [], "subtotal": "0.00"}


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = Cart.objects.filter(user=request.user).prefetch_related("items__product__images").first()
        if not cart:
            return Response(EMPTY_CART)
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data)
