from django.urls import path

from .views import (
    AdminNotificationsSeenView, AdminNotificationsView, CustomerNotificationsMarkReadView,
    CustomerNotificationsView, StockAlertSubscribeView,
)

urlpatterns = [
    path("admin/notifications/", AdminNotificationsView.as_view(), name="admin-notifications"),
    path("admin/notifications/seen/", AdminNotificationsSeenView.as_view(), name="admin-notifications-seen"),
    path("notifications/stock-alerts/", StockAlertSubscribeView.as_view(), name="stock-alert-subscribe"),
    path("notifications/mine/", CustomerNotificationsView.as_view(), name="customer-notifications"),
    path("notifications/mine/mark-read/", CustomerNotificationsMarkReadView.as_view(), name="customer-notifications-mark-read"),
]
