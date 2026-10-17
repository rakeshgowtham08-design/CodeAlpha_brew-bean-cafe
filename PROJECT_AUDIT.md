# Brew & Bean Project Audit

Audit date: 2026-10-09

## Prioritized checklist

### P0 — Fix before public deployment
- [x] Inspect project structure, schemas, routes, controllers, middleware, and server startup. No `.env` secret values were read or printed.
- [x] Stop accepting an arbitrary client-supplied order discount; no coupon model or redemption flow exists. Temporary-order integration test confirmed `discount: 100` persisted as `0` and totals were correct.
- [ ] Escape untrusted product, account, and API error content before storefront HTML insertion; retain real text and links.
- [ ] Validate order payload shape, delivery/payment enums, customer/address lengths, item counts, and quantities on the server.
- [ ] Ensure malformed IDs and async controller errors return structured HTTP errors rather than unhandled Express 4 promise rejections.
- [ ] Keep admin authorization server-side and verify the current MongoDB account role for protected requests.

### P1 — Reliability and operational readiness
- [x] Customer registration/login exists; passwords are bcrypt hashes, duplicate email is checked, and reset tokens are random, hashed, expiring, and single-use.
- [ ] Handle concurrent duplicate registration as HTTP 409 rather than a generic database error.
- [x] Reset flow has forgot/reset pages and was integration-tested. SMTP values are absent from `.env`; development prints reset links. Actual email delivery is not configured.
- [ ] Fix malformed home-page search anchor markup and replace/clearly mark placeholder `href="#"` legal/social links.
- [ ] Align cart and checkout totals: cart always shows standard delivery; checkout allows express/pickup. Checkout recalculates totals server-side, but discounts are not implemented.
- [ ] Decide and implement stock semantics before representing inventory as authoritative: current checkout neither decrements nor reserves stock. This audit preserves existing behavior pending product decision.
- [x] Product images: 27 current products have 27 distinct local image paths and all checked assets respond successfully.
- [x] Admin dashboard, product CRUD, order/customer views, analytics, paginated queries, and category label management exist.
- [x] Order status transitions are restricted to existing schema stages; customer tracking reads persisted order status.
- [ ] Add auth rate limiting, request-size limits, security headers, and production CORS policy before public launch.
- [ ] Add repeatable automated tests; no project test script or test files are currently present.

### P2 — Product/operations polish
- [ ] Decide whether to implement real payment processing; current payment methods are labels only.
- [ ] Add verified SMTP configuration and test delivery after owner supplies an App Password privately.
- [ ] Add real privacy/terms pages and replace remaining placeholder outbound links.
- [ ] Review local font/CDN, image attribution/licensing, accessibility, and mobile page-by-page before production.

## Verified current state

- Express serves `frontend/` at `/` and `admin/` at `/admin/`.
- Port 4000 listener was identified as this workspace's `node backend/server.js`; it was not stopped.
- MongoDB/JWT settings are present. SMTP host, user, password, sender, and `APP_URL` are missing.
- Live database counts: 27 products, 2 admin users, 1 customer, 2 orders; both stored orders currently have `confirmed` status. No record contents or credentials were exposed in this audit.
- Public product list works; protected order/customer/inventory routes reject requests without authentication.
- Main storefront, account/recovery, checkout, tracking, and admin page URLs returned HTTP 200 during this audit.
- No `npm test` script or existing test suite was found.

## Not performed

- No seed/reset command, public deployment, port-process termination, customer order creation, existing account mutation, or existing data deletion was performed during the audit.
- Actual Gmail delivery cannot be verified until SMTP credentials are configured locally.
