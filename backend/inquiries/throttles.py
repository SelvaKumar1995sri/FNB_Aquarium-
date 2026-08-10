from rest_framework.throttling import AnonRateThrottle


class InquiryCreateThrottle(AnonRateThrottle):
    scope = "inquiry_create"
