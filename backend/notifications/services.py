from django.utils import timezone

from .models import CustomerNotification, StockAlertSubscription


def notify_restock(product):
    subscriptions = StockAlertSubscription.objects.filter(
        product=product, notified_at__isnull=True
    ).select_related("user")
    for subscription in subscriptions:
        CustomerNotification.objects.create(
            user=subscription.user,
            product=product,
            message=f'"{product.name}" is back in stock.',
        )
    subscriptions.update(notified_at=timezone.now())
