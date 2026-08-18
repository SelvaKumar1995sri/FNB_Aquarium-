from django.urls import path

from .views import AdminNotificationsSeenView, AdminNotificationsView

urlpatterns = [
    path("admin/notifications/", AdminNotificationsView.as_view(), name="admin-notifications"),
    path("admin/notifications/seen/", AdminNotificationsSeenView.as_view(), name="admin-notifications-seen"),
]
