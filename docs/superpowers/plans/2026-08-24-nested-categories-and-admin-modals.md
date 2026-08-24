# Multi-Level Categories + List/Modal Admin Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff nest categories to any depth (e.g. Fish > Cichlid > "Full Moon"), fix the gaps that only support one level today (cycle prevention, category-list pagination truncation, storefront breadcrumbs), fix a routing bug that currently makes the React admin unreachable on the deployed test server, and convert the Categories/Products/Videos admin pages from an always-visible inline form to a list + "New" button + modal + success-popup pattern.

**Architecture:** Backend: add cycle-prevention to `Category.clean()` (shared by the DRF serializer and Django's raw admin), give `CategoryViewSet` a larger pagination page size, and move Django's raw admin off `/admin/` so it stops colliding with the React SPA's own `/admin/*` routes. Frontend: one new pure-function utility (`categoryTree.js`) computes ancestor chains and indented dropdown options from the flat category list every page already fetches — no API shape changes. One new reusable `Modal` component is shared by all three admin managers, which get mechanically restructured from inline-form-above-list to button-opens-modal, with a success popup after create/edit/delete.

**Tech Stack:** Django 4/DRF (backend), React + Vite + Tailwind (frontend), Vitest + Testing Library (frontend tests), Django `TestCase`/DRF `APITestCase` (backend tests), Docker Compose + Caddy (deployment).

**Spec:** `docs/superpowers/specs/2026-08-24-nested-categories-and-admin-modals-design.md`

## Global Constraints

- Unlimited category nesting depth — no depth cap anywhere.
- Category API response shape is unchanged (`{count, next, previous, results: [...]}`) — no frontend caller's `response.data.results` access changes.
- Parent category pages show subcategory tiles only, never a combined product listing from descendants — no `ProductViewSet` filtering changes.
- Admin parent/category pickers are an indented flat `<select>` (not a tree widget).
- Success feedback after create/edit/delete is a popup (the same `Modal` component as the form), not a toast.
- No new frontend dependency/animation library — `Modal` is plain CSS/Tailwind.
- Backend tests run with `python manage.py test catalog` from `backend/` (settings default to `config.settings.dev` per `manage.py`). Frontend tests run with `npx vitest run <path>` from `frontend/` (no `npm test` script exists yet — don't add one, just call vitest directly).

---

## Task 1: `Category.clean()` cycle prevention

**Files:**
- Modify: `backend/catalog/models.py`
- Test: `backend/catalog/tests/test_models.py`

**Interfaces:**
- Produces: `Category.clean()` — raises `django.core.exceptions.ValidationError` if `self.parent` is `self` or a descendant of `self`; no-op otherwise (including on create, where `self.pk` is `None`). Task 2's `CategorySerializer.validate()` calls this.

- [ ] **Step 1: Write the failing tests**

Add to `backend/catalog/tests/test_models.py`, inside `class CategoryModelTests(TestCase):` (after the existing `test_supports_subcategories` method), and add the import at the top of the file:

```python
from django.core.exceptions import ValidationError
```

(goes next to the existing `from django.db import IntegrityError, transaction` import line at the top of the file)

```python
    def test_clean_allows_a_normal_top_level_category(self):
        category = Category.objects.create(name="Fish", slug="fish")
        category.clean()  # must not raise

    def test_clean_allows_a_normal_subcategory(self):
        parent = Category.objects.create(name="Fish", slug="fish")
        child = Category(name="Cichlid", slug="cichlid", parent=parent)
        child.clean()  # must not raise (create — no pk yet)

    def test_clean_rejects_self_parenting(self):
        category = Category.objects.create(name="Fish", slug="fish")
        category.parent = category

        with self.assertRaises(ValidationError):
            category.clean()

    def test_clean_rejects_parenting_to_a_direct_child(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        cichlid = Category.objects.create(name="Cichlid", slug="cichlid", parent=fish)
        fish.parent = cichlid

        with self.assertRaises(ValidationError):
            fish.clean()

    def test_clean_rejects_parenting_to_a_deeper_descendant(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        cichlid = Category.objects.create(name="Cichlid", slug="cichlid", parent=fish)
        full_moon = Category.objects.create(name="Full Moon", slug="full-moon", parent=cichlid)
        fish.parent = full_moon

        with self.assertRaises(ValidationError):
            fish.clean()

    def test_clean_allows_reparenting_to_an_unrelated_category(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        plants = Category.objects.create(name="Plants", slug="plants")
        cichlid = Category.objects.create(name="Cichlid", slug="cichlid", parent=fish)
        cichlid.parent = plants

        cichlid.clean()  # must not raise
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test catalog.tests.test_models.CategoryModelTests -v 2`
Expected: the three "rejects" tests FAIL with `AssertionError: ValidationError not raised` (the two "allows" tests already pass, since the base `Model.clean()` is a no-op today — that's fine, they're here to pin down the no-op behavior stays correct once real logic is added).

- [ ] **Step 3: Implement `Category.clean()`**

In `backend/catalog/models.py`, add the import at the top:

```python
from django.core.exceptions import ValidationError
from django.db import models
```

Add the method to `Category` (after `__str__`, so the class reads: fields, `Meta`, `__str__`, `clean`):

```python
    def clean(self):
        super().clean()
        if self.parent_id is None:
            return
        if self.pk is not None and self.parent_id == self.pk:
            raise ValidationError("A category can't be nested under itself or one of its own subcategories.")
        ancestor = self.parent
        hops = 0
        while ancestor is not None and hops < 50:
            if self.pk is not None and ancestor.pk == self.pk:
                raise ValidationError("A category can't be nested under itself or one of its own subcategories.")
            ancestor = ancestor.parent
            hops += 1
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python manage.py test catalog.tests.test_models.CategoryModelTests -v 2`
Expected: PASS (all `CategoryModelTests`, including the two pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add backend/catalog/models.py backend/catalog/tests/test_models.py
git commit -m "feat(catalog): reject cyclic category parenting in Category.clean()"
```

---

## Task 2: Category API — cycle validation + pagination fix

**Files:**
- Create: `backend/catalog/pagination.py`
- Modify: `backend/catalog/serializers.py`, `backend/catalog/views.py`
- Test: `backend/catalog/tests/test_views.py`

**Interfaces:**
- Consumes: `Category.clean()` from Task 1.
- Produces: `CategoryPagination` (page_size 200) used by `CategoryViewSet`; `CategorySerializer.validate()` returns a DRF 400 with a `parent` error key when a write would create a cycle.

- [ ] **Step 1: Write the failing tests**

Add to `backend/catalog/tests/test_views.py` (new classes, after `class CategoryWritePermissionTests`):

```python
class CategoryCyclePreventionAPITests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="cycle-staff", password="pw12345", is_staff=True)
        self.client.force_authenticate(user=self.staff)

    def test_rejects_setting_parent_to_a_descendant(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        cichlid = Category.objects.create(name="Cichlid", slug="cichlid", parent=fish)

        response = self.client.patch(f"/api/v1/categories/{fish.slug}/", {"parent": cichlid.id})

        self.assertEqual(response.status_code, 400)
        fish.refresh_from_db()
        self.assertIsNone(fish.parent)

    def test_rejects_self_parenting(self):
        fish = Category.objects.create(name="Fish", slug="fish")

        response = self.client.patch(f"/api/v1/categories/{fish.slug}/", {"parent": fish.id})

        self.assertEqual(response.status_code, 400)

    def test_allows_reparenting_to_an_unrelated_category(self):
        fish = Category.objects.create(name="Fish", slug="fish")
        plants = Category.objects.create(name="Plants", slug="plants")
        cichlid = Category.objects.create(name="Cichlid", slug="cichlid", parent=fish)

        response = self.client.patch(f"/api/v1/categories/{cichlid.slug}/", {"parent": plants.id})

        self.assertEqual(response.status_code, 200)
        cichlid.refresh_from_db()
        self.assertEqual(cichlid.parent_id, plants.id)

    def test_allows_creating_a_normal_subcategory(self):
        fish = Category.objects.create(name="Fish", slug="fish")

        response = self.client.post(
            "/api/v1/categories/", {"name": "Cichlid", "slug": "cichlid", "parent": fish.id}
        )

        self.assertEqual(response.status_code, 201)


class CategoryPaginationTests(APITestCase):
    def test_category_list_is_not_truncated_past_the_default_page_size(self):
        for i in range(25):
            Category.objects.create(name=f"Category {i}", slug=f"category-{i}")

        response = self.client.get("/api/v1/categories/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 25)
        self.assertEqual(len(data["results"]), 25)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python manage.py test catalog.tests.test_views.CategoryCyclePreventionAPITests catalog.tests.test_views.CategoryPaginationTests -v 2`
Expected: `test_rejects_setting_parent_to_a_descendant` and `test_rejects_self_parenting` FAIL (return 200/201 instead of 400 — no validation exists yet); `test_category_list_is_not_truncated_past_the_default_page_size` FAILS (`len(results)` is 20, not 25); `test_allows_reparenting_to_an_unrelated_category` and `test_allows_creating_a_normal_subcategory` already PASS.

- [ ] **Step 3: Implement the pagination class and wire it up**

Create `backend/catalog/pagination.py`:

```python
from rest_framework.pagination import PageNumberPagination


class CategoryPagination(PageNumberPagination):
    page_size = 200
```

In `backend/catalog/views.py`, add the import and set the class:

```python
from .pagination import CategoryPagination
```

```python
class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]
    pagination_class = CategoryPagination
    lookup_field = "slug"
```

- [ ] **Step 4: Implement `CategorySerializer.validate()`**

In `backend/catalog/serializers.py`, add the import and the method:

```python
from django.core.exceptions import ValidationError as DjangoValidationError
```

```python
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "image", "banner_image", "description", "order"]

    def validate(self, attrs):
        instance = Category(pk=self.instance.pk if self.instance else None)
        for field, value in attrs.items():
            setattr(instance, field, value)
        try:
            instance.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"parent": exc.messages})
        return attrs
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python manage.py test catalog -v 2`
Expected: PASS (full `catalog` app suite — this also re-confirms nothing else in `test_views.py`/`test_models.py` regressed).

- [ ] **Step 6: Commit**

```bash
git add backend/catalog/pagination.py backend/catalog/serializers.py backend/catalog/views.py backend/catalog/tests/test_views.py
git commit -m "feat(catalog): validate category writes against cycles, stop paginating category list at 20"
```

---

## Task 3: Fix the `/admin` routing collision

**Files:**
- Modify: `backend/config/urls.py`, `frontend/Caddyfile`, `README.md`, `AWS_FREE_TIER_TEST_DEPLOY.md`

**Interfaces:**
- Produces: Django's raw admin moves to `/django-admin/`; `/admin/*` now falls through Caddy to the React SPA in the deployed environment.

No automated test — this is routing/deploy configuration. Verified manually in Task 10 (deployment).

- [ ] **Step 1: Move Django's admin mount point**

In `backend/config/urls.py`, change:

```python
    path("admin/", admin.site.urls),
```

to:

```python
    path("django-admin/", admin.site.urls),
```

- [ ] **Step 2: Update the Caddyfile**

In `frontend/Caddyfile`, replace:

```
	handle /admin/* {
		reverse_proxy backend:8000
	}
```

with:

```
	handle /django-admin/* {
		reverse_proxy backend:8000
	}
```

(Leave every other `handle` block — `/static/*`, `/media/*`, `/api/*`, and the catch-all SPA fallback — untouched. Removing the `/admin/*` block means those requests now fall through to the catch-all `handle { ... try_files ... }` block, which serves the SPA and lets React Router's `/admin/*` route take over client-side.)

- [ ] **Step 3: Update the two docs that describe the old `/admin/` path**

In `README.md`, change line 83 from:

```
Backend runs at `http://localhost:8000` — API base: `http://localhost:8000/api/v1/`, Django admin at `/admin/`.
```

to:

```
Backend runs at `http://localhost:8000` — API base: `http://localhost:8000/api/v1/`, Django admin at `/django-admin/`.
```

In `AWS_FREE_TIER_TEST_DEPLOY.md`, change line 19 from:

```
                    │   proxies /api/, /admin/, /static/, /media/)
```

to:

```
                    │   proxies /api/, /django-admin/, /static/, /media/;
                    │   /admin/ falls through to the React SPA)
```

And change line 184 from:

```
  routing (`/static/`, `/media/`, `/api/`, `/admin/` proxied to `backend:8000`
```

to:

```
  routing (`/static/`, `/media/`, `/api/`, `/django-admin/` proxied to
  `backend:8000`; `/admin/` now falls through to the SPA catch-all instead
```

(Leave line 145-146, "Visit `http://<EC2_PUBLIC_IP>/admin/`", as-is — after this fix, `/admin/` on the deployed site correctly means the store's own React admin panel, which is what that line has always meant to describe.)

- [ ] **Step 4: Commit**

```bash
git add backend/config/urls.py frontend/Caddyfile README.md AWS_FREE_TIER_TEST_DEPLOY.md
git commit -m "fix(deploy): move Django admin to /django-admin/, stop it shadowing the React admin at /admin/"
```

---

## Task 4: `categoryTree.js` utility

**Files:**
- Create: `frontend/src/utils/categoryTree.js`
- Test: `frontend/src/utils/categoryTree.test.js`

**Interfaces:**
- Produces:
  - `getAncestors(category, allCategories) => Category[]` — root-first array of ancestors, `[]` if top-level or `category` is falsy.
  - `getDepth(category, allCategories) => number` — `0` for top-level.
  - `buildIndentedOptions(allCategories, { excludeIds = [] } = {}) => { id, label }[]` — depth-first tree order, `label` prefixed with `"　".repeat(depth)`; each id in `excludeIds` is removed along with its whole subtree.
- Consumed by: Task 5 (breadcrumbs), Task 7 (`CategoriesManager`), Task 8 (`ProductsManager`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/categoryTree.test.js`:

```js
import { describe, expect, it } from "vitest";

import { buildIndentedOptions, getAncestors, getDepth } from "./categoryTree";

const FISH = { id: 1, name: "Fish", slug: "fish", parent: null };
const CICHLID = { id: 2, name: "Cichlid", slug: "cichlid", parent: 1 };
const FULL_MOON = { id: 3, name: "Full Moon", slug: "full-moon", parent: 2 };
const PLANTS = { id: 4, name: "Plants", slug: "plants", parent: null };
const CATEGORIES = [FISH, CICHLID, FULL_MOON, PLANTS];

describe("getAncestors", () => {
  it("returns an empty array for a top-level category", () => {
    expect(getAncestors(FISH, CATEGORIES)).toEqual([]);
  });

  it("returns root-first ancestors for a 3-level chain", () => {
    expect(getAncestors(FULL_MOON, CATEGORIES)).toEqual([FISH, CICHLID]);
  });

  it("returns an empty array for a null/undefined category", () => {
    expect(getAncestors(null, CATEGORIES)).toEqual([]);
  });

  it("does not hang on a cyclic parent chain", () => {
    const a = { id: 10, name: "A", parent: 11 };
    const b = { id: 11, name: "B", parent: 10 };
    const result = getAncestors(a, [a, b]);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getDepth", () => {
  it("is 0 for a top-level category", () => {
    expect(getDepth(FISH, CATEGORIES)).toBe(0);
  });

  it("is 2 for a 3rd-level category", () => {
    expect(getDepth(FULL_MOON, CATEGORIES)).toBe(2);
  });
});

describe("buildIndentedOptions", () => {
  it("orders categories depth-first, parents immediately before their children", () => {
    const options = buildIndentedOptions(CATEGORIES);
    expect(options.map((option) => option.id)).toEqual([1, 2, 3, 4]);
  });

  it("indents child labels with full-width spaces proportional to depth", () => {
    const options = buildIndentedOptions(CATEGORIES);
    expect(options.find((option) => option.id === 1).label).toBe("Fish");
    expect(options.find((option) => option.id === 2).label).toBe("　Cichlid");
    expect(options.find((option) => option.id === 3).label).toBe("　　Full Moon");
  });

  it("excludes a given id and its whole subtree", () => {
    const options = buildIndentedOptions(CATEGORIES, { excludeIds: [1] });
    expect(options.map((option) => option.id)).toEqual([4]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run src/utils/categoryTree.test.js`
Expected: FAIL — `categoryTree.js` doesn't exist yet (`Cannot find module './categoryTree'`).

- [ ] **Step 3: Implement `categoryTree.js`**

Create `frontend/src/utils/categoryTree.js`:

```js
const MAX_DEPTH = 50;

export function getAncestors(category, allCategories) {
  if (!category) return [];
  const ancestors = [];
  let current = category;
  let hops = 0;
  while (current?.parent != null && hops < MAX_DEPTH) {
    const parent = allCategories.find((candidate) => candidate.id === current.parent);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
    hops += 1;
  }
  return ancestors;
}

export function getDepth(category, allCategories) {
  return getAncestors(category, allCategories).length;
}

export function buildIndentedOptions(allCategories, { excludeIds = [] } = {}) {
  const excluded = new Set();
  const addWithDescendants = (id) => {
    if (excluded.has(id)) return;
    excluded.add(id);
    allCategories
      .filter((category) => category.parent === id)
      .forEach((child) => addWithDescendants(child.id));
  };
  excludeIds.forEach(addWithDescendants);

  const visible = allCategories.filter((category) => !excluded.has(category.id));
  const byParent = new Map();
  visible.forEach((category) => {
    const key = category.parent ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(category);
  });

  const options = [];
  const walk = (parentId, depth) => {
    const children = byParent.get(parentId) || [];
    children.forEach((category) => {
      options.push({ id: category.id, label: "　".repeat(depth) + category.name });
      walk(category.id, depth + 1);
    });
  };
  walk(null, 0);
  return options;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/categoryTree.test.js`
Expected: PASS (all cases in Step 1, using the corrected cyclic-chain test body).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/categoryTree.js frontend/src/utils/categoryTree.test.js
git commit -m "feat(frontend): add categoryTree utility for ancestor walks and indented pickers"
```

---

## Task 5: Storefront breadcrumbs — walk the full ancestor chain

**Files:**
- Modify: `frontend/src/pages/public/CategoryProducts.jsx`

**Interfaces:**
- Consumes: `getAncestors` from Task 4.

No automated test exists for this file today (confirmed — no `CategoryProducts.test.jsx`); verified manually per Task 10's checklist, matching the spec's testing scope.

- [ ] **Step 1: Replace the one-hop breadcrumb builder**

In `frontend/src/pages/public/CategoryProducts.jsx`, add the import:

```js
import { getAncestors } from "../../utils/categoryTree";
```

Replace the `breadcrumbItems` memo (currently lines 49-65):

```js
  const breadcrumbItems = useMemo(() => {
    if (!slug) {
      // Generic /products page: just "Home > Products".
      return [{ label: title }];
    }
    const currentCategory = categories.find((category) => category.slug === slug);
    if (!currentCategory) return [{ label: title }];
    const ancestorCrumbs = getAncestors(currentCategory, categories).map((ancestor) => ({
      label: ancestor.name,
      to: `/category/${ancestor.slug}`,
    }));
    return [...ancestorCrumbs, { label: currentCategory.name }];
  }, [categories, slug, title]);
```

- [ ] **Step 2: Manually verify in the dev server**

Start the backend (`python manage.py runserver` from `backend/`) and frontend (`npm run dev` from `frontend/`). In the Django admin (now at `/django-admin/` per Task 3) or via the React admin, create: "Fish" (top-level) → "Cichlid" (parent: Fish) → "Full Moon" (parent: Cichlid). Visit `/category/full-moon` in the browser and confirm the breadcrumb reads `Home / Fish / Cichlid / Full Moon` with "Fish" and "Cichlid" as working links back to their own category pages, and confirm a 1-level category (e.g. an existing "Discus" under "Fish") still shows the pre-existing `Home / Fish / Discus` correctly (no regression for the depth that worked before).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/public/CategoryProducts.jsx
git commit -m "fix(storefront): walk the full ancestor chain for category breadcrumbs"
```

---

## Task 6: Reusable `Modal` component

**Files:**
- Create: `frontend/src/components/admin/Modal.jsx`
- Test: `frontend/src/components/admin/Modal.test.jsx`

**Interfaces:**
- Produces: `<Modal title={string} onClose={() => void}>{children}</Modal>` — default export. Consumed by Tasks 7, 8, 9.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/admin/Modal.test.jsx`:

```jsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "./Modal";

describe("Modal", () => {
  afterEach(() => cleanup());

  it("renders the title and children", () => {
    render(
      <Modal title="New Category" onClose={() => {}}>
        <p>form goes here</p>
      </Modal>
    );
    expect(screen.getByText("New Category")).toBeTruthy();
    expect(screen.getByText("form goes here")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal title="New Category" onClose={onClose}>
        <p>content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/admin/Modal.test.jsx`
Expected: FAIL — `Modal.jsx` doesn't exist yet.

- [ ] **Step 3: Implement `Modal.jsx`**

Create `frontend/src/components/admin/Modal.jsx`:

```jsx
import { useEffect } from "react";

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-800 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/admin/Modal.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/Modal.jsx frontend/src/components/admin/Modal.test.jsx
git commit -m "feat(admin): add reusable Modal component"
```

---

## Task 7: `CategoriesManager` — list + modal + success popup + indented parent picker

**Files:**
- Modify: `frontend/src/pages/admin/CategoriesManager.jsx`
- Test: `frontend/src/pages/admin/CategoriesManager.test.jsx` (new — none exists today, confirmed)

**Interfaces:**
- Consumes: `Modal` (Task 6), `getAncestors`/`buildIndentedOptions` (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/admin/CategoriesManager.test.jsx`:

```jsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import CategoriesManager from "./CategoriesManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const FISH = { id: 1, name: "Fish", slug: "fish", parent: null };
const CICHLID = { id: 2, name: "Cichlid", slug: "cichlid", parent: 1 };

function mockInitialLoad(categories = [FISH, CICHLID]) {
  apiClient.get.mockImplementation((url) => {
    if (url === "/categories/") return Promise.resolve({ data: { results: categories } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("CategoriesManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("shows the list without a form until 'New Category' is clicked", async () => {
    render(<CategoriesManager />);
    expect(await screen.findByText("Fish")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /new category/i }));

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
  });

  it("creates a category and shows a success popup", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<CategoriesManager />);
    await screen.findByText("Fish");

    fireEvent.click(screen.getByRole("button", { name: /new category/i }));
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Plants" } });
    fireEvent.change(screen.getByPlaceholderText("Slug"), { target: { value: "plants" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(await screen.findByText(/category created/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("pre-fills the modal when editing, with an indented parent dropdown", async () => {
    render(<CategoriesManager />);
    await screen.findByText("Fish");

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    fireEvent.click(editButtons[1]); // Cichlid row

    expect(screen.getByDisplayValue("Cichlid")).toBeTruthy();
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Fish");
  });

  it("shows a success popup after deleting", async () => {
    apiClient.delete.mockResolvedValueOnce({ data: {} });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CategoriesManager />);
    await screen.findByText("Fish");

    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalled());
    expect(await screen.findByText(/category deleted/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/admin/CategoriesManager.test.jsx`
Expected: FAIL — the form is currently always visible (no "New Category" button exists), so the first assertion (`screen.queryByPlaceholderText("Name")).toBeNull()`) fails, and none of the success-popup text exists yet.

- [ ] **Step 3: Rewrite `CategoriesManager.jsx`**

Replace the full contents of `frontend/src/pages/admin/CategoriesManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";
import Modal from "../../components/admin/Modal";
import { buildIndentedOptions, getAncestors } from "../../utils/categoryTree";

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", parent: "" });
  const [imageFile, setImageFile] = useState(null);
  const [bannerImageFile, setBannerImageFile] = useState(null);
  const [editingSlug, setEditingSlug] = useState(null);
  const [formError, setFormError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const load = () =>
    apiClient
      .get("/categories/")
      .then((response) => {
        setCategories(response.data.results);
        setCategoriesError(false);
      })
      .catch(() => setCategoriesError(true));

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ name: "", slug: "", parent: "" });
    setImageFile(null);
    setBannerImageFile(null);
    setEditingSlug(null);
    setFormError("");
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (category) => {
    setForm({
      name: category.name,
      slug: category.slug,
      parent: category.parent ? String(category.parent) : "",
    });
    setImageFile(null);
    setBannerImageFile(null);
    setEditingSlug(category.slug);
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append("name", form.name);
    body.append("slug", form.slug);
    if (form.parent) body.append("parent", form.parent);
    if (imageFile) body.append("image", imageFile);
    if (bannerImageFile) body.append("banner_image", bannerImageFile);

    const wasEditing = Boolean(editingSlug);
    try {
      if (editingSlug) {
        await apiClient.patch(`/categories/${editingSlug}/`, body);
      } else {
        await apiClient.post("/categories/", body);
      }
      closeForm();
      load();
      setSuccessMessage(wasEditing ? "Category updated." : "Category created.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't save the category — please check the fields and try again."));
    }
  };

  const handleDelete = async (slug) => {
    if (!window.confirm("Delete this category? This also deletes any subcategories and products under it.")) {
      return;
    }
    try {
      await apiClient.delete(`/categories/${slug}/`);
      setFormError("");
      load();
      setSuccessMessage("Category deleted.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the category — please try again."));
    }
  };

  const editingCategory = categories.find((category) => category.slug === editingSlug);
  const parentOptions = buildIndentedOptions(categories, {
    excludeIds: editingCategory ? [editingCategory.id] : [],
  });

  const pathFor = (category) => {
    const ancestors = getAncestors(category, categories);
    return [...ancestors, category].map((entry) => entry.name).join(" > ");
  };

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Categories</h1>
        <button
          type="button"
          onClick={openNewForm}
          className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
        >
          + New Category
        </button>
      </div>
      {categoriesError && (
        <p className="text-red-600 mb-4">Couldn't load categories — please try again later.</p>
      )}
      <table className="w-full text-left">
        <thead>
          <tr><th>Image</th><th>Name</th><th>Slug</th><th>Parent</th><th></th></tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className="border-t">
              <td>
                {category.image && (
                  <img src={category.image} alt={category.name} className="w-10 h-10 object-cover rounded" />
                )}
              </td>
              <td>{category.name}</td>
              <td>{category.slug}</td>
              <td>{category.parent ? pathFor(categories.find((c) => c.id === category.parent)) : "—"}</td>
              <td className="flex gap-2">
                <button onClick={() => startEdit(category)} className="text-blue-600">Edit</button>
                <button onClick={() => handleDelete(category.slug)} className="text-red-600">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isFormOpen && (
        <Modal title={editingSlug ? "Edit Category" : "New Category"} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              required
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              required
              placeholder="Slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <select
              value={form.parent}
              onChange={(e) => setForm({ ...form, parent: e.target.value })}
              className="border rounded px-3 py-2"
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <label className="flex flex-col text-sm text-gray-600">
              Image (grid tile thumbnail)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files[0] || null)}
                className="border rounded px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm text-gray-600">
              Banner image (shown on the category&apos;s own page)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBannerImageFile(e.target.files[0] || null)}
                className="border rounded px-3 py-2"
              />
            </label>
            {formError && <p className="text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
                {editingSlug ? "Save Changes" : "Add"}
              </button>
              <button type="button" onClick={closeForm} className="border rounded px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {successMessage && (
        <Modal title="Success" onClose={() => setSuccessMessage(null)}>
          <p className="mb-4">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
          >
            OK
          </button>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/admin/CategoriesManager.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/CategoriesManager.jsx frontend/src/pages/admin/CategoriesManager.test.jsx
git commit -m "feat(admin): convert CategoriesManager to list+modal+success-popup, indented parent picker"
```

---

## Task 8: `ProductsManager` — list + modal + success popup + indented category picker

**Files:**
- Modify: `frontend/src/pages/admin/ProductsManager.jsx`, `frontend/src/pages/admin/ProductsManager.test.jsx`

**Interfaces:**
- Consumes: `Modal` (Task 6), `buildIndentedOptions` (Task 4).

- [ ] **Step 1: Update the existing tests for the modal flow**

The existing tests in `frontend/src/pages/admin/ProductsManager.test.jsx` call `render(<ProductsManager />)` and then immediately interact with the form (e.g. `screen.getByPlaceholderText("Name")`), which will break once the form is hidden inside a closed modal by default. Replace the whole file:

```jsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import ProductsManager from "./ProductsManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CATEGORY = { id: 1, name: "Fish", parent: null };

function mockInitialLoad() {
  apiClient.get.mockImplementation((url) => {
    if (url === "/products/") return Promise.resolve({ data: { results: [] } });
    if (url === "/categories/") return Promise.resolve({ data: { results: [CATEGORY] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /new product/i }));
  await screen.findByRole("combobox");
}

async function fillAndSubmit({ name = "Discus", slug = "discus", price = "100", stock = "10" } = {}) {
  await openForm();
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("Slug"), { target: { value: slug } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: String(CATEGORY.id) } });
  fireEvent.change(screen.getByPlaceholderText("Price"), { target: { value: price } });
  fireEvent.change(screen.getByPlaceholderText("Stock quantity"), { target: { value: stock } });
  fireEvent.click(screen.getByRole("button", { name: /add product/i }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
}

describe("ProductsManager — list + modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("shows the list without a form until 'New Product' is clicked", async () => {
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });
    expect(screen.queryByPlaceholderText("Name")).toBeNull();

    await openForm();

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
  });

  it("creates a product and shows a success popup", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });

    await fillAndSubmit();

    expect(await screen.findByText(/product created/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });
});

describe("ProductsManager — duplicate-product restock flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("creates a product normally when there is no name/category conflict", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });

    await fillAndSubmit();

    expect(apiClient.post).toHaveBeenCalledWith(
      "/products/",
      expect.objectContaining({ name: "Discus", slug: "discus", stock_quantity: 10 })
    );
  });

  it("shows a confirm dialog on a 409 and restocks the existing product when confirmed", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      if (url === `/products/${existing.slug}/add-stock/`) {
        return Promise.resolve({ data: { ...existing, stock_quantity: 15 } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });
    await fillAndSubmit({ stock: "10" });

    expect(confirmSpy).toHaveBeenCalledWith(
      'A product named "Discus" already exists in Fish with 5 in stock. Add 10 more to make 15?'
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(`/products/${existing.slug}/add-stock/`, { quantity: 10 })
    );
    expect(await screen.findByText(/stock added/i)).toBeTruthy();
  });

  it("does nothing further when the duplicate confirm is cancelled", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });
    await fillAndSubmit({ stock: "10" });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText("Name").value).toBe("Discus");
  });

  it("shows an error if the add-stock call itself fails after confirming", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      if (url === `/products/${existing.slug}/add-stock/`) {
        return Promise.reject({ response: { data: { detail: "Something went wrong." } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });
    await fillAndSubmit({ stock: "10" });

    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
  });

  it("shows a clear error without prompting when the entered quantity is not positive", async () => {
    const existing = { slug: "discus", name: "Discus", category_name: "Fish", stock_quantity: 5 };
    apiClient.post.mockImplementation((url) => {
      if (url === "/products/") {
        return Promise.reject({ response: { status: 409, data: { existing_product: existing } } });
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const confirmSpy = vi.spyOn(window, "confirm");

    render(<ProductsManager />);
    await screen.findByRole("button", { name: /new product/i });
    await fillAndSubmit({ stock: "0" });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        'A product named "Discus" already exists in Fish. Enter a positive stock quantity to add to its existing 5 in stock.'
      )
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/admin/ProductsManager.test.jsx`
Expected: FAIL — there is no "New Product" button yet, so `screen.getByRole("button", { name: /new product/i })` throws.

- [ ] **Step 3: Rewrite `ProductsManager.jsx`**

Replace the full contents of `frontend/src/pages/admin/ProductsManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";
import Modal from "../../components/admin/Modal";
import { buildIndentedOptions } from "../../utils/categoryTree";

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    category: "",
    price: "",
    description: "",
    stock_quantity: 0,
    is_featured: false,
  });
  const [editingSlug, setEditingSlug] = useState(null);
  const [formError, setFormError] = useState("");
  const [uploadingFor, setUploadingFor] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const load = () =>
    apiClient
      .get("/products/")
      .then((response) => {
        setProducts(response.data.results);
        setProductsError(false);
      })
      .catch(() => setProductsError(true));

  useEffect(() => {
    load();
    apiClient
      .get("/categories/")
      .then((response) => {
        setCategories(response.data.results);
        setCategoriesError(false);
      })
      .catch(() => setCategoriesError(true));
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      slug: "",
      category: "",
      price: "",
      description: "",
      stock_quantity: 0,
      is_featured: false,
    });
    setEditingSlug(null);
    setFormError("");
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (product) => {
    setForm({
      name: product.name,
      slug: product.slug,
      category: product.category ? String(product.category) : "",
      price: String(product.price),
      description: product.description || "",
      stock_quantity: product.stock_quantity,
      is_featured: product.is_featured,
    });
    setEditingSlug(product.slug);
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      category: Number(form.category),
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
    };
    const wasEditing = Boolean(editingSlug);
    try {
      if (editingSlug) {
        await apiClient.patch(`/products/${editingSlug}/`, payload);
      } else {
        await apiClient.post("/products/", payload);
      }
      closeForm();
      load();
      setSuccessMessage(wasEditing ? "Product updated." : "Product created.");
    } catch (error) {
      if (!editingSlug && error.response?.status === 409) {
        const existing = error.response.data.existing_product;
        const enteredQuantity = payload.stock_quantity;
        if (enteredQuantity <= 0) {
          setFormError(
            `A product named "${existing.name}" already exists in ${existing.category_name}. Enter a positive stock quantity to add to its existing ${existing.stock_quantity} in stock.`
          );
          return;
        }
        const confirmed = window.confirm(
          `A product named "${existing.name}" already exists in ${existing.category_name} with ${existing.stock_quantity} in stock. Add ${enteredQuantity} more to make ${existing.stock_quantity + enteredQuantity}?`
        );
        if (confirmed) {
          try {
            await apiClient.post(`/products/${existing.slug}/add-stock/`, { quantity: enteredQuantity });
            closeForm();
            load();
            setSuccessMessage("Stock added.");
          } catch (addStockError) {
            setFormError(describeError(addStockError, "Couldn't add stock to the existing product — please try again."));
          }
        }
        return;
      }
      setFormError(describeError(error, "Couldn't save the product — please check the fields and try again."));
    }
  };

  const handleDelete = async (slug) => {
    if (!window.confirm("Delete this product?")) {
      return;
    }
    try {
      await apiClient.delete(`/products/${slug}/`);
      setFormError("");
      load();
      setSuccessMessage("Product deleted.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the product — please try again."));
    }
  };

  const handleImageUpload = async (productId, file) => {
    const body = new FormData();
    body.append("product", productId);
    body.append("image", file);
    setUploadingFor(productId);
    try {
      await apiClient.post("/product-images/", body);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't upload the image — please try again."));
    } finally {
      setUploadingFor(null);
    }
  };

  const handleImageDelete = async (imageId) => {
    try {
      await apiClient.delete(`/product-images/${imageId}/`);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the image — please try again."));
    }
  };

  const categoryOptions = buildIndentedOptions(categories);

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Products</h1>
        <button
          type="button"
          onClick={openNewForm}
          className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
        >
          + New Product
        </button>
      </div>
      {categoriesError && (
        <p className="text-red-600 mb-4">Couldn't load categories — please try again later.</p>
      )}
      {productsError && (
        <p className="text-red-600 mb-4">Couldn't load products — please try again later.</p>
      )}
      <table className="w-full text-left">
        <thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Images</th><th></th></tr></thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t">
              <td>{product.name}</td>
              <td>₹{product.price}</td>
              <td>{product.stock_quantity}{!product.in_stock && <span className="text-red-600 ml-1">(out of stock)</span>}</td>
              <td>
                <div className="flex gap-1 mb-1">
                  {product.images.map((img) => (
                    <div key={img.id} className="relative">
                      <img src={img.image} alt={img.alt_text} className="w-10 h-10 object-cover rounded" />
                      <button
                        onClick={() => handleImageDelete(img.id)}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 text-xs leading-none"
                        aria-label="Delete image"
                      >×</button>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingFor === product.id}
                  onChange={(e) => e.target.files[0] && handleImageUpload(product.id, e.target.files[0])}
                  className="text-xs"
                />
              </td>
              <td className="flex gap-2">
                <button onClick={() => startEdit(product)} className="text-blue-600">Edit</button>
                <button onClick={() => handleDelete(product.slug)} className="text-red-600">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isFormOpen && (
        <Modal title={editingSlug ? "Edit Product" : "New Product"} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="grid gap-2">
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2" />
            <input required placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="border rounded px-3 py-2" />
            <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded px-3 py-2">
              <option value="">Select category</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <input required type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="border rounded px-3 py-2" />
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-3 py-2" />
            <label className="flex flex-col text-sm text-gray-600">
              Stock quantity
              <input
                required
                type="number"
                min="0"
                placeholder="Stock quantity"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                className="border rounded px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />
              Featured
            </label>
            {formError && <p className="text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
                {editingSlug ? "Save Changes" : "Add Product"}
              </button>
              <button type="button" onClick={closeForm} className="border rounded px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {successMessage && (
        <Modal title="Success" onClose={() => setSuccessMessage(null)}>
          <p className="mb-4">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
          >
            OK
          </button>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/admin/ProductsManager.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ProductsManager.jsx frontend/src/pages/admin/ProductsManager.test.jsx
git commit -m "feat(admin): convert ProductsManager to list+modal+success-popup, indented category picker"
```

---

## Task 9: `VideosManager` — list + modal + success popup

**Files:**
- Modify: `frontend/src/pages/admin/VideosManager.jsx`
- Test: `frontend/src/pages/admin/VideosManager.test.jsx` (new — none exists today)

**Interfaces:**
- Consumes: `Modal` (Task 6). No category picker involved.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/admin/VideosManager.test.jsx`:

```jsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import VideosManager from "./VideosManager";

vi.mock("../../api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const VIDEO = {
  id: 1,
  title: "Tank tour",
  youtube_url: "https://youtu.be/dQw4w9WgXcQ",
  order: 0,
  is_active: true,
  thumbnail_url: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
};

function mockInitialLoad(videos = [VIDEO]) {
  apiClient.get.mockImplementation((url) => {
    if (url === "/videos/") return Promise.resolve({ data: { results: videos } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("VideosManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoad();
  });

  afterEach(() => cleanup());

  it("shows the list without a form until 'New Video' is clicked", async () => {
    render(<VideosManager />);
    expect(await screen.findByText("Tank tour")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Title")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /new video/i }));

    expect(screen.getByPlaceholderText("Title")).toBeTruthy();
  });

  it("creates a video and shows a success popup", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    render(<VideosManager />);
    await screen.findByText("Tank tour");

    fireEvent.click(screen.getByRole("button", { name: /new video/i }));
    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "New video" } });
    fireEvent.change(screen.getByPlaceholderText("YouTube URL"), {
      target: { value: "https://youtu.be/aaaaaaaaaaa" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(await screen.findByText(/video created/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Title")).toBeNull();
  });

  it("shows a success popup after deleting", async () => {
    apiClient.delete.mockResolvedValueOnce({ data: {} });
    render(<VideosManager />);
    await screen.findByText("Tank tour");

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalled());
    expect(await screen.findByText(/video deleted/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/admin/VideosManager.test.jsx`
Expected: FAIL — no "New Video" button exists yet.

- [ ] **Step 3: Rewrite `VideosManager.jsx`**

Replace the full contents of `frontend/src/pages/admin/VideosManager.jsx`:

```jsx
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";
import Modal from "../../components/admin/Modal";

export default function VideosManager() {
  const [videos, setVideos] = useState([]);
  const [videosError, setVideosError] = useState(false);
  const [form, setForm] = useState({ title: "", youtube_url: "", order: 0, is_active: true });
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const load = () =>
    apiClient
      .get("/videos/")
      .then((response) => {
        setVideos(response.data.results);
        setVideosError(false);
      })
      .catch(() => setVideosError(true));

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ title: "", youtube_url: "", order: 0, is_active: true });
    setThumbnailFile(null);
    setEditingId(null);
    setFormError("");
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (video) => {
    setForm({
      title: video.title,
      youtube_url: video.youtube_url,
      order: video.order,
      is_active: video.is_active,
    });
    setThumbnailFile(null);
    setEditingId(video.id);
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append("title", form.title);
    body.append("youtube_url", form.youtube_url);
    body.append("order", form.order || 0);
    body.append("is_active", form.is_active);
    if (thumbnailFile) body.append("thumbnail", thumbnailFile);

    const wasEditing = Boolean(editingId);
    try {
      if (editingId) {
        await apiClient.patch(`/videos/${editingId}/`, body);
      } else {
        await apiClient.post("/videos/", body);
      }
      closeForm();
      load();
      setSuccessMessage(wasEditing ? "Video updated." : "Video created.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't save the video — please check the fields and try again."));
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/videos/${id}/`);
      setFormError("");
      load();
      setSuccessMessage("Video deleted.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the video — please try again."));
    }
  };

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Videos</h1>
        <button
          type="button"
          onClick={openNewForm}
          className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
        >
          + New Video
        </button>
      </div>
      {videosError && (
        <p className="text-red-600 mb-4">Couldn't load videos — please try again later.</p>
      )}
      <ul className="grid gap-2">
        {videos.map((video) => (
          <li
            key={video.id}
            className={`flex items-center gap-3 border-t pt-2 ${video.is_active ? "" : "opacity-50"}`}
          >
            <img src={video.thumbnail_url} alt={video.title} className="w-20 h-12 object-cover rounded" />
            <span className="flex-1">
              {video.title}
              {!video.is_active && <span className="ml-2 text-xs text-gray-500">(inactive)</span>}
            </span>
            <span className="text-xs text-gray-500">order: {video.order}</span>
            <button onClick={() => startEdit(video)} className="text-blue-600">Edit</button>
            <button onClick={() => handleDelete(video.id)} className="text-red-600">Delete</button>
          </li>
        ))}
      </ul>

      {isFormOpen && (
        <Modal title={editingId ? "Edit Video" : "New Video"} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              required
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              required
              placeholder="YouTube URL"
              value={form.youtube_url}
              onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              type="number"
              placeholder="Order"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setThumbnailFile(e.target.files[0] || null)}
              className="border rounded px-3 py-2"
            />
            {formError && <p className="text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
                {editingId ? "Save Changes" : "Add"}
              </button>
              <button type="button" onClick={closeForm} className="border rounded px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {successMessage && (
        <Modal title="Success" onClose={() => setSuccessMessage(null)}>
          <p className="mb-4">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
          >
            OK
          </button>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/admin/VideosManager.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/VideosManager.jsx frontend/src/pages/admin/VideosManager.test.jsx
git commit -m "feat(admin): convert VideosManager to list+modal+success-popup"
```

---

## Task 10: Full-suite check, deploy to the AWS test server, verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

From `backend/`: `python manage.py test catalog -v 2`
Expected: PASS, no regressions across the whole `catalog` app.

- [ ] **Step 2: Run the full frontend suite**

From `frontend/`: `npx vitest run`
Expected: PASS, including every pre-existing test file (`OrderDetailManager.test.jsx`, etc.) alongside all the new/updated ones from Tasks 4, 6, 7, 8, 9.

- [ ] **Step 3: Push to `phase-1`**

```bash
git push origin phase-1
```

- [ ] **Step 4: Deploy to the EC2 test server**

```bash
ssh -i "$env:USERPROFILE\Downloads\fnbaqua-key-clean.pem" ubuntu@13.50.60.19 "cd fnbaqua && git pull origin phase-1 && docker compose build && docker compose up -d"
```

- [ ] **Step 5: Verify the `/admin` routing fix live**

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://fnbaqua.13.50.60.19.nip.io/admin/categories
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://fnbaqua.13.50.60.19.nip.io/django-admin/
```
Expected: the first returns `200` and serves the React app (check with a browser, not just curl, since the SPA needs JS to render the actual admin UI — curl alone confirms it's no longer a 302 to a Django login page); the second returns `302` to Django's `/django-admin/login/`.

- [ ] **Step 6: Verify the full feature in the browser**

Log into `https://fnbaqua.13.50.60.19.nip.io/admin/categories` as staff. Create "Fish" (top-level), then "Cichlid" (parent: Fish), then "Full Moon" (parent: Cichlid) — confirm each create shows the success popup, the list refreshes, and the parent dropdown shows "Cichlid" indented under "Fish" once it exists. Edit "Full Moon" and confirm its dropdown correctly excludes itself (no self-parenting option) and shows the full indented tree. In Products admin, create a product under "Full Moon" and confirm the category dropdown shows it indented under Fish > Cichlid. On the storefront, visit the "Full Moon" category page and confirm the breadcrumb reads `Home / Fish / Cichlid / Full Moon`.

- [ ] **Step 7: Update memory**

No plan step needed here — this is a note for whoever runs the plan: nothing about this feature belongs in the auto-memory system per its "what NOT to save" rules (it's derivable from the code/spec), so no memory update is expected as part of this task.
