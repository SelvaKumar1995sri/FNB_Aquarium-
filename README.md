# FNB Aqua Website

FNB Aqua's official website — a public-facing showcase for the business (aquariums / fish tanks and related products and services) with a lightweight admin panel to manage content, plus a customer inquiry system.

> **Phase 1 (current scope):** This release covers browsing, showcasing, and **enquiries only**. There is **no payment gateway, cart, checkout, or order placement** in this phase — customers submit an inquiry and the team follows up with them directly. Online ordering/payment is planned for a later phase.

## Tech Stack

- **Frontend:** React 19 + Vite, React Router, Tailwind CSS, Framer Motion, Axios
- **Backend:** Django 5 + Django REST Framework, JWT auth (SimpleJWT), CORS headers
- **Database:** PostgreSQL
- **Media/Static:** Django (local dev) / S3-compatible storage via django-storages + Whitenoise (production)

## What's Included (Phase 1)

### Public site
- **Home** — landing page with highlights and video slider
- **About**, **Services**, **Portfolio**, **Blog** — informational/marketing pages
- **Categories & Products** — browse product categories and product detail pages
- **Search** — search across products
- **Custom Tank Build** — request page for a custom-built tank
- **Contact** — contact details and inquiry form
- **Inquiry form** — general, product-specific, and custom tank build inquiries (no payment involved)

### Admin panel
- Login (JWT-based)
- Manage Categories
- Manage Products
- Manage Videos (YouTube-linked)
- View & manage Inquiries (status: new / contacted / closed)

### Explicitly NOT in Phase 1
- Shopping cart
- Online payment / payment gateway integration
- Order placement, order tracking, or invoicing

## Project Structure

```
FNB Aqua/
├── backend/            # Django REST API
│   ├── catalog/        # Categories, Products, Portfolio, Blog, Videos
│   ├── inquiries/       # Customer inquiry model, API, throttling
│   ├── core/            # Auth views, health check
│   └── config/          # Django project settings & root URLs
├── frontend/            # React + Vite app
│   └── src/
│       ├── pages/public/   # Public-facing pages
│       ├── pages/admin/    # Admin panel pages
│       ├── components/     # Shared UI components
│       └── api/            # API client
└── docker-compose.yml   # Local PostgreSQL for development
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- Docker (for local PostgreSQL) — or a local PostgreSQL instance

### 1. Start the database

```bash
docker compose up -d
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
copy .env.example .env        # Windows: copy, macOS/Linux: cp
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend runs at `http://localhost:8000` — API base: `http://localhost:8000/api/v1/`, Django admin at `/admin/`.

### 3. Frontend setup

```bash
cd frontend
npm install
copy .env.example .env        # Windows: copy, macOS/Linux: cp
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Key API Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/auth/` | Admin login (JWT) |
| `GET /api/v1/health/` | Health check |
| `GET/POST /api/v1/categories/`, `/products/` | Catalog (public read, admin write) |
| `POST /api/v1/inquiries/` | Submit a customer inquiry (general / product / build tank) |

## Roadmap

- **Phase 1 (current):** Public catalog, content pages, and enquiry-based lead capture
- **Phase 2 (planned):** Online payments, cart, and order placement

## License

Internal project for FNB Aqua. All rights reserved.
