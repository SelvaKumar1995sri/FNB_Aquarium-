from django.core.management.base import BaseCommand

from catalog.models import BlogPost, Category, PortfolioItem, Product, Video


class Command(BaseCommand):
    help = "Seed placeholder catalog content for local development and demos."

    def handle(self, *args, **options):
        fish, _ = Category.objects.get_or_create(name="Fish", slug="fish", defaults={"order": 1})
        plants, _ = Category.objects.get_or_create(name="Plants", slug="plants", defaults={"order": 2})
        tanks, _ = Category.objects.get_or_create(name="Tanks", slug="tanks", defaults={"order": 3})

        Category.objects.get_or_create(name="Discus", slug="discus", defaults={"parent": fish, "order": 1})
        Category.objects.get_or_create(name="Arowana", slug="arowana", defaults={"parent": fish, "order": 2})

        Product.objects.get_or_create(
            slug="red-discus",
            defaults={"name": "Red Discus", "category": fish, "price": 1500, "description": "Vibrant red discus, 3 inch."},
        )
        Product.objects.get_or_create(
            slug="anubias-nana",
            defaults={"name": "Anubias Nana", "category": plants, "price": 250, "description": "Hardy low-light aquarium plant."},
        )
        Product.objects.get_or_create(
            slug="60cm-rimless-tank",
            defaults={"name": "60cm Rimless Tank", "category": tanks, "price": 4500, "is_featured": True,
                      "description": "Ultra-clear 60cm rimless glass tank."},
        )

        if not PortfolioItem.objects.filter(title="Living Room Reef Tank").exists():
            PortfolioItem.objects.create(title="Living Room Reef Tank", description="A 4ft custom reef build.", order=1)

        BlogPost.objects.get_or_create(
            slug="how-to-cycle-a-new-tank",
            defaults={"title": "How to Cycle a New Tank", "body": "A new aquarium needs 2-4 weeks to cycle before adding fish..."},
        )

        if not Video.objects.filter(youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ").exists():
            Video.objects.create(youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="FNB Aqua Studio Tour", order=1)

        self.stdout.write(self.style.SUCCESS("Seed data created."))
