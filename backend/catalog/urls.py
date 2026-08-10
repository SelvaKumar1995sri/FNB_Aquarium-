from rest_framework.routers import DefaultRouter

from .views import BlogPostViewSet, CategoryViewSet, PortfolioItemViewSet, ProductViewSet, VideoViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("portfolio", PortfolioItemViewSet, basename="portfolio")
router.register("blog", BlogPostViewSet, basename="blog")
router.register("videos", VideoViewSet, basename="video")

urlpatterns = router.urls
