# Product Enquiry Modal, Notes/Specification, and Stock-Alert Notifications

Date: 2026-08-25
Status: Approved for planning

## 1. Overview

Four related changes to the customer-facing product experience, requested
together from a comparison against a reference site (chennaiaquarium.in):

1. **Enquiry-as-modal**: the "Enquire about this product" form on the product
   detail page is currently rendered inline, full-height, below the
   Add-to-Cart controls. Replace it with a button that opens the existing
   form inside a modal.
2. **Optional Note + Specification fields on Product**: two new optional
   fields, set via the admin edit form after a product already exists (never
   required at creation). Note renders as a small highlighted callout;
   Specification renders inside a collapsible accordion, matching the
   reference screenshots.
3. **Automatic out-of-stock status**: already fully implemented —
   `Product.in_stock` (`backend/catalog/models.py:60-62`) is a derived
   property off `stock_quantity`, so the moment stock hits 0 the storefront
   already shows "Out of stock" with no code change needed. Documented here
   only so the plan doesn't re-implement it.
4. **"Notify Me" + restock notifications**: a logged-in customer can ask to
   be told when an out-of-stock product is restocked. When an admin (or the
   `add-stock` conflict-resolution flow) brings `stock_quantity` from 0 to
   positive, every customer who asked gets a notification that shows up in a
   bell/dropdown in the site header — the same pattern already used for
   admin order/inquiry notifications, mirrored for customers.

These ship together because (2) and (4) both touch `ProductDetail.jsx` and
`ProductsManager.jsx`, and (1)'s `Modal` component is what (4)'s admin-bell
pattern already proves out on the customer side isn't needed (the bell is a
dropdown, not a modal) — but the shared `Modal` component itself needs to
move from admin-only to a shared location for (1), so it's one coherent pass
over these files rather than three uncoordinated ones.

## 2. Decisions already made (from brainstorming)

- Restock notifications appear in a **persistent bell/dropdown in the
  customer header**, mirroring the existing admin notification bell
  (`AdminNotificationsContext` / `Header.jsx:135-179`), not a one-time login
  popup.
- **"Notify Me" requires being logged in** — no guest/anonymous email-capture
  path. Clicking it while logged out redirects to `/login` (same pattern
  `ProductDetail.jsx:31-35` already uses for Add to Cart).
- Specification content is authored as **lightweight `**bold**` / `- bullet`
  text** in a plain textarea (no WYSIWYG/contentEditable editor, no new
  dependency), parsed to safe HTML on render.
- Note and Specification are **optional on both create and edit** — no
  validation requiring them, consistent with "add later via edit."

## 3. Backend: `catalog` app — Note + Specification fields

`backend/catalog/models.py`: add to `Product`:

```python
note = models.TextField(blank=True, default="")
specification = models.TextField(blank=True, default="")
```

New migration `backend/catalog/migrations/0006_product_note_specification.py`
(next number after `0005_product_unique_product_name_per_category_ci.py`).

`backend/catalog/serializers.py` — `ProductSerializer.Meta.fields`: add
`"note"` and `"specification"` (both plain read/write strings, no special
validation — blank is valid).

No admin-side "required" flag anywhere; the existing `ProductsManager.jsx`
form already treats `description` as optional (`<textarea>` with no
`required`), and Note/Specification follow the same pattern (§6).

## 4. Backend: `notifications` app — stock alerts

### 4.1 New models (`backend/notifications/models.py`)

```python
class StockAlertSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="stock_alert_subscriptions"
    )
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="stock_alert_subscriptions"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "product"], name="unique_stock_alert_subscription"),
        ]


class CustomerNotification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    product = models.ForeignKey("catalog.Product", null=True, on_delete=models.SET_NULL, related_name="+")
    message = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
```

`product` uses the string `"catalog.Product"` reference (standard
cross-app FK) — no import-time coupling between the two apps' `models.py`.
`CustomerNotification.product` is nullable with `SET_NULL` so a later product
deletion doesn't cascade-delete a customer's notification history.

One subscription row per `(user, product)`, reused across cycles: when a
restock notification fires, `notified_at` is stamped (§4.2); if the product
later goes out of stock again and the customer clicks "Notify Me" again, the
subscribe endpoint (§4.3) re-arms the same row (`notified_at` back to null)
instead of erroring on the unique constraint.

New migration `backend/notifications/migrations/0002_stockalertsubscription_customernotification.py`
(next number after `0001_initial.py`).

### 4.2 Restock detection (`backend/notifications/services.py`, new file)

```python
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
```

Called from two places in `backend/catalog/views.py` (`ProductViewSet`), the
only two places `stock_quantity` changes today — no Django signals, matching
the plain-`.save()`/explicit-call style already used for the stock-decrement
logic in `backend/orders/views.py:120,201`:

- **Direct edit** (admin PATCH/PUT via `ProductsManager.jsx`): override
  `perform_update`:
  ```python
  def perform_update(self, serializer):
      was_out_of_stock = serializer.instance.stock_quantity == 0
      super().perform_update(serializer)
      if was_out_of_stock and serializer.instance.stock_quantity > 0:
          notify_restock(serializer.instance)
  ```
  (`serializer.instance` holds the pre-save DB values until `.save()` runs
  inside `super().perform_update()`, so the before/after read is correct.)
- **`add_stock` action** (`backend/catalog/views.py:91-104`, the
  409-conflict "add to existing stock" flow): capture
  `was_out_of_stock = product.stock_quantity == 0` before the `F()` update,
  call `notify_restock(product)` after `product.refresh_from_db()` if it
  transitioned to positive.

### 4.3 API (`backend/notifications/urls.py`, `views.py`)

Three new endpoints, all `IsAuthenticated`, added alongside the existing
`admin/notifications/...` ones:

- `POST /notifications/stock-alerts/` — body `{"product": <id>}`. Looks up
  the product (404 if missing), 400s with `{"detail": "This product is
  already in stock."}` if `product.in_stock` is already true, otherwise
  `StockAlertSubscription.objects.update_or_create(user=request.user,
  product=product, defaults={"notified_at": None})` → `204`.
- `GET /notifications/mine/` — returns
  `{"unread_count": <int>, "notifications": [{"id", "message",
  "product_slug", "created_at", "read_at"}, ...]}`, latest 20, newest first.
  `unread_count` computed from the full (unsliced) queryset before limiting.
- `POST /notifications/mine/mark-read/` — bulk `UPDATE ... SET read_at = now
  WHERE user = request.user AND read_at IS NULL` (mirrors the admin
  notifications' bulk "seen" semantics; no per-row granularity needed).

### 4.4 `ProductSerializer` additions

Add a computed field so the customer-facing button knows its own state:

```python
stock_alert_subscribed = serializers.SerializerMethodField()

def get_stock_alert_subscribed(self, obj):
    request = self.context.get("request")
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return False
    return obj.stock_alert_subscriptions.filter(user=user, notified_at__isnull=True).exists()
```

`ProductViewSet`'s default `get_serializer_context()` already includes
`request`, so no view changes needed for this field specifically (the
existing `add_stock` action already passes `context={"request": request}`
explicitly, per current code).

## 5. Frontend: shared `Modal` + enquiry-as-popup

`frontend/src/components/admin/Modal.jsx` moves to
`frontend/src/components/common/Modal.jsx` (no behavior change — same
backdrop/Escape/× close logic). Update the three existing imports
(`CategoriesManager.jsx`, `ProductsManager.jsx`, `VideosManager.jsx`) to the
new path.

`frontend/src/pages/public/ProductDetail.jsx`: replace the always-rendered
`<InquiryForm type="product" product={product} />` (currently lines 106-107)
with:

```jsx
<button type="button" onClick={() => setIsEnquiryOpen(true)} className="...">
  Enquire about this product
</button>
{isEnquiryOpen && (
  <Modal title="Enquire about this product" onClose={() => setIsEnquiryOpen(false)}>
    <InquiryForm type="product" product={product} />
  </Modal>
)}
```

No changes needed to `InquiryForm.jsx` itself — it already renders its own
inline success/error state, which now simply renders inside the modal body.

## 6. Frontend: Note + Specification display and editing

### 6.1 Lightweight formatter (`frontend/src/utils/specFormat.js`, new file)

Parses `**bold**` and `- bullet` lines into sanitized HTML — text is
HTML-escaped first, then only the literal `**...**` pattern is turned into
`<strong>`, so admin-authored content can never inject arbitrary markup:

```js
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function specificationToHtml(text) {
  if (!text) return "";
  let html = "";
  let inList = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${formatInline(line.slice(2))}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (line) html += `<p>${formatInline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}
```

Unit tests: `frontend/src/utils/specFormat.test.js` — bold inline, a bullet
list, mixed paragraphs + bullets, and an HTML-injection attempt (`<script>`)
coming back escaped.

### 6.2 `SpecificationAccordion` (`frontend/src/components/public/SpecificationAccordion.jsx`, new)

Renders nothing if `content` is empty. Otherwise a button labeled
"SPECIFICATION" with a `+`/`−` indicator toggling a collapsed/expanded body
(`dangerouslySetInnerHTML` fed by `specificationToHtml`), matching the
reference screenshots' collapsed-by-default accordion.

### 6.3 `ProductDetail.jsx` layout additions

- Note (if `product.note` present): small highlighted callout rendered near
  the stock-status area, e.g. `<span className="font-semibold">Note: </span>{product.note}`.
- `<SpecificationAccordion content={product.specification} />` rendered
  after the enquiry button/modal, before "Related Products."

### 6.4 `ProductsManager.jsx` form additions

Two new optional fields in the existing create/edit form (same modal, no new
modal): a `<textarea>` for Note (plain, like `description` today) and a
`<textarea>` for Specification with one line of helper text ("Use **bold**
and lines starting with `- ` for bullets") above it. Add `note: ""` and
`specification: ""` to the form's initial state (`useState`, line 13-21) and
to `resetForm`/`startEdit`/submit `payload` — same mechanical treatment as
every other field in that form today. No `required` attribute on either.

## 7. Frontend: "Notify Me" button + out-of-stock area

`frontend/src/components/public/NotifyMeButton.jsx` (new): given a `product`
prop, shows "Notify Me" (or "You'll be notified", disabled, if
`product.stock_alert_subscribed` is true). Clicking while logged out
navigates to `/login` (mirrors `handleAddToCart`'s existing pattern,
`ProductDetail.jsx:31-35`); while logged in, `POST
/notifications/stock-alerts/` then flips to the disabled state.

`ProductDetail.jsx`'s out-of-stock branch (currently
`<span className="text-red-600 font-medium">Out of stock</span>`, line 101)
becomes:

```jsx
<div className="flex flex-col gap-2">
  <span className="text-red-600 font-medium">Out of stock</span>
  <NotifyMeButton key={product.id} product={product} />
</div>
```

The `key={product.id}` is required: `NotifyMeButton`'s subscribed/idle state
is seeded once from the `product` prop via `useState`'s initial value, and
without the key it wouldn't reset when the user navigates from one
out-of-stock product's page directly to another's.

## 8. Frontend: customer notification bell

New `frontend/src/context/CustomerNotificationsContext.jsx`, structurally a
copy of `AdminNotificationsContext.jsx` (§ same 30s poll interval, same
refresh-on-mount-and-on-auth-change pattern) but:
- Gated on `isAuthenticated && !isStaff` instead of `isStaff`.
- Backed by `GET /notifications/mine/` / `POST /notifications/mine/mark-read/`
  instead of the admin endpoints.
- Exposes `{ unreadCount, notifications, markRead }`.

Registered in `frontend/src/main.jsx` alongside the existing
`AdminNotificationsProvider` (nesting order doesn't matter, both only read
`useAuth()`).

`frontend/src/components/public/Header.jsx`: add a bell button + dropdown for
`isCustomerAuthenticated` (the block already destructured at line 58),
positioned next to the existing "Hi, {name}" link (~line 127-134),
structurally mirroring the staff bell block (lines 135-179): badge showing
`unreadCount`, dropdown listing `notifications` (each entry = `message` +
relative time), calling `markRead()` when opened if `unreadCount > 0` (same
snapshot-on-open technique as `toggleNotifDropdown`, `Header.jsx:77-84`, so
the visible list doesn't blank out mid-read). No navigation target per row
(unlike admin's order/inquiry links) since a restock notification doesn't
have a single canonical page to send them to beyond the product itself —
link each entry to `/product/${product_slug}` when present.

Because the bell is driven by the same polling context, a customer who logs
in sees the badge as soon as `refresh()` fires post-login — satisfying "user
should [be] notified when he logged in" without a separate login-time popup.

## 9. Out of scope

- No changes to the automatic out-of-stock derivation itself (§1 item 3) —
  already correct.
- No guest/anonymous stock-alert signup.
- No WYSIWYG/rich-text editor dependency for Specification.
- No per-notification (only bulk) read/unread tracking.
- No changes to `OrdersManager.jsx` / `InquiriesManager.jsx` / `Login.jsx`.

## 10. Testing

Backend:
- `backend/catalog/tests/test_stock.py`: extend with restock-notification
  cases — PATCH-ing `stock_quantity` from 0 to a positive number creates a
  `CustomerNotification` for each subscriber and stamps `notified_at`; doing
  it again with no new subscribers is a no-op; a non-zero → different
  non-zero change never notifies; the `add-stock` action path (0 → positive
  via the 409-resolution flow) also notifies.
- `backend/catalog/tests/test_views.py`: `ProductSerializer` output includes
  `note`, `specification`, `stock_alert_subscribed` (false for anonymous/no
  subscription, true once subscribed-and-unnotified).
- `backend/notifications/tests/test_views.py`: extend with
  `StockAlertSubscribeView` (subscribe, re-subscribe after being notified,
  400 on an in-stock product, requires auth), `CustomerNotificationsView`
  (unread count, ordering, only returns the requesting user's own rows), and
  `CustomerNotificationsMarkReadView` (clears unread count, doesn't touch
  other users' rows).

Frontend:
- `frontend/src/utils/specFormat.test.js` (new) — per §6.1.
- `ProductDetail.test.jsx` (extend or create): enquiry button opens/closes
  the modal instead of showing the form inline; out-of-stock product shows
  "Notify Me"; clicking it while logged out redirects to `/login`; note and
  specification render only when present.
- `ProductsManager.test.jsx` (extend): note/specification fields submit and
  pre-fill on edit, remain optional (submit succeeds with both blank).
- `Header.test.jsx` (extend if it exists, else new): customer bell shows
  unread badge, dropdown lists notifications, marks read on open.
- Manual verification in the dev server: set a product's stock to 0, log in
  as a customer, click Notify Me, have an admin (second session/incognito)
  edit that product's stock back up to a positive number, confirm the
  customer's bell badge appears within one poll interval (or immediately on
  next login).
