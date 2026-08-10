from rest_framework.routers import DefaultRouter

from .views import (
    BlogPostViewSet, CategoryViewSet, PortfolioItemViewSet, ProductImageViewSet,
    ProductViewSet, VideoViewSet,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("portfolio", PortfolioItemViewSet, basename="portfolio")
router.register("blog", BlogPostViewSet, basename="blog")
router.register("videos", VideoViewSet, basename="video")
router.register("product-images", ProductImageViewSet, basename="product-image")

urlpatterns = router.urls
