# 🍕 Pizza Delivery — Full-Stack App (Oasis Infobyte, Level 3)

A production-grade pizza ordering app: React 18 SPA on a layered Express/MongoDB API,
with JWT auth, server-side pricing, Razorpay test checkout, real-time order tracking,
and a separate admin console.

```
WebDev-L3-PizzaDelivery/
├── client/     React 18 + Vite SPA
├── server/     Express API (MVC) + Socket.io + cron
└── package.json   Root scripts that drive both apps
```

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ (20 LTS recommended) | Ships with npm |
| MongoDB | 4.4+ | Local daemon, Docker, or Atlas |
| Razorpay account | test mode | For the checkout walkthrough |
| SMTP provider | optional | Falls back to Ethereal if unset |

> **MongoDB topology.** Payment confirmation uses a multi-document transaction when
> the server is a replica set. A standalone `mongod` (the usual local setup) cannot run
> transactions, so the server detects this at startup and falls back to guarded
> conditional updates with compensating rollbacks. Both paths are covered by the
> verification steps below — you do **not** need a replica set to run this app.

---

## 2. Setup

```bash
# 1. Install all three dependency trees
npm run install:all

# 2. Create the environment files
cp server/.env.example server/.env
cp client/.env.example client/.env
#    ...then edit server/.env: set MONGO_URI, JWT_SECRET and your Razorpay test keys.

# 3. Seed the catalog, ingredient inventory and the admin account
npm run seed

# 4. Start both dev servers (API :5000, client :5173)
npm run dev
```

Open <http://localhost:5173>. The seeded admin is **admin@pizzadelivery.test** /
**Admin@12345** — change it before any real deployment.

Other root scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Runs server + client together via `concurrently` |
| `npm run build` | Production build of the client into `client/dist/` |
| `npm start` | Runs the API alone (no client dev server) |
| `npm run seed` | Upserts ingredients, pizzas and the admin account |
| `npm run stock:alert` | Runs the low-stock check once, outside cron |

---

## 3. Environment variables

### `server/.env`

| Variable | Purpose |
|---|---|
| `PORT` | API port (default `5000`) |
| `NODE_ENV` | `development` shows stack traces; use `production` when deployed |
| `CLIENT_URL` | Client origin — used for CORS and links inside emails |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Signing key for access tokens |
| `JWT_EXPIRES_IN` | Access-token lifetime (`7d`, `12h`, …) |
| `VERIFY_TOKEN_TTL_MIN` | Email-verification link lifetime, in minutes |
| `RESET_TOKEN_TTL_MIN` | Password-reset link lifetime, in minutes |
| `BCRYPT_SALT_ROUNDS` | bcrypt cost factor (12 recommended) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | SMTP credentials. Leave `SMTP_HOST` empty to use Ethereal |
| `MAIL_FROM` | `From` header on outgoing mail |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **test** credentials |
| `RAZORPAY_WEBHOOK_SECRET` | Separate webhook secret (defaults to the key secret) |
| `STOCK_ALERT_CRON` | Cron schedule for low-stock email (default `0 9,21 * * *`) |
| `STOCK_ALERT_EMAIL` | Where low-stock alerts are sent |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account created by `npm run seed` |

### `client/.env`

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL (default `http://localhost:5000/api`) |
| `VITE_SOCKET_URL` | Socket.io server origin (no `/api` suffix) |

The Razorpay **key id** is deliberately not stored client-side: it is returned by the
order-creation response, so the server stays the single source of truth. The key
**secret** never leaves the server.

---

## 4. Feature coverage

### Customer

| # | Feature | Where it lives | How it works |
|---|---|---|---|
| 1 | Verified registration | `authController.register` | bcrypt-hashed password, single-use SHA-256 verification token emailed; login is refused until verified |
| 2 | JWT login | `authMiddleware`, `tokenService` | Access token carries `id` + `role`; the same guard rejects customers from admin routes |
| 3 | Password reset | `forgotPassword` / `resetPassword` | Generic response prevents email enumeration; reset link is single-use and time-boxed |
| 4 | Menu dashboard | `pages/user/Dashboard.jsx` | Reads `GET /api/pizzas`, which prices every pizza from its ingredient references |
| 5 | Custom pizza builder | `pages/user/CustomPizzaBuilder.jsx` | Pick base, sauce, cheese and toppings; the live total is recomputed server-side at checkout |
| 6 | Order summary | `context/CartContext.jsx`, `pages/user/Cart.jsx` | Cart persists across reloads; tax, delivery fee and free-delivery threshold applied server-side |
| 7 | Razorpay checkout | `hooks/useRazorpay.js`, `paymentController` | Server opens the gateway order, the browser opens Checkout, then the HMAC signature is verified before the order is marked Paid |
| 8 | Real-time order status | `pages/user/OrderTracking.jsx`, `config/socket.js` | Socket room `user:<id>` receives `order:statusUpdated` the moment an admin advances the order |

### Admin

| # | Feature | Where it lives |
|---|---|---|
| 1 | Separate admin login | `POST /api/admin/auth/login` + `pages/auth/AdminLogin.jsx` |
| 2 | Inventory dashboard | `GET /api/admin/inventory` + `pages/admin/Inventory.jsx` |
| 3 | Automatic stock decrement | `inventoryService.decrementStockForOrder`, called inside payment confirmation |
| 4 | Manual stock update | `PATCH /api/admin/ingredients/:id/stock` |
| 5 | Low-stock email alerts | `jobs/stockAlertJob.js` (node-cron) — thresholds are per-ingredient |
| 6 | Order management panel | `GET /api/admin/orders` + `pages/admin/Orders.jsx`, with search, filter and pagination |
| 7 | Real-time status push | `PATCH /api/admin/orders/:id/status` emits to both the customer room and the `admin` room |

---

## 5. Razorpay test-mode walkthrough

1. Sign in to the Razorpay dashboard → **Settings → API Keys → Generate Test Key**.
2. Put the key id and secret in `server/.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)
   and restart the API.
3. Sign in as a customer, build a pizza, and check out. The server creates the order and
   the matching gateway order, then the browser opens Razorpay Checkout.
4. Pay with a test card:

   | Field | Value |
   |---|---|
   | Card number | `4111 1111 1111 1111` |
   | Expiry | any future date |
   | CVV | any 3 digits |
   | OTP | `1234` (Razorpay test flow) |

   Test UPI: `success@razorpay`. Test failure: `failure@razorpay`.
5. On success the browser posts to `/api/payments/verify`. The signature is checked with
   the key secret, stock is decremented, and the order moves to **Received**.
6. Optional: register a webhook pointing at `/api/payments/webhook` with the
   `RAZORPAY_WEBHOOK_SECRET` set. It is the backup path if the browser never returns, and
   is idempotent with the browser callback.

> **Without valid keys** the order-creation endpoint fails fast with `502` and a message
> naming the cause. It does not leave a half-created order behind.

---

## 6. API reference

All responses share the shape `{ success, message?, ...payload }`. Errors carry
`{ success: false, message, details? }`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create an account and email a verification link |
| POST | `/verify-email` | — | Consume the verification token |
| POST | `/resend-verification` | — | Re-send the verification email |
| POST | `/login` | — | Issue a JWT (only for verified accounts) |
| POST | `/forgot-password` | — | Email a reset link (response is always generic) |
| POST | `/reset-password/:token` | — | Set a new password with a single-use token |
| GET | `/me` | Customer | Current profile |

### Catalog — `/api/pizzas`, `/api/ingredients`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/pizzas` | — | Menu, with server-computed prices |
| GET | `/api/pizzas/:id` | — | One pizza |
| GET | `/api/ingredients` | — | Ingredients available for the custom builder |
| GET | `/api/ingredients/:id` | — | One ingredient |

### Orders — `/api/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Verified customer | Validate the cart, price it, open a gateway order |
| GET | `/mine` | Customer | The caller's orders |
| GET | `/:id` | Owner or admin | One order |

### Payments — `/api/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/verify` | Customer | Verify the checkout signature and confirm the order |
| POST | `/webhook` | Razorpay signature | Gateway backup confirmation |

### Admin — `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Admin login (role-checked) |
| GET | `/inventory` | Admin | All ingredients plus a low-stock summary |
| POST | `/ingredients` | Admin | Create an ingredient |
| PATCH | `/ingredients/:id` | Admin | Edit an ingredient |
| PATCH | `/ingredients/:id/stock` | Admin | Set stock directly |
| DELETE | `/ingredients/:id` | Admin | Retire an ingredient |
| GET | `/orders` | Admin | Paginated order list (filter by status, search by email or id) |
| PATCH | `/orders/:id/status` | Admin | Advance an order (validated against the transition map) |

---

## 7. Order lifecycle

```
Pending Payment ──(payment verified)──► Received ──► In Kitchen ──► Sent to Delivery
```

`ALLOWED_TRANSITIONS` in `server/src/config/constants.js` is the authority. The admin
status endpoint rejects any move not listed there, so the progression cannot be bypassed
through the API even if the UI is tampered with.

---

## 8. Socket event contract

Sockets are authenticated by JWT in the handshake and joined to `user:<id>` or `admin`.

| Direction | Event | Payload |
|---|---|---|
| server → client | `order:created` | `{ order }` |
| server → client | `order:statusUpdated` | `{ orderId, orderStatus, statusHistory }` |
| server → client | `inventory:updated` | `{ action }` |
| server → client | `inventory:lowStock` | `{ ingredient, stock, threshold }` |
| client → server | `order:subscribe` | `orderId` |

---

## 9. Verification

Both scripts below were run against a live server on this machine and pass. They expect
the API to be running and the database seeded.

### API smoke test

```bash
npm run test:api          # or: bash tests/api-smoke.sh
```

Covers, in order: registration, the unverified-login block, the hashed verification token,
the invalid-token path, enumeration-safe password reset, admin login, the
customer-blocked-from-admin guard, `/auth/me`, catalog and inventory counts, a clean
gateway failure with no orphaned order, quantity validation, stock shortage,
authentication requirements, bad-signature rejection, a real signature verification with
stock decrement, replay idempotency, legal and illegal status transitions, cross-customer
order isolation, and `GET /orders/mine`.

Result: **30 passed, 0 failed.**

If your database is not the provided Docker container, point the script at your mongosh:

```bash
MONGO_SH="mongosh --quiet pizza_delivery" bash tests/api-smoke.sh
```

### Real-time check

```bash
npm run test:socket       # or: node tests/socket-check.mjs
```

Asserts that an unauthenticated handshake is rejected and that an authenticated customer
socket receives `order:statusUpdated` when an admin advances that customer's order.

Result: **4 passed, 0 failed.**

### Client build

```bash
npm run build
```

Result: 148 modules transformed, build succeeds.

---

## 10. Screenshots

Placeholders — capture these from a local run:

| Screen | File |
|---|---|
| Menu dashboard | `docs/screenshots/menu.png` |
| Custom pizza builder | `docs/screenshots/builder.png` |
| Cart / order summary | `docs/screenshots/cart.png` |
| Razorpay checkout | `docs/screenshots/checkout.png` |
| Live order tracking | `docs/screenshots/tracking.png` |
| Admin inventory | `docs/screenshots/admin-inventory.png` |
| Admin order management | `docs/screenshots/admin-orders.png` |

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Could not start payment: Authentication failed` | The Razorpay keys are missing or wrong. Re-copy them into `server/.env` and restart the API. |
| `Transaction numbers are only allowed on a replica set member` | You are on a standalone `mongod` with an older build of this code. The current server detects this and falls back automatically — make sure you are on the latest checkout. |
| Client shows CORS errors | `CLIENT_URL` in `server/.env` must match the exact origin you opened (including port). |
| No emails arrive | `SMTP_HOST` is unset, so Nodemailer uses Ethereal. Open the preview URL the server logs for each message. |
| Login returns `403` after registering | The account is not verified yet. Use the link from the verification email, or `POST /api/auth/resend-verification`. |
| `Unknown ingredient selected` | The cart references an ingredient that no longer exists. Re-seed with `npm run seed` and rebuild the pizza. |

---

## 12. Project layout

```
server/src/
├── config/        env, database, socket, constants
├── controllers/   HTTP concerns only
├── jobs/          node-cron stock alerts
├── middleware/    auth, validation, rate limiting, error handling
├── models/        Mongoose schemas
├── routes/        route tables + per-route validation
├── seed/          seed script and catalog data
├── services/      email, tokens, Razorpay, inventory
└── utils/         ApiError, asyncHandler, logger

client/src/
├── components/    shared UI (Layout, AdminLayout, Modal, Toaster, …)
├── context/       Auth, Cart, Socket providers
├── hooks/         useRazorpay
├── pages/         auth/, user/, admin/
├── routes/        route guards
└── utils/         formatting helpers
```
