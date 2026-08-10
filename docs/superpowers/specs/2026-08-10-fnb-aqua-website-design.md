# FNB Aqua Website — Design Spec

Date: 2026-08-10
Status: Approved for planning

## 1. Overview

Build a catalog + inquiry website for FNB Aquatic Studio, modeled on the navigation and page structure of chennaiaquarium.in but **without** cart/checkout/online payment or customer accounts. Customers browse fish, plants, products, services, and portfolio content, and submit inquiries (general contact, product inquiry, or "Build Your Tank" custom request). A staff-only admin panel (same app, `/admin` route, branded — not Django's default admin) lets FNB staff manage categories, products, videos, and incoming inquiries.

The site must be written with production/AWS-deployment best practices in mind from the start (see §9), since the target deployment is AWS serving a worldwide audience.

## 2. Tech stack

- **Frontend:** React + Vite + JSX + Tailwind CSS (matches existing project conventions, e.g. `The_fit_syndicate`)
- **Backend:** Django + Django REST Framework (DRF)
- **Auth:** `djangorestframework-simplejwt` for staff login (JWT access/refresh tokens); no customer auth
- **Database:** PostgreSQL everywhere — local dev runs Postgres too (via Docker Compose or a local install), production uses AWS RDS for PostgreSQL. Same engine in both environments (no SQLite→Postgres migration risk), chosen specifically because phase 2 (orders, payment records, cart) needs proper concurrent-write handling and transactional integrity that SQLite can't provide at scale. Connection config driven by a `DATABASE_URL` env var.
- **Media storage:** Django's storage backend abstracted behind `django-storages`; local filesystem in dev, S3-compatible in production via env flag
- **Repo layout:** monorepo with `frontend/` (Vite React app) and `backend/` (Django project) at the root

## 3. Architecture

- Django exposes a versioned JSON API under `/api/v1/`.
- Public (unauthenticated) endpoints: read-only list/detail for categories, products, portfolio items, blog posts, videos; write-only `POST /api/v1/inquiries/` for inquiry submission.
- Staff-only (JWT-authenticated, `is_staff=True`) endpoints: full CRUD for categories, products, videos; read + status-update for inquiries; `/api/v1/auth/login/` and `/refresh/`.
- React app is a single SPA with client-side routing (`react-router-dom`): public routes render without auth; `/admin/*` routes are guarded by a route wrapper that checks for a valid JWT in memory/localStorage and redirects to `/admin/login` if absent/expired.
- CORS restricted to known frontend origins via env var (`CORS_ALLOWED_ORIGINS`), not wildcard.

## 4. Site map (public)

- **Home** — hero banner, featured products, "Build Your Tank" teaser/CTA, process steps (Consultation → Design & Build → Installation → Fish Adding → Maintenance), video slider (§7), about blurb, contact snippet
- **Fish** — category grid (subcategories seeded from DB, e.g. Planted, Exotics, Cichlid, Discus, Arowana)
- **Plants**
- **Products** — subcategories from DB (Tanks, Marine, Filtration System, Lighting System, Decor, Accessories); each product has an "Enquire about this" action instead of "Add to Cart"
- **Custom Tank Build** — inquiry form: name, phone, email, tank size/shape, budget notes, message
- **Services**
- **Portfolio / Gallery**
- **Blog**
- **About Us**
- **Contact Us** — inquiry form + real shop details (§6)
- **Policy pages** — Privacy Policy, Shipping Policy, Terms & Conditions, Return Policy (static content pages)

All category/product listings are driven by the database, not hardcoded, so admin edits show up immediately.

## 5. Data models (Django)

- `Category`
  - `name`, `slug`, `parent` (self-FK, nullable, for subcategories), `image`, `description`, `order`
- `Product`
  - `name`, `slug`, `category` (FK), `description`, `price` (display-only, informational — no checkout), `images` (one-to-many `ProductImage`), `in_stock` (bool), `is_featured` (bool), `created_at`
- `Inquiry`
  - `name`, `phone`, `email`, `message`
  - `type`: `general` | `product` | `build_tank` (choices)
  - `product` (FK, nullable — set when type is `product`)
  - `tank_size`, `tank_shape`, `budget_notes` (nullable — used when type is `build_tank`)
  - `status`: `new` | `contacted` | `closed` (choices, default `new`)
  - `created_at`, `updated_at`
- `PortfolioItem`
  - `title`, `image`, `description`, `order`
- `BlogPost`
  - `title`, `slug`, `body`, `cover_image`, `published_at`
- `Video`
  - `title`, `youtube_url`, `thumbnail` (auto-derivable from YouTube video ID, or manually uploaded), `order`, `is_active`
- Staff accounts use Django's built-in `User` model with `is_staff=True`; no separate customer-facing account model.

## 6. Real content (seed data)

Seeded via a Django data migration / management command so the site is fully browsable on first run:

- **Address:** No:75/A, Velachery Main Rd, Green Court, Pallikaranai, Chennai, Greater Chennai, Tamil Nadu 600100
- **Phone:** 097898 27973
- **Hours:** Monday–Saturday 10am–10pm, Sunday 10am–10pm (footer/Contact page note: hours may differ on public holidays)
- Sample categories/products/services/portfolio/about text as realistic placeholders, clearly structured so they're easy to replace once the real FNB catalog/photos are provided.

## 7. Video feature

- Admin can add/edit/reorder videos from the admin panel: title + YouTube URL (video ID parsed from URL) + thumbnail.
- Home page renders a horizontal slider of video "banners" (thumbnail + play-icon overlay).
- Clicking a banner opens `https://www.youtube.com/watch?v=<id>` in a new browser tab — no inline embed/player, matching the click-through behavior on the reference site.

## 8. Admin panel

- `/admin/login` — branded login form (Tailwind-styled, not Django's default), posts credentials to `/api/v1/auth/login/`, stores JWT.
- `/admin/dashboard` — sections for Categories, Products, Videos, Inquiries.
  - Category/Product: list + create/edit form with image upload.
  - Video: list + create/edit form (title, YouTube URL, thumbnail).
  - Inquiries: list with status filter (New/Contacted/Closed), detail view, status update.
- All admin routes require a valid staff JWT; API also re-checks `is_staff` server-side on every protected endpoint (never trust the frontend guard alone).

## 9. Non-functional requirements (AWS / production readiness)

Since the target deployment is AWS serving a worldwide audience, the codebase should follow these practices from the start even though actual AWS provisioning is a later, separate step:

- **Config via environment variables:** `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, media storage backend — never hardcoded, `.env.example` provided, `.env` gitignored.
- **Database:** use indexed fields for lookups (`slug`, `category`, `status`); paginate all list endpoints (DRF `PageNumberPagination`) so catalog growth doesn't degrade response times. Schema is designed to extend cleanly into phase 2 — `Inquiry` rows are structurally close to future `Order` rows, so the migration path to add `Order`/`Payment`/`Cart` models later is additive, not a rewrite.
- **Database access/visibility:**
  - Dev (local Postgres): DBeaver or pgAdmin (GUI), or `python manage.py dbshell` / `psql` and `python manage.py shell` (CLI/ORM) for quick inspection.
  - Production (AWS RDS): never expose the DB port publicly. Connect through an SSH bastion host or AWS Systems Manager Session Manager port-forwarding into the private subnet, then point a local DB GUI at `localhost` through that tunnel. RDS security group only allows traffic from app servers and the bastion/SSM host.
- **Abuse protection:** DRF throttling on the public inquiry-submission endpoint (rate-limit per IP) to prevent spam/flooding; serializer-level validation on all public input.
- **Media/static:** static files served via whitenoise or CDN-ready config; media storage abstracted so it can point to S3 in production without code changes.
- **Security:** HTTPS assumed in production (`SECURE_SSL_REDIRECT`, HSTS via env-gated settings), JWT short-lived access tokens with refresh, CORS locked to known origins, no secrets committed.
- **Process/serving:** Django served via gunicorn behind a reverse proxy in production (not `runserver`); settings split into `base/dev/production` modules.
- **Frontend performance:** route-based code-splitting (`React.lazy`), lazy-loaded images, production Vite build with asset hashing/caching headers.
- **Logging:** structured logging for API errors in production (not print statements).
- **Responsive design:** mobile-first Tailwind layout across the entire public site (breakpoints for phone/tablet/laptop/desktop) — collapsible hamburger nav on mobile, fluid product/category grids, touch-friendly tap targets, and the video slider swipeable on touch devices. The admin dashboard is optimized for tablet/laptop but must remain usable on a mobile browser too, since staff may need to check inquiries on the go.

Actual AWS resource provisioning (RDS, S3 bucket, EC2/ECS, CloudFront, domain/SSL) is out of scope for this build — the code is written so that step is a configuration change, not a rewrite.

## 10. Logo & branding

Redraw "FNB AQUATIC STUDIO" as a crisp high-resolution SVG/PNG in the same style (wave/fish mark + wordmark), used as favicon, header logo, and footer mark. Palette: dark navy/black + white, taken from the existing logo, adjustable once the real FNB site/brand assets are shared.

## 11. Explicitly out of scope (v1)

- Shopping cart, checkout, online payment
- Customer accounts, login, order history for customers
- Multi-language/i18n
- Actual AWS infrastructure provisioning/deployment execution

## 12. Testing approach

- Backend: Django test cases for model constraints, serializer validation (esp. `Inquiry` type-conditional fields), and view permissions (public read vs staff-only write).
- Frontend: smoke-test critical flows (inquiry form submission, admin login, admin CRUD) manually in-browser during implementation; component tests optional/light for v1.

## 13. Open items for later

- Swap seeded placeholder content/photos for real FNB catalog once shared.
- Confirm final brand palette once real FNB site/assets are available.
- AWS deployment execution (infra setup) as a separate follow-on task.
- Phase 2 (cart, `Order`/`Payment` models, payment gateway integration) as a separate spec once phase 1 ships.
