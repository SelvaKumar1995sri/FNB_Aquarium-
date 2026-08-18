from django.conf import settings
from django.db import models


class AdminNotificationState(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="admin_notification_state"
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Notification state for {self.user}"
