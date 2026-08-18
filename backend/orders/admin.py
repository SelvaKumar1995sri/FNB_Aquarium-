from django.contrib import admin

from .models import CheckoutSession, Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "status", "total_amount", "created_at"]
    list_filter = ["status"]
    search_fields = ["user__username", "razorpay_order_id", "razorpay_payment_id"]
    inlines = [OrderItemInline]


@admin.register(CheckoutSession)
class CheckoutSessionAdmin(admin.ModelAdmin):
    list_display = ["user", "razorpay_order_id", "amount", "order", "created_at"]
    search_fields = ["user__username", "razorpay_order_id"]
