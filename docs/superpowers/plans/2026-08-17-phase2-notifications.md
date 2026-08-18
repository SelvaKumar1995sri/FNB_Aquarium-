# Phase 2 Sub-Plan 5: Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff see, at a glance from anywhere in the admin area, that new orders or inquiries have arrived since they last checked — a header bell with a combined unread badge and a dropdown of the newest few, plus small unread-count badges on the existing Orders/Inquiries sidebar links.

**Architecture:** No dedicated notification log table. A single new model, `notifications.AdminNotificationState`, stores one `last_seen_at` timestamp per staff `User`. A staff-only `GET /api/v1/admin/notifications/` endpoint compares that timestamp against `Order.created_at`/`Inquiry.created_at` to compute unread counts and the newest few of each, on every request — cheap to compute given this project's scale, and avoids ever needing to reconcile a separate notifications table with the orders/inquiries it describes. A staff-only `POST /api/v1/admin/notifications/seen/` updates the timestamp to "now". On the frontend, a new `AdminNotificationsContext` polls the GET endpoint every ~30 seconds while an authenticated staff session is active (mirroring `CartContext`'s fetch-on-auth-change pattern, extended with a poll interval) and exposes unread counts, the latest items, and a `markSeen()` action. `Header.jsx` — the single navigation surface already shared by both the public site and the admin area — gains a bell icon/dropdown in its top bar and small badges on its existing `ADMIN_LINKS` sidebar entries, both sourced from this context.

**Tech Stack:** Django 5 + DRF (backend, already installed). React 19 + React Router 7 + axios + Tailwind v4 (frontend, already installed). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-phase2-ecommerce-design.md` (§4.6 Notifications, §5's two `admin/notifications` API rows, §7's Header notification bell + sidebar badges, §9's Header notes). SRS FR-20 through FR-23 were not re-consulted directly — no prior markdown extraction of the SRS docx exists in this repo, and re-parsing a client-signature document was avoided in a prior session for the same sensitivity reason (the document is client-signed and was handled locally rather than via a third-party service). The design spec is treated as ground truth for this plan; flag to the client-facing reviewer if the signed SRS turns out to phrase these requirements differently.

## Global Constraints

- No dedicated notification log table — a single `AdminNotificationState` row per staff `User` (`OneToOneField`) stores only `last_seen_at`; unread counts and the "latest few" lists are computed by comparing this timestamp against `Order.created_at`/`Inquiry.created_at` at request time (§4.6). This sub-plan never persists a per-notification read/unread flag.
- Both new endpoints (`GET /api/v1/admin/notifications/`, `POST /api/v1/admin/notifications/seen/`) are staff-only via DRF's built-in `IsAdminUser` for every method, including `GET` — matching the `AdminOrderViewSet` pattern from Sub-plan 4, not the public-read `IsStaffOrReadOnly` pattern from `catalog`. No anonymous or non-staff access to either endpoint.
- No real-time push (websockets) — a periodic poll every ~30 seconds from the frontend is the only mechanism (§2's explicit non-goal, §7's literal "Polled every ~30 seconds").
- This sub-plan creates no new `Order`/`OrderItem`/`Inquiry` rows and never mutates any of their fields — it only reads them (`select_related`/`order_by`/`filter`/`count`, nothing else) and writes exclusively to the new `AdminNotificationState` model.
- Existing Sub-plan 1-4 code and the `product-stock-merge` feature (accounts, cart, checkout, orders, catalog, and every existing frontend context/page) are untouched except the additive changes this plan documents. `frontend/src/main.jsx` and `frontend/src/components/public/Header.jsx` are modified via full-file replacements that preserve every existing provider/element — read the current file before the task that touches it.
- Responsive on mobile and desktop, using the site's existing Tailwind design tokens (`brand-dark`, `brand-light`, `brand-aqua`, `brand-forest`) — matching `Header.jsx`'s established visual language, including reusing its existing icon-button-with-corner-badge pattern (already used by the cart icon) for the new notification bell.

## Decisions (resolved before implementation)

- **New Django app `notifications`**, not a field/model bolted onto `orders` or `accounts`: this sub-plan's one job — aggregating unread counts across two other apps' models — doesn't belong to either `orders` or `inquiries` specifically, and follows this codebase's existing one-app-per-concern structure (`catalog`, `inquiries`, `accounts`, `cart`, `orders`). `notifications` imports `orders.models.Order` and `inquiries.models.Inquiry` for read-only queries, matching the cross-app-import precedent already established by `orders` importing `accounts.models.Address`.
- **The response is built as plain dicts in the view, not through a `ModelSerializer`:** the payload is not a serialization of `AdminNotificationState` (that model exposes neither of its two fields — `user`, `last_seen_at` — in the response); it's a computed aggregate over `Order`/`Inquiry` querysets. A serializer class here would add a layer with no reuse benefit.
- **`POST /api/v1/admin/notifications/seen/` returns 204 with no body**, and the frontend applies an optimistic local update (zeroing both unread counts immediately) rather than waiting for a follow-up `GET` — avoids an extra round trip on every dropdown open. Anything that arrived in the meantime reappears on the next 30-second poll regardless, so nothing is silently lost.
- **Opening the notification dropdown itself calls `markSeen()`** (only when there is something unread), rather than requiring a separate explicit "mark all read" action — matches the spec's minimal-ceremony framing (no per-item read state, no notification log) and is the simplest interaction that satisfies "clicking opens a dropdown listing the newest few unread orders and inquiries."
- **Inquiry notification entries link to `/admin/inquiries` (the list), not a per-item detail route:** reading the current `InquiriesManager.jsx` confirms it manages every inquiry inline in one list view — there is no `/admin/inquiries/:id` route to link to. Order notification entries link to `/admin/orders/<id>` (`OrderDetailManager.jsx`, Sub-plan 4), which does exist.
- **`AdminNotificationsProvider` is mounted in `main.jsx` inside `AuthProvider`** (it calls `useAuth()` for `isAuthenticated`/`isStaff`) but outside `CustomerAuthProvider`/`CartProvider`, since it has no dependency on customer-facing state — matching the existing dependency-ordering precedent (`CartProvider`, which depends on `CustomerAuthProvider`, is nested inside it).
- **`Header.jsx` gets no dedicated test file for this sub-plan's changes**, consistent with the established precedent that it has never had one despite being modified by all four prior sub-plans. **`AdminNotificationsContext.jsx` does get one**, matching the precedent set by `CartContext.test.jsx`/`CustomerAuthContext.test.jsx` — stateful, polling contexts are tested in this codebase; page-level chrome components are not.
- **No jest-dom, no RTL auto-cleanup; `afterEach(() => cleanup())` only where a file's tests share rendered DOM:** matches the fact established across every prior sub-plan (no `@testing-library/jest-dom` dependency, no `test.globals`/auto-cleanup in `vite.config.js`). `AdminNotificationsContext.test.jsx` uses `renderHook` exclusively and asserts only on `result.current`, never on `screen`/`document` — following `CartContext.test.jsx`'s own precedent exactly, it needs no `afterEach(cleanup())`.
- **No dedicated Django admin registration for `AdminNotificationState`:** it is a small piece of internal bookkeeping with no operational need for a staff-facing CRUD screen (unlike `Category`/`PortfolioItem`/etc.), so registering it would be unused scaffolding.

## Delivery order

Backend first, then two frontend tasks, each independently testable:

1. `notifications` app — `AdminNotificationState` model, `GET /api/v1/admin/notifications/`, `POST /api/v1/admin/notifications/seen/`.
2. `AdminNotificationsContext.jsx` — polling context wired into `main.jsx`.
3. `Header.jsx` — notification bell + dropdown in the top bar, unread badges on the `ADMIN_LINKS` sidebar entries.

---

## Task 1: `notifications` app — unread-count and mark-seen endpoints

**Files:**
- Create: `backend/notifications/apps.py`
- Create: `backend/notifications/models.py`
- Create: `backend/notifications/views.py`
- Create: `backend/notifications/urls.py`
- Create: `backend/notifications/migrations/0001_initial.py` (generated by `makemigrations`, see Step 4)
- Create: `backend/notifications/tests/__init__.py` (empty)
- Create: `backend/notifications/tests/test_views.py`
- Modify: `backend/config/settings/base.py:14-30` (add `"notifications"` to `INSTALLED_APPS`)
- Modify: `backend/config/urls.py` (mount `notifications.urls`)

**Interfaces:**
- Consumes: `orders.models.Order` (Sub-plan 3), `inquiries.models.Inquiry` (Phase 1).
- Produces: `GET /api/v1/admin/notifications/` → 200 `{"unread_orders_count": int, "unread_inquiries_count": int, "latest_orders": [{"id", "status", "customer_name", "customer_email", "total_amount", "created_at"}, ...up to 5], "latest_inquiries": [{"id", "name", "type", "created_at"}, ...up to 5]}`; `POST /api/v1/admin/notifications/seen/` → 204. Both consumed by Task 2's `AdminNotificationsContext`.

- [ ] **Step 1: Scaffold the app and write the failing tests**

Run: `cd backend && python manage.py startapp notifications` (creates the standard Django app skeleton; delete the generated `notifications/views.py`, `notifications/tests.py`, and `notifications/admin.py` — this task writes `views.py` fresh, creates `tests/` as a package instead of a single file, and this model gets no admin registration per the Decisions above).

Create `backend/notifications/tests/__init__.py` (empty) and `backend/notifications/tests/test_views.py`:

```python
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address
from inquiries.models import Inquiry
from orders.models import Order

User = get_user_model()


class AdminNotificationsViewTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="staff@example.com", password="pw12345678", is_staff=True)
        self.customer = User.objects.create_user(
            username="a@example.com", password="pw12345678", email="a@example.com", first_name="Asha",
        )
        self.address = Address.objects.create(
            user=self.customer, full_name="Asha", phone="1234567890", line1="1 Rd",
            city="City", state="State", pincode="500001",
        )

    def test_anonymous_cannot_view_notifications(self):
        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_view_notifications(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.status_code, 403)

    def test_first_check_counts_all_existing_orders_and_inquiries_as_unread(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_1",
        )
        Inquiry.objects.create(name="Ravi", phone="9999999999", message="Hi")
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["unread_orders_count"], 1)
        self.assertEqual(data["unread_inquiries_count"], 1)
        self.assertEqual(len(data["latest_orders"]), 1)
        self.assertEqual(len(data["latest_inquiries"]), 1)

    def test_latest_orders_include_customer_name_and_are_newest_first(self):
        older = Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_old",
        )
        newer = Order.objects.create(
            user=self.customer, address=self.address, total_amount="150.00", razorpay_order_id="order_new",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/notifications/")

        latest = response.json()["latest_orders"]
        self.assertEqual([item["id"] for item in latest], [newer.id, older.id])
        self.assertEqual(latest[0]["customer_name"], "Asha")

    def test_latest_lists_are_capped_at_five(self):
        for i in range(7):
            Order.objects.create(
                user=self.customer, address=self.address, total_amount="10.00", razorpay_order_id=f"order_{i}",
            )
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/api/v1/admin/notifications/")

        data = response.json()
        self.assertEqual(data["unread_orders_count"], 7)
        self.assertEqual(len(data["latest_orders"]), 5)

    def test_seen_marks_existing_items_as_read(self):
        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_before",
        )
        self.client.force_authenticate(user=self.staff)

        seen_response = self.client.post("/api/v1/admin/notifications/seen/")
        self.assertEqual(seen_response.status_code, 204)

        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.json()["unread_orders_count"], 0)

    def test_new_orders_after_seen_are_still_unread(self):
        self.client.force_authenticate(user=self.staff)
        self.client.post("/api/v1/admin/notifications/seen/")

        Order.objects.create(
            user=self.customer, address=self.address, total_amount="100.00", razorpay_order_id="order_after",
        )

        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.json()["unread_orders_count"], 1)

    def test_anonymous_cannot_mark_seen(self):
        response = self.client.post("/api/v1/admin/notifications/seen/")
        self.assertEqual(response.status_code, 401)

    def test_non_staff_cannot_mark_seen(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.post("/api/v1/admin/notifications/seen/")
        self.assertEqual(response.status_code, 403)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test notifications -v 2`
Expected: failures — the `notifications` app isn't registered in `INSTALLED_APPS` and neither `/api/v1/admin/notifications/` nor `/api/v1/admin/notifications/seen/` are routed yet, so every request 404s instead of returning the expected status codes.

- [ ] **Step 3: Implement**

`backend/notifications/apps.py`:

```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"
```

`backend/notifications/models.py`:

```python
from django.conf import settings
from django.db import models


class AdminNotificationState(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="admin_notification_state"
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Notification state for {self.user}"
```

`backend/notifications/views.py`:

```python
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from inquiries.models import Inquiry
from orders.models import Order

from .models import AdminNotificationState

LATEST_LIMIT = 5


def _unread_queryset(queryset, field, last_seen_at):
    if last_seen_at is None:
        return queryset
    return queryset.filter(**{f"{field}__gt": last_seen_at})


class AdminNotificationsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        state, _ = AdminNotificationState.objects.get_or_create(user=request.user)
        last_seen_at = state.last_seen_at

        unread_orders = _unread_queryset(
            Order.objects.select_related("user").order_by("-created_at"), "created_at", last_seen_at
        )
        unread_inquiries = _unread_queryset(
            Inquiry.objects.order_by("-created_at"), "created_at", last_seen_at
        )

        return Response({
            "unread_orders_count": unread_orders.count(),
            "unread_inquiries_count": unread_inquiries.count(),
            "latest_orders": [
                {
                    "id": order.id,
                    "status": order.status,
                    "customer_name": order.user.first_name,
                    "customer_email": order.user.email,
                    "total_amount": str(order.total_amount),
                    "created_at": order.created_at,
                }
                for order in unread_orders[:LATEST_LIMIT]
            ],
            "latest_inquiries": [
                {
                    "id": inquiry.id,
                    "name": inquiry.name,
                    "type": inquiry.type,
                    "created_at": inquiry.created_at,
                }
                for inquiry in unread_inquiries[:LATEST_LIMIT]
            ],
        })


class AdminNotificationsSeenView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        state, _ = AdminNotificationState.objects.get_or_create(user=request.user)
        state.last_seen_at = timezone.now()
        state.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

`backend/notifications/urls.py`:

```python
from django.urls import path

from .views import AdminNotificationsSeenView, AdminNotificationsView

urlpatterns = [
    path("admin/notifications/", AdminNotificationsView.as_view(), name="admin-notifications"),
    path("admin/notifications/seen/", AdminNotificationsSeenView.as_view(), name="admin-notifications-seen"),
]
```

In `backend/config/settings/base.py`, add `"notifications"` to `INSTALLED_APPS` (after `"orders"`):

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "core",
    "catalog",
    "inquiries",
    "accounts",
    "cart",
    "orders",
    "notifications",
]
```

Read the current `backend/config/urls.py` in full first — it already contains routes for `catalog`, `inquiries`, `accounts`, `cart`, and `orders`, all of which must remain exactly as they are. Replace the file with the complete version below (adds one `include("notifications.urls")` line after the `orders.urls` line):

```python
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts.views import RegisterView
from core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check),
    path("api/v1/auth/", include("core.auth_urls")),
    path("api/v1/auth/register/", RegisterView.as_view(), name="register"),
    path("api/v1/", include("catalog.urls")),
    path("api/v1/", include("inquiries.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("cart.urls")),
    path("api/v1/", include("orders.urls")),
    path("api/v1/", include("notifications.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

- [ ] **Step 4: Generate the migration and run the tests**

Run: `cd backend && python manage.py makemigrations notifications`
Expected: `Migrations for 'notifications': notifications/migrations/0001_initial.py ... - Create model AdminNotificationState`

Run: `cd backend && python manage.py test notifications -v 2`
Expected: `OK` (9 tests pass)

Run: `cd backend && python manage.py test -v 2`
Expected: `OK` (179 tests pass — 170 from before this task + 9 new)

- [ ] **Step 5: Commit**

```bash
git add backend/notifications backend/config/settings/base.py backend/config/urls.py
git commit -m "feat(notifications): add admin unread-count and mark-seen endpoints"
```

---

## Task 2: `AdminNotificationsContext.jsx` — polling context

**Files:**
- Create: `frontend/src/context/AdminNotificationsContext.jsx`
- Create: `frontend/src/context/AdminNotificationsContext.test.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `apiClient` (existing, staff), `useAuth()` (existing `AuthContext`), `GET /api/v1/admin/notifications/` / `POST /api/v1/admin/notifications/seen/` (Task 1).
- Produces: `useAdminNotifications()` hook returning `{ unreadOrdersCount: number, unreadInquiriesCount: number, latestOrders: array, latestInquiries: array, refresh: () => Promise, markSeen: () => Promise }`. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

`frontend/src/context/AdminNotificationsContext.test.jsx`:

```jsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { AdminNotificationsProvider, useAdminNotifications } from "./AdminNotificationsContext";

vi.mock("../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

let mockAuthState = { isAuthenticated: true, isStaff: true };
vi.mock("./AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const EMPTY_RESPONSE = {
  unread_orders_count: 0,
  unread_inquiries_count: 0,
  latest_orders: [],
  latest_inquiries: [],
};

const WITH_UNREAD_RESPONSE = {
  unread_orders_count: 2,
  unread_inquiries_count: 1,
  latest_orders: [
    { id: 5, status: "placed", customer_name: "Asha", customer_email: "a@example.com", total_amount: "100.00", created_at: "2026-08-18T00:00:00Z" },
  ],
  latest_inquiries: [{ id: 3, name: "Ravi", type: "general", created_at: "2026-08-18T00:00:00Z" }],
};

describe("AdminNotificationsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isAuthenticated: true, isStaff: true };
  });

  it("fetches notifications on mount when authenticated staff", async () => {
    apiClient.get.mockResolvedValueOnce({ data: EMPTY_RESPONSE });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/admin/notifications/"));
    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(0));
  });

  it("does not fetch when not staff", async () => {
    mockAuthState = { isAuthenticated: true, isStaff: false };

    renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => {});
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("stores unread counts and latest items from the response", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(2));
    expect(result.current.unreadInquiriesCount).toBe(1);
    expect(result.current.latestOrders).toEqual(WITH_UNREAD_RESPONSE.latest_orders);
    expect(result.current.latestInquiries).toEqual(WITH_UNREAD_RESPONSE.latest_inquiries);
  });

  it("polls again after 30 seconds while authenticated staff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiClient.get.mockResolvedValue({ data: EMPTY_RESPONSE });

    renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("markSeen posts to the seen endpoint and zeroes unread counts locally", async () => {
    apiClient.get.mockResolvedValueOnce({ data: WITH_UNREAD_RESPONSE });
    apiClient.post.mockResolvedValueOnce({ status: 204 });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });
    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(2));

    await act(async () => {
      await result.current.markSeen();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/admin/notifications/seen/");
    expect(result.current.unreadOrdersCount).toBe(0);
    expect(result.current.unreadInquiriesCount).toBe(0);
  });

  it("resets to empty state on a fetch error", async () => {
    apiClient.get.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useAdminNotifications(), { wrapper: AdminNotificationsProvider });

    await waitFor(() => expect(result.current.unreadOrdersCount).toBe(0));
    expect(result.current.latestOrders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/context/AdminNotificationsContext.test.jsx`
Expected: FAIL — `Failed to resolve import "./AdminNotificationsContext"` (the module doesn't exist yet).

- [ ] **Step 3: Implement**

`frontend/src/context/AdminNotificationsContext.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "./AuthContext";

const AdminNotificationsContext = createContext(null);

const EMPTY_STATE = {
  unreadOrdersCount: 0,
  unreadInquiriesCount: 0,
  latestOrders: [],
  latestInquiries: [],
};

const POLL_INTERVAL_MS = 30000;

export function AdminNotificationsProvider({ children }) {
  const { isAuthenticated, isStaff } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  const refresh = useCallback(() => {
    if (!isAuthenticated || !isStaff) {
      setState(EMPTY_STATE);
      return Promise.resolve();
    }
    return apiClient
      .get("/admin/notifications/")
      .then((response) => {
        setState({
          unreadOrdersCount: response.data.unread_orders_count,
          unreadInquiriesCount: response.data.unread_inquiries_count,
          latestOrders: response.data.latest_orders,
          latestInquiries: response.data.latest_inquiries,
        });
      })
      .catch(() => setState(EMPTY_STATE));
  }, [isAuthenticated, isStaff]);

  useEffect(() => {
    refresh();
    if (!isAuthenticated || !isStaff) return undefined;
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, isStaff, refresh]);

  const markSeen = async () => {
    await apiClient.post("/admin/notifications/seen/");
    setState((prev) => ({ ...prev, unreadOrdersCount: 0, unreadInquiriesCount: 0 }));
  };

  return (
    <AdminNotificationsContext.Provider value={{ ...state, refresh, markSeen }}>
      {children}
    </AdminNotificationsContext.Provider>
  );
}

export function useAdminNotifications() {
  return useContext(AdminNotificationsContext);
}
```

Read the current `frontend/src/main.jsx` in full first. Replace it with the complete version below (adds the `AdminNotificationsProvider` import and nests it inside `AuthProvider`, outside `CustomerAuthProvider`):

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AdminNotificationsProvider } from "./context/AdminNotificationsContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AdminNotificationsProvider>
        <CustomerAuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </CustomerAuthProvider>
      </AdminNotificationsProvider>
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/context/AdminNotificationsContext.test.jsx`
Expected: PASS (6 tests)

Run: `cd frontend && npx vitest run`
Expected: PASS (54 tests — 48 baseline + 6 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AdminNotificationsContext.jsx frontend/src/context/AdminNotificationsContext.test.jsx frontend/src/main.jsx
git commit -m "feat(notifications): add polling context for admin unread notifications"
```

---

## Task 3: `Header.jsx` — notification bell, dropdown, and sidebar badges

**Files:**
- Modify: `frontend/src/components/public/Header.jsx`

**Interfaces:**
- Consumes: `useAdminNotifications()` (Task 2).
- Produces: nothing consumed by later tasks — this is the final task of the final sub-plan.

- [ ] **Step 1: Implement**

Read the current `frontend/src/components/public/Header.jsx` in full first — it already contains `NAV_LINKS`, `ADMIN_LINKS`, `SearchIcon`, `CartIcon`, and the full `Header` component with its top bar and nav drawer, all of which must remain exactly as they are apart from the additions below. Replace the file with the complete version:

```jsx
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAdminNotifications } from "../../context/AdminNotificationsContext";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

const NAV_LINKS = [
  { to: "/fish", label: "Fish" },
  { to: "/plants", label: "Plants" },
  { to: "/products", label: "Products" },
  { to: "/services", label: "Services" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" },
];

const ADMIN_LINKS = [
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/videos", label: "Videos" },
  { to: "/admin/inquiries", label: "Inquiries" },
  { to: "/admin/orders", label: "Orders" },
];

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 4h2l2.4 12h9.2L20 8H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

function BellIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 9a6 6 0 1 1 12 0v5l1.5 3h-15L6 14V9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { isAuthenticated, isStaff, logout } = useAuth();
  const { isAuthenticated: isCustomerAuthenticated, profile, logout: customerLogout } = useCustomerAuth();
  const { itemCount } = useCart();
  const { unreadOrdersCount, unreadInquiriesCount, latestOrders, latestInquiries, markSeen } = useAdminNotifications();

  const totalUnread = unreadOrdersCount + unreadInquiriesCount;
  const sidebarBadgeCounts = {
    "/admin/orders": unreadOrdersCount,
    "/admin/inquiries": unreadInquiriesCount,
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const toggleNotifDropdown = () => {
    const opening = !isNotifOpen;
    setIsNotifOpen(opening);
    if (opening && totalUnread > 0) markSeen();
  };

  return (
    <>
      <header className="bg-brand-dark text-white sticky top-0 z-40">
        <div className="grid grid-cols-3 items-center px-4 py-3">
          <div className="flex items-center">
            <button
              type="button"
              className="p-2"
              aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isOpen}
              aria-controls="main-sidebar-nav"
              onClick={() => setIsOpen((open) => !open)}
            >
              <span className="block w-6 h-0.5 bg-white mb-1" />
              <span className="block w-6 h-0.5 bg-white mb-1" />
              <span className="block w-6 h-0.5 bg-white" />
            </button>
          </div>

          <NavLink to="/" className="flex items-center justify-center">
            <img src="/logo.png" alt="FNB Aquatic Studio" className="h-10 w-auto" />
          </NavLink>

          <div className="flex items-center justify-end gap-3">
            <Link to="/search" aria-label="Search" className="p-2 hover:text-brand-aqua">
              <SearchIcon className="h-5 w-5" />
            </Link>
            {isCustomerAuthenticated && (
              <Link
                to="/cart"
                aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                className="relative p-2 hover:text-brand-aqua"
              >
                <CartIcon className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-aqua text-brand-dark text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </Link>
            )}
            {isCustomerAuthenticated ? (
              <>
                <Link
                  to="/account/addresses"
                  className="hidden sm:inline whitespace-nowrap text-sm px-3 py-1.5 hover:text-brand-aqua transition-colors"
                >
                  Hi, {profile?.name?.split(" ")[0] || "there"}
                </Link>
                <button
                  type="button"
                  onClick={customerLogout}
                  aria-label="Customer logout"
                  className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                aria-label="Customer login"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                Login
              </Link>
            )}
            {isAuthenticated && isStaff && (
              <div className="relative">
                <button
                  type="button"
                  aria-label={`Notifications, ${totalUnread} unread`}
                  className="relative p-2 hover:text-brand-aqua"
                  onClick={toggleNotifDropdown}
                >
                  <BellIcon className="h-5 w-5" />
                  {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </button>
                {isNotifOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white text-brand-dark rounded-lg shadow-xl border z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b font-semibold text-sm">Notifications</div>
                    {latestOrders.length === 0 && latestInquiries.length === 0 && (
                      <p className="p-3 text-sm text-gray-500">No new notifications.</p>
                    )}
                    {latestOrders.map((order) => (
                      <Link
                        key={`order-${order.id}`}
                        to={`/admin/orders/${order.id}`}
                        onClick={() => setIsNotifOpen(false)}
                        className="block p-3 text-sm border-b hover:bg-gray-50"
                      >
                        New order #{order.id} — {order.customer_name || order.customer_email}
                      </Link>
                    ))}
                    {latestInquiries.map((inquiry) => (
                      <Link
                        key={`inquiry-${inquiry.id}`}
                        to="/admin/inquiries"
                        onClick={() => setIsNotifOpen(false)}
                        className="block p-3 text-sm border-b hover:bg-gray-50"
                      >
                        New inquiry from {inquiry.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isAuthenticated && isStaff ? (
              <button
                type="button"
                onClick={logout}
                aria-label="Admin logout"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link
                to="/admin/login"
                aria-label="Admin login"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                <span className="hidden sm:inline">Admin </span>Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 bg-black/60 transition-opacity duration-300 z-40 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <nav
        id="main-sidebar-nav"
        aria-label="Main navigation"
        inert={!isOpen}
        className={`fixed top-0 left-0 h-full w-64 bg-brand-dark text-white z-50 shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <NavLink to="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
            <img src="/logo.png" alt="FNB Aquatic Studio" className="h-8 w-auto" />
          </NavLink>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="p-2 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setIsOpen(false)}
              className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
            >
              {link.label}
            </NavLink>
          ))}
          {isCustomerAuthenticated && (
            <>
              <hr className="border-white/10 my-2" />
              <span className="px-2 text-xs uppercase tracking-wide text-white/50">Account</span>
              <NavLink
                to="/account/addresses"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                My Account
              </NavLink>
              <NavLink
                to="/account/orders"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                My Orders
              </NavLink>
              <NavLink
                to="/cart"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                Cart{itemCount > 0 ? ` (${itemCount})` : ""}
              </NavLink>
            </>
          )}
          {isAuthenticated && isStaff && (
            <>
              <hr className="border-white/10 my-2" />
              <span className="px-2 text-xs uppercase tracking-wide text-white/50">Admin</span>
              {ADMIN_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua flex items-center justify-between"
                >
                  <span>{link.label}</span>
                  {sidebarBadgeCounts[link.to] > 0 && (
                    <span className="bg-red-600 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                      {sidebarBadgeCounts[link.to] > 9 ? "9+" : sidebarBadgeCounts[link.to]}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </div>
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Manual verification**

This task has no automated test file, matching the established precedent that `Header.jsx` has never had one despite being modified by all four prior sub-plans. Run the full frontend test suite to confirm no regressions.

Run: `cd frontend && npx vitest run`
Expected: PASS (54 tests — no new tests from this task).

Then manually verify in a browser: log in as staff, confirm the bell badge shows the correct combined count, opening the dropdown lists the newest orders/inquiries and clears the badge, and the Orders/Inquiries sidebar entries each show their own badge that clears after opening the dropdown once and repopulates only for items created after that point.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/public/Header.jsx
git commit -m "feat(notifications): add admin header notification bell and sidebar badges"
```
