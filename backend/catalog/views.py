from rest_framework import viewsets
from rest_framework.permissions import AllowAny, IsAdminUser

from .models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video
from .permissions import IsStaffOrReadOnly
from .serializers import (
    BlogPostSerializer, CategorySerializer, PortfolioItemSerializer,
    ProductImageSerializer, ProductSerializer, VideoSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]
    lookup_field = "slug"


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
        return queryset


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
