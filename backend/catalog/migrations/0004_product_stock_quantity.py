from django.db import migrations, models


def backfill_stock_quantity(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    Product.objects.filter(in_stock=True).update(stock_quantity=10)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_category_banner_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="stock_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(backfill_stock_quantity, noop_reverse),
        migrations.RemoveField(
            model_name="product",
            name="in_stock",
        ),
    ]
