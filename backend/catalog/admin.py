from django.contrib import admin

from .models import BlogPost, Category, PortfolioItem, Product, ProductImage, Video

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(ProductImage)
admin.site.register(PortfolioItem)
admin.site.register(BlogPost)
admin.site.register(Video)
