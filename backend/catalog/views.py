from django.db.models import F, Q

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response

from .models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video
from .permissions import IsStaffOrReadOnly
from .serializers import (
    BlogPostSerializer, CategorySerializer, PortfolioItemSerializer,
    ProductImageSerializer, ProductSerializer, VideoSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Category.objects.all()
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsStaffOrReadOnly]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Product.objects.select_related("category").prefetch_related("images")
        category_slug = self.request.query_params.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)
        is_featured = self.request.query_params.get("is_featured")
        if is_featured is not None:
            queryset = queryset.filter(is_featured=is_featured.lower() in ("true", "1"))
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))
        return queryset

    def create(self, request, *args, **kwargs):
        name = request.data.get("name")
        category_id = request.data.get("category")
        existing = Product.objects.filter(name__iexact=name, category_id=category_id).select_related("category").first()
        if existing:
            return Response(
                {
                    "detail": f'A product named "{existing.name}" already exists in this category.',
                    "existing_product": {
                        "slug": existing.slug,
                        "name": existing.name,
                        "category_name": existing.category.name,
                        "stock_quantity": existing.stock_quantity,
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="add-stock")
    def add_stock(self, request, slug=None):
        product = self.get_object()
        quantity = request.data.get("quantity")
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({"quantity": "Quantity must be a positive integer."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity <= 0:
            return Response({"quantity": "Quantity must be a positive integer."}, status=status.HTTP_400_BAD_REQUEST)

        Product.objects.filter(pk=product.pk).update(stock_quantity=F("stock_quantity") + quantity)
        product.refresh_from_db()
        return Response(ProductSerializer(product, context={"request": request}).data)


class PortfolioItemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PortfolioItem.objects.all()
    serializer_class = PortfolioItemSerializer
    permission_classes = [AllowAny]


class BlogPostViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BlogPost.objects.all()
    serializer_class = BlogPostSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"


class VideoViewSet(viewsets.ModelViewSet):
    serializer_class = VideoSerializer
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user and user.is_staff:
            return Video.objects.all()
        return Video.objects.filter(is_active=True)


class ProductImageViewSet(viewsets.ModelViewSet):
    queryset = ProductImage.objects.all()
    serializer_class = ProductImageSerializer
    permission_classes = [IsAdminUser]
