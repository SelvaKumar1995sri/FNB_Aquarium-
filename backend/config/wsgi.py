"""
WSGI config for the FNB Aqua backend project.

It exposes the WSGI callable as a module-level variable named ``application``.
"""
import os

from django.core.wsgi import get_wsgi_application

if "DJANGO_SETTINGS_MODULE" not in os.environ:
    raise RuntimeError(
        "DJANGO_SETTINGS_MODULE must be set explicitly when running via WSGI "
        "(e.g. config.settings.production) — no default is applied for safety."
    )

application = get_wsgi_application()
