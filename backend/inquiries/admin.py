from django.contrib import admin

from .models import Inquiry


@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "type", "status", "created_at"]
    list_filter = ["type", "status"]
    search_fields = ["name", "phone", "email"]
