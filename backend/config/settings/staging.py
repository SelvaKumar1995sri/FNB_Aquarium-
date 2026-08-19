from .base import *  # noqa

# Quick public test deployment: real Postgres + gunicorn, but no S3/CloudFront/
# RDS — media and static files stay on local disk (mounted as a Docker volume).
# Use config.settings.production instead once this moves to real client
# infrastructure behind a domain with S3-backed media.
DEBUG = False

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
    },
}
