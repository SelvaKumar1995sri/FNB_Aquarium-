from django.db import models

from catalog.models import Product


class Inquiry(models.Model):
    TYPE_CHOICES = [
        ("general", "General"),
        ("product", "Product"),
        ("build_tank", "Build Tank"),
    ]
    STATUS_CHOICES = [
        ("new", "New"),
        ("contacted", "Contacted"),
        ("closed", "Closed"),
    ]

    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="general")
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)
    tank_size = models.CharField(max_length=100, blank=True)
    tank_shape = models.CharField(max_length=100, blank=True)
    budget_notes = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "inquiries"
        indexes = [models.Index(fields=["status"]), models.Index(fields=["type"])]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"
