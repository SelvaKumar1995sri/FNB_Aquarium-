import re

from django.db import models
from django.db.models.functions import Lower


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=110, unique=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="children", on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to="categories/", null=True, blank=True)
    banner_image = models.ImageField(upload_to="categories/banners/", null=True, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=210, unique=True)
    category = models.ForeignKey(Category, related_name="products", on_delete=models.CASCADE)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=0)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(Lower("name"), "category", name="unique_product_name_per_category_ci"),
        ]

    def __str__(self):
        return self.name

    @property
    def in_stock(self):
        return self.stock_quantity > 0


class ProductImage(models.Model):
    product = models.ForeignKey(Product, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="products/")
    alt_text = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]


class PortfolioItem(models.Model):
    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to="portfolio/", null=True, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title


class BlogPost(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=210, unique=True)
    body = models.TextField()
    cover_image = models.ImageField(upload_to="blog/", null=True, blank=True)
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at"]

    def __str__(self):
        return self.title


YOUTUBE_ID_PATTERN = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})"
)


class Video(models.Model):
    title = models.CharField(max_length=200)
    youtube_url = models.URLField()
    thumbnail = models.ImageField(upload_to="videos/", null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title

    @property
    def video_id(self):
        match = YOUTUBE_ID_PATTERN.search(self.youtube_url)
        return match.group(1) if match else ""

    @property
    def default_thumbnail_url(self):
        if not self.video_id:
            return ""
        return f"https://img.youtube.com/vi/{self.video_id}/hqdefault.jpg"
