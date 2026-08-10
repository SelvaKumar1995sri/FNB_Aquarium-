from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .models import BlogPost, Category, PortfolioItem, Product, Video
from .serializers import (
    BlogPostSerializer, CategorySerializer, PortfolioItemSerializer,
    ProductSerializer, VideoSerializer,
)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Product.objects.select_related("category").prefetch_related("images")
        category_slug = self.request.query_params.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)
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


class VideoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Video.objects.filter(is_active=True)
    serializer_class = VideoSerializer
    permission_classes = [AllowAny]
