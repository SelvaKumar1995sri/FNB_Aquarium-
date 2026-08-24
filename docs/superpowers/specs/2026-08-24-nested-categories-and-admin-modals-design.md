# Multi-Level Categories + List/Modal Admin Pattern

Date: 2026-08-24
Status: Approved for planning

## 1. Overview

Two related changes:

1. **Multi-level (unlimited depth) product categories** — e.g. Fish > Cichlid >
   "Full Moon", Fish > Betta > "Black". `Category.parent` (self-referential FK)
   has existed since the first migration, but the admin UI, storefront
   breadcrumbs, and API only really exercise one level today. This work closes
   those gaps so staff can nest a category under any existing category, at any
   depth, and customers can browse and see correct breadcrumbs at any depth.
2. **Admin CRUD UX**: Categories, Products, and Videos admin pages currently
   show an always-visible inline create/edit form above the list. Replace this
   with: list only + a "New <Thing>" button that opens a modal for create/edit,
   and a success popup after create/edit/delete.

These ship together because the category picker redesign (indented,
path-labeled dropdown) only makes sense once it lives inside the new modal
form, and all three admin pages share the exact same inline-form-to-modal
restructuring.

## 2. Decisions already made (from brainstorming)

- Parent category pages show **subcategory tiles only**, never a combined
  product listing from descendants. No change needed to `ProductViewSet`'s
  category filter — it already does exact-match, which is what we want.
- **Unlimited nesting depth** — no depth cap in validation or UI.
- Ancestor/depth info for indentation and breadcrumbs is computed
  **client-side** from the existing flat category list, not added to the API
  response. No backend serializer changes for this; the API shape for
  `Category` is unchanged.
- Admin parent/category pickers use an **indented flat `<select>`** (not a
  tree widget), e.g.:
  ```
  Fish
  　Betta
  　　Full Moon
  　　Black
  　Cichlid
  Plants
  ```
- Success feedback after create/edit/delete is a **popup** (reusing the same
  `Modal` component as the form), not a toast.

## 3. Bonus fix: `/admin` routing collision (blocks testing the new UI)

Discovered while finishing this spec, unrelated to categories but blocking
verification of §8 below: the React SPA's admin routes (`/admin/*`, guarded
by `AdminGuard`) and Django's raw admin (`path("admin/", admin.site.urls)` in
`backend/config/urls.py`) both claim the `/admin` prefix. The deployed
Caddy/nginx config proxies `/admin/*` straight to the Django backend
(`handle /admin/* { reverse_proxy backend:8000 }` in `frontend/Caddyfile`),
so the browser never reaches the React app for any `/admin/...` URL —
confirmed live: `http://13.50.60.19/admin/categories` returns a 302 to
Django's `/admin/login/?next=/admin/categories`. This predates this feature
(same bug existed in the original `nginx.conf`) but must be fixed so the new
modal-based admin UI is actually reachable on the deployed test server.

Fix:
- `backend/config/urls.py`: change `path("admin/", admin.site.urls)` to
  `path("django-admin/", admin.site.urls)`.
- `frontend/Caddyfile`: remove the `handle /admin/* { reverse_proxy backend:8000 }`
  block entirely, and add `handle /django-admin/* { reverse_proxy backend:8000 }`
  in its place, so `/admin/*` now falls through to the SPA's catch-all
  `handle { ... try_files ... }` block (client-side React Router takes over),
  while Django's admin becomes reachable at `/django-admin/`.
- Any hardcoded links to `/admin/` meant for Django (if any exist, e.g. in
  README/deploy docs) should be updated to `/django-admin/` — grep for
  `django_admin`/`/admin/` references in docs before implementation.
- No change to `AdminGuard`/React Router — `/admin/*` already meant the React
  admin from the frontend's point of view; only the deploy-layer routing and
  Django's own mount point change.

## 4. Backend changes

### 4.1 Category list pagination truncation (bug, must fix first)

`backend/config/settings/base.py` sets global `PAGE_SIZE = 20`
(`PageNumberPagination`). `CategoryViewSet` (`backend/catalog/views.py`)
inherits it. Every frontend caller (`Home.jsx`, `CategoryProducts.jsx`,
`CategoriesManager.jsx`, `ProductsManager.jsx`) reads only
`response.data.results` from page 1. Once real subcategories exist, the tree
will silently exceed 20 rows and categories will vanish from menus/dropdowns
with no visible error.

Fix: give `CategoryViewSet` its own pagination class with a large page size
(200 — comfortably above any realistic taxonomy for this store), e.g.:

```python
# backend/catalog/pagination.py (new file)
from rest_framework.pagination import PageNumberPagination

class CategoryPagination(PageNumberPagination):
    page_size = 200
```

Set `CategoryViewSet.pagination_class = CategoryPagination`. Response shape
stays `{count, next, previous, results: [...]}` — no frontend call site needs
to change how it reads the response.

### 4.2 Cycle prevention

Nothing today stops staff from setting a category's parent to itself or to
one of its own descendants, which would create a cycle (infinite loop in any
ancestor-walk, and `on_delete=CASCADE` chaos). Because of the §3 routing bug,
`/admin/categories` (the React admin) has been unreachable on the deployed
test server — Django's raw admin at `/admin/` was, until now, the only thing
actually reachable there, so it must not be left unprotected. Put the check
on the **model**, so both admin surfaces share it:

- `Category.clean()` (`backend/catalog/models.py`):
  - Reject if `self.parent_id == self.pk` (self-parenting).
  - Reject if `self.parent` is a descendant of `self` — walk the `parent.parent`
    chain from `self.parent` upward; if `self.pk` appears, reject. Bound the
    walk (e.g. max 50 hops) so a pre-existing bad row can't hang the request.
  - `raise ValidationError("A category can't be nested under itself or one of its own subcategories.")`
- `CategorySerializer.validate()` (`backend/catalog/serializers.py`): build an
  unsaved instance with the incoming data (`Category(pk=self.instance.pk if self.instance else None, **attrs)`)
  and call `.clean()` on it, translating a `django.core.exceptions.ValidationError`
  into `rest_framework.serializers.ValidationError` — this is what the React
  admin (via the API) hits.
- Django's raw `CategoryAdmin` `ModelForm` already calls `full_clean()` (hence
  `Category.clean()`) automatically on save — no separate admin.py change
  needed, it inherits the protection for free once `clean()` exists on the
  model.

### 4.3 No model/migration changes

`Category.parent` already supports unlimited depth. No new fields, no new
migration.

## 5. Frontend: category tree utilities

New file `frontend/src/utils/categoryTree.js`, pure functions operating on
the flat category array already fetched by each page:

- `getAncestors(category, allCategories)` → array of ancestor categories,
  root-first (e.g. `[Fish, Betta]` for "Full Moon"). Bounded walk (same
  50-hop safety cap as the backend) to tolerate a corrupt/cyclic row without
  infinite-looping the UI.
- `getDepth(category, allCategories)` → `getAncestors(...).length`.
- `buildIndentedOptions(allCategories, { excludeIds = [] } = {})` → flat array
  of `{ id, label }` in depth-first tree order (parents immediately followed
  by their children, recursively), with `label` prefixed by
  `"　".repeat(depth)` (full-width space, renders visibly in a native
  `<select>` unlike regular spaces which collapse). Each id passed in
  `excludeIds` is removed from the output **along with all of its
  descendants** (the function expands the subtree internally — callers just
  pass the root id(s) to exclude, e.g. `[editingId]`) — used so editing "Fish"
  can't offer "Betta" (Fish's own child) as its new parent.

Unit tests: `frontend/src/utils/categoryTree.test.js` — ancestors for a
3-level chain, depth-first ordering, exclusion of a subtree, and a cycle
(corrupt data) not hanging.

## 6. Frontend: storefront breadcrumbs

`CategoryProducts.jsx`'s breadcrumb builder (currently ~lines 49-65) only
looks up one `parent` hop. Replace with `getAncestors(currentCategory, categories)`
mapped to `{ label: ancestor.name, to: '/category/${ancestor.slug}' }`,
followed by the current category as the final (non-link) crumb. Works
uniformly for any depth — 1 level (today's behavior, unchanged output) through
unlimited.

## 7. Reusable `Modal` component

New `frontend/src/components/admin/Modal.jsx` — no existing modal/dialog
component in the codebase. Props: `title`, `onClose`, `children`. Behavior:
- Fixed-position backdrop (dimmed) + centered panel.
- Click on backdrop closes; click inside panel does not (stop propagation).
- `Escape` key closes.
- Close (×) button in the header, calls `onClose`.
- No animation library needed (plain CSS/Tailwind), consistent with the rest
  of the admin (no framer-motion elsewhere in admin pages).

This one component is reused for both the create/edit form and the success
confirmation in all three managers below — a form modal is
`<Modal title="New Category" onClose={...}>{form}</Modal>`; a success popup is
`<Modal title="Success" onClose={...}><p>{message}</p><button>OK</button></Modal>`.

## 8. Admin managers: list + modal + success popup

Applies identically to `CategoriesManager.jsx`, `ProductsManager.jsx`, and
`VideosManager.jsx`. Each currently has the same shape: always-visible inline
`<form>` above a list/table, `resetForm`/`startEdit`/`handleSubmit`/
`handleDelete`. The restructuring is mechanical and identical across all
three:

- Add `isFormOpen` (boolean) and `successMessage` (string|null) state.
- Replace the permanently-rendered `<form>` with a **"+ New Category" /
  "+ New Product" / "+ New Video"** button above the table, which sets
  `isFormOpen = true` (with `resetForm()` first, so a stale edit doesn't leak
  into a fresh "New" form).
- `startEdit(item)` additionally sets `isFormOpen = true`.
- The form (same fields as today, no field changes except the category/parent
  `<select>` upgrade below) renders **inside** `<Modal>` only when
  `isFormOpen` is true. Cancel button (and backdrop/Escape/× close) sets
  `isFormOpen = false` and calls `resetForm()`.
- `formError` continues to render inside the modal, above the fields, exactly
  as it does inline today — no change to error handling/copy.
- On successful create/edit (the `try` branch of `handleSubmit`, after
  `resetForm(); load();`): additionally close the form (`isFormOpen = false`,
  already implied by `resetForm` if we fold that flag into `resetForm`) and
  set `successMessage` to `"Category created."` / `"Category updated."` (and
  the Product/Video equivalents).
- On successful delete (the `try` branch of `handleDelete`, after `load()`):
  set `successMessage` to `"Category deleted."` (and Product/Video
  equivalents). The existing `window.confirm(...)` before delete is unchanged.
- Render `{successMessage && <Modal title="Success" onClose={() => setSuccessMessage(null)}>...}`
  at the bottom of the component, alongside the form modal — only one of the
  two is ever open at a time in practice (form closes before success shows).
- Delete errors (`catch` branch of `handleDelete`) have no form modal open at
  that point — keep them as the existing inline `<p className="text-red-600">`
  banner on the list page (no change from today's behavior/placement).

### 8.1 Categories-specific

- `CategoriesManager` tracks the category being edited by `editingSlug`, not
  its id — resolve the id first (`categories.find((c) => c.slug === editingSlug)?.id`)
  and pass it to `buildIndentedOptions(categories, { excludeIds: editingId ? [editingId] : [] })`
  from §5 for the parent `<select>`, replacing the current flat `categories.map(...)`.
- Table's "Parent" column shows the full path (e.g. "Fish > Cichlid") via
  `getAncestors` + current name joined with `" > "`, instead of just the
  immediate parent's name.

### 8.2 Products-specific

- Category `<select>` gets the same `buildIndentedOptions` treatment (no
  exclusion needed — a product's category has no descendant-of-itself
  concern).
- Per-row image upload/delete UI (file input + thumbnails in the table) is
  **unchanged** — stays inline in the table row, not moved into the modal, and
  does not trigger a success popup (out of scope; only the product entity's
  own create/edit/delete gets the popup, per the request).
- The existing 409 stock-conflict flow (`window.confirm` to add stock to an
  existing product) is unaffected by the modal wrapping — the `window.confirm`
  still layers on top of the open modal. On successful add-stock via that
  path, also close the modal and show `successMessage = "Stock added."` for
  consistency with the rest of this feature (currently that path just calls
  `resetForm(); load();` with no feedback at all).

### 8.3 Videos-specific

- No category-like field — no picker changes needed, just the
  list/modal/success-popup restructuring.

## 9. Out of scope

- No changes to `Header.jsx`'s hardcoded top-level nav links.
- No changes to `ProductViewSet` category filtering (parent pages stay
  drill-down-only, per §2).
- No changes to `OrdersManager.jsx` / `OrderDetailManager.jsx` /
  `InquiriesManager.jsx` — modal pattern not requested for these.
- No new animation library; `Modal` is plain CSS.

## 10. Testing

Backend (`backend/catalog/tests/`):
- `test_views.py`: category list response includes >20 categories once
  seeded with a deep tree (pagination fix).
- `test_models.py`: `Category.clean()` rejects self-parenting and
  descendant-parenting, accepts a valid re-parent to an unrelated existing
  category.
- `test_serializers.py` (new, or add to `test_views.py`): `CategorySerializer`
  surfaces the same `clean()` rejection as a DRF `ValidationError` (400
  response), so the React admin gets a proper error instead of a 500.

Frontend:
- `frontend/src/utils/categoryTree.test.js` (new) — per §5.
- Update/extend `ProductsManager.test.jsx` for the modal flow (open via
  button, submit inside modal, success popup appears and dismisses, edit
  pre-fills modal). `CategoriesManager.test.jsx` and `VideosManager.test.jsx`
  don't exist yet (confirmed) — add them from scratch, covering the same
  modal-flow cases as `ProductsManager.test.jsx`.
- Manual verification in the dev server: create a 3-level category chain via
  the admin modal (Fish > Cichlid > "Full Moon"), assign a product to the
  leaf, verify storefront breadcrumb shows all three levels, verify the
  Products admin category dropdown shows it indented under Fish > Cichlid.
