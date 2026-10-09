# Brew & Bean Café — full-stack café e-commerce site

A working café ordering site: product menu, cart, checkout, order tracking,
user accounts, and an admin dashboard — built with Express.js, MongoDB, and
vanilla HTML/CSS/JS (no frontend framework).

The current workspace was audited and exercised against its configured local
MongoDB and Express server on 2026-10-09. See the audit/testing section for
specific checks and limitations; no public deployment was performed.

---

## 1. Project structure

```
brew-bean/
├── frontend/              static site — plain HTML/CSS/JS
│   ├── index.html          home: hero, welcome, favorites, offers, reviews, instagram grid
│   ├── menu.html            full menu with search + category filters
│   ├── product.html          single product detail page
│   ├── cart.html              shopping cart (localStorage-backed)
│   ├── checkout.html           customer info, address, delivery, payment
│   ├── order-confirmation.html  shown right after placing an order
│   ├── tracking.html            order history + live status timeline
│   ├── login.html                login / register (one page, toggled)
│   ├── about.html                 café history, timeline, polaroid photos
│   ├── privacy.html / terms.html  implementation disclosures
│   ├── css/style.css               the whole design system
│   └── js/
│       └── common.js               API helper, cart, session, nav behavior
│
├── backend/                 Express + MongoDB API
│   ├── server.js             entry point — also serves frontend/ and admin/
│   ├── config/db.js           Mongoose connection
│   ├── models/                User.js, Product.js, Order.js
│   ├── middleware/            JWT/admin checks, auth rate limiting, async error handling
│   ├── controllers/            business logic for auth/products/orders
│   ├── routes/                  REST endpoints
│   ├── seed.js                   resets sample products; guarded initial admin creation
│   ├── provisionAdmin.js         non-destructive admin provisioning
│   └── mailer.js                 shared SMTP transport
│
├── admin/                    admin dashboard (separate static app)
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
│
├── package.json
├── .env.example                copy to .env and fill in
└── .gitignore
```

## 2. Technology

- **Frontend:** HTML5, CSS3, vanilla JavaScript — no build step, no framework
- **Backend:** Node.js + Express.js, REST API
- **Database:** MongoDB via Mongoose
- **Auth:** JWT (`jsonwebtoken`), passwords hashed with `bcryptjs`
- **Secrets:** loaded from `.env` via `dotenv` (never hardcoded)

## 3. MongoDB setup

You need a MongoDB database — either option works:

**Option A — local MongoDB**
1. Install MongoDB Community Server (mongodb.com/try/download/community).
2. Start it (`mongod`, or via your OS's service manager).
3. In `.env`, use: `MONGO_URI=mongodb://127.0.0.1:27017/brewbean`

**Option B — MongoDB Atlas (free cloud tier)**
1. Create a free cluster at mongodb.com/cloud/atlas.
2. Create a database user and allow your IP (or `0.0.0.0/0` for testing).
3. Copy the connection string into `.env` as `MONGO_URI`, e.g.
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/brewbean`

No manual table/collection creation needed — Mongoose creates collections
automatically the first time data is written (i.e., when you run the seed
script).

## 4. Environment variables

```bash
cp .env.example .env
```
Then open `.env` and fill in:
- `MONGO_URI` — your connection string from step 3
- `JWT_SECRET` — any long random string (a command to generate one is in
  the `.env.example` comments)
- `PORT` — defaults to 4000, change if that port is taken
- `CORS_ORIGINS` — optional comma-separated origins only when a frontend is hosted separately; `APP_URL` is also allowed
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — optional initial administrator account
  (`ADMIN_PASSWORD` must be unique and at least 12 characters)

## 5. How to run the project locally

Requires Node.js 18+.

```bash
npm install          # installs express, mongoose, bcryptjs, jsonwebtoken, cors, dotenv
cp .env.example .env  # then edit .env as described above
npm run admin:provision # safely create the first admin; does not reset data
npm run seed            # optional: reset product catalog (requires .env admin values)
npm start               # starts the server
```

Then open:
- **Storefront:** http://localhost:4000
- **Admin dashboard:** http://localhost:4000/admin

Password recovery uses a one-time link that expires after one hour. Configure
`APP_URL` and the `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, and optional `SMTP_FROM` values in `.env` to deliver reset emails.
In non-production development mode, the reset URL is written to the backend
console instead of sending email. Never run without SMTP configuration in
production.

For Gmail, enable 2-Step Verification and create a Google App Password. Use
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, your Gmail
address as `SMTP_USER` and `SMTP_FROM`, and the App Password as `SMTP_PASS`.
Restart `npm start`, then run `npm run email:check` to verify SMTP authentication
without sending a message. To send an explicit test message, run
`npm run email:test -- you@example.com`. Reset requests return an error if an
configured SMTP transport cannot send the email.

### Using VS Code Go Live

Go Live serves the static storefront on port 5500 and forwards `/api` requests
to the Express backend on port 4000. It does not start Express or MongoDB by
itself, so start the backend first using **Terminal → Run Task → Brew & Bean:
Start Express backend** (or run `npm start` in a terminal). Once the backend
reports that it is running, open `frontend/index.html` and click **Go Live**.
The storefront then opens at `http://localhost:5500/`; product images are
served from the local `frontend/images/` directory. Use
`http://localhost:4000/admin` for the admin dashboard, since Express serves
the separate `admin/` folder.

Re-run `npm run seed` any time to reset the product catalog (it does not
touch customer accounts or existing orders).

## 6. How to create the admin account

Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters in
`.env`, then run the non-destructive provisioning command:

```bash
npm run admin:provision
```

It creates a new administrator, refuses to change an existing customer's role,
and leaves an existing administrator's password untouched. Use the password
reset flow to change an admin password. Sign in at
`http://localhost:4000/admin/`. The separate `npm run seed` command resets the
product catalog and is not needed to provision an administrator.

## 7. How to add products

Two ways:
1. **Admin dashboard (recommended):** log in at `/admin` → Products →
   "+ Add Product". You can also edit price/stock/image or delete products
   from the same table.
2. **Seed file:** add an entry to the `products` array in `backend/seed.js`
   and re-run `npm run seed`.

Product images are local files in `frontend/images/`; each seeded product has
its own image path such as `/images/classic-cappuccino.jpg`. New products can
also use a hosted image URL, but local files should use this same
web-accessible path format.

## 8. How to deploy the website

A simple path that works well for this stack:

1. **Database:** use MongoDB Atlas (step 3, Option B) so your database is
   reachable from the internet.
2. **App hosting:** deploy to a Node-friendly host — Render, Railway, or
   Fly.io all work well for a small Express app like this one.
   - Set the build command to `npm install`.
   - Set the start command to `npm start`.
   - Add your `.env` values (`MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`,
     `ADMIN_PASSWORD`) as environment variables in the host's dashboard —
     never commit your real `.env` file.
   - Provision the first administrator with `npm run admin:provision` using
     environment variables configured on the host. Seed products only when
     deliberately initializing or resetting the catalog.
3. Your site and admin dashboard are both served by the same app, so one
   deployment covers everything (`/` and `/admin`).

### Production readiness checklist

- Generate a unique production `JWT_SECRET`; store all secrets in the host's secret manager, never in source control.
- Use HTTPS and set `APP_URL` to the canonical HTTPS origin. Restrict MongoDB access to the application host, use a least-privilege database account, and configure backups plus restore tests.
- Configure SMTP credentials and verify them with `npm run email:check`; send a controlled test via `npm run email:test -- recipient@example.com`.
- Set `CORS_ORIGINS` only for trusted separately hosted frontend origins. Never use wildcard CORS for an authenticated deployment.
- Helmet response headers and auth rate limiting are enabled. Content Security Policy is currently disabled because inline scripts remain; externalize or nonce/hash these scripts before enabling strict CSP.
- Provision admins with `npm run admin:provision`; do not run `npm run seed` during routine deploys because it resets the product catalog.
- Replace demo contact, address, privacy/terms, and social information with business-approved content. Confirm image rights, retention/deletion procedures, support escalation, and applicable legal jurisdiction.
- Add a real payment provider and cancellation/refund workflows if required; current payment choices are recorded only and not charged.
- For stronger stock/order crash atomicity, use MongoDB transactions on a replica set and test recovery/monitoring before launch.

## 9. API reference

| Method | Path                      | Auth        | Purpose                          |
|--------|---------------------------|:-----------:|------------------------------------|
| POST   | `/api/auth/register`       | no          | create account, returns JWT         |
| POST   | `/api/auth/login`          | no          | log in, returns JWT                 |
| POST   | `/api/auth/forgot-password` | no         | request a generic-response one-time reset link |
| POST   | `/api/auth/reset-password` | no          | set a password using a hashed, single-use token |
| GET    | `/api/auth/me`              | yes         | current user                        |
| GET    | `/api/auth/customers?page=&limit=&search=` | admin | paginated customers and order totals; secret fields excluded |
| GET    | `/api/products`             | no          | list (`?category=`, `?search=`)      |
| GET    | `/api/products/categories`   | no          | distinct category list               |
| PATCH  | `/api/products/categories`   | admin       | rename matching product categories   |
| GET    | `/api/products/inventory/summary` | admin   | catalog-wide stock counts            |
| PATCH  | `/api/products/:id/stock`    | admin       | update product stock                 |
| GET    | `/api/products/:id`          | no          | single product                        |
| POST   | `/api/products`               | admin       | create product                         |
| PUT    | `/api/products/:id`            | admin       | update product                          |
| DELETE | `/api/products/:id`             | admin       | delete product                           |
| POST   | `/api/orders`                    | yes         | validate cart, reserve stock, calculate and persist order totals |
| GET    | `/api/orders/mine`                | yes         | current user's order history             |
| GET    | `/api/orders/:id`                  | yes (owner/admin) | one order + its status steps      |
| GET    | `/api/orders`                       | admin       | all orders                                |
| PUT    | `/api/orders/:id/status`             | admin       | update order status                        |
| GET    | `/api/orders/stats/summary`           | admin       | dashboard numbers (revenue, daily counts, top products) |

Admin list endpoints accept bounded pagination (`page`, `limit`, maximum 100).
Order status changes only allow forward progress through the existing schema:
confirmed → preparing → ready → out for delivery → delivered. Pickup orders
may move from ready directly to delivered. Analytics sum stored order totals
across current statuses because this schema has no cancellation or refund
statuses. Categories remain strings stored on products; there is no separate
category collection.

## 10. Known simplifications (being upfront)

This is a real, working site — but a few things were intentionally kept
simple rather than fully "enterprise" scale:

- **Product images** are local files or HTTP(S) image URLs; uploads are not
  currently supported.
- **Reviews** on the homepage are static content, not stored in the
  database or submittable by customers.
- **Admin charts** are simple CSS bar visualizations built from real
  aggregated order data — not a charting library like Chart.js. They're
  accurate, just not animated/interactive.
- **Search** is a live client-side filter on the already-loaded product
  list (plus a MongoDB text index for the `search` query param on the API)
  — not a dedicated search service.
- **Sessions** use JWT stored in `localStorage`. That's standard for an API
  like this, but means logging out everywhere requires a token-blocklist
  if you ever need that (not implemented here). Admin authorization does
  reload the current account role from MongoDB for protected requests.
- **Inventory** is atomically decremented for new orders, and overselling is
  rejected. If a later reservation or order insert fails, the application
  compensates by restoring earlier reservations. Existing orders were not
  used to backfill stock; multi-document transactions require a MongoDB
  replica set for stronger crash/recovery guarantees.
- **Payments** are not processed by a payment gateway; the selected method is
  recorded on the order only. Cancellation/refund status workflows are not
  part of the current schema.
- Helmet security headers and auth rate limits are enabled. Content Security
  Policy is intentionally disabled because current pages contain inline
  scripts; move them to external files or nonce/hash scripts before enabling
  a strict CSP for production.
- **Instagram section** is a static photo grid — not pulled from a real
  Instagram API (that requires Meta developer approval and is out of scope
  for a demo).

None of these block the site from working end-to-end — they're just the
honest list of "built for clarity, not maximal scale."

## 11. Audit and testing status

The 2026-10-09 workspace audit used the configured MongoDB and local Express
server. It checked all current product image URLs, public storefront and
protected admin routes, role enforcement, registration/password hashing and
duplicate accounts, password reset, order validation and discount protection,
inventory decrement/oversell/rollback using disposable records, and tracking
compatibility. Browser checks covered product/menu/cart/checkout/tracking and
admin pages. Temporary test records were removed. Existing customer/order
records were not deleted or altered by those tests.

No automated project test suite currently exists. Actual SMTP delivery still
requires owner-provided credentials and was not tested. No public deployment,
payment charge, real checkout order, or database seed/reset was performed.
