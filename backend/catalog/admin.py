from django.contrib import admin

from .models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent", "order"]
    list_filter = ["parent"]
    search_fields = ["name", "slug"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "category", "price", "in_stock", "is_featured"]
    list_filter = ["category", "in_stock", "is_featured"]
    search_fields = ["name", "slug"]


admin.site.register(ProductImage)


@admin.register(PortfolioItem)
class PortfolioItemAdmin(admin.ModelAdmin):
    list_display = ["title", "order"]


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ["title", "slug", "published_at"]
    search_fields = ["title", "slug"]


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ["title", "order", "is_active"]
    list_filter = ["is_active"]
