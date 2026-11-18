# CafeOrder — Online Food Ordering System

A full-stack cafeteria ordering system that lets customers browse a menu, place orders, pay online, and track status in real time — while giving staff a dashboard to manage everything.

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JavaScript   |
| Backend    | Node.js, Express.js               |
| Database   | MongoDB (Mongoose ODM)            |
| Auth       | JWT (Bearer token, localStorage)  |
| Payments   | Mock gateway (card / UPI / cash)  |

---

## Project Structure

```
Food-ordering_website/
├── .env                        # Environment variables (do not commit)
├── package.json
├── README.md
│
├── client/                     # Static frontend (served by Express)
│   ├── index.html              # Landing page
│   ├── css/
│   │   ├── main.css            # Global design system
│   │   ├── home.css
│   │   ├── menu.css
│   │   ├── cart.css
│   │   ├── checkout.css
│   │   ├── track.css
│   │   ├── auth.css
│   │   └── admin.css
│   ├── js/
│   │   ├── utils.js            # API helper, Toast, Modal, fmt
│   │   ├── auth.js             # Auth state (JWT, localStorage)
│   │   ├── cart.js             # Cart state (localStorage)
│   │   ├── nav.js              # Navbar (auth-aware)
│   │   ├── menu.js             # Menu page logic
│   │   ├── cart-page.js        # Cart page logic
│   │   ├── checkout.js         # Checkout + payment flow
│   │   ├── track.js            # Order tracking + polling
│   │   └── admin.js            # Admin SPA logic
│   └── pages/
│       ├── menu.html
│       ├── cart.html
│       ├── checkout.html
│       ├── track.html
│       ├── login.html
│       ├── register.html
│       └── admin.html
│
└── server/
    ├── server.js               # Express entry point
    ├── seed.js                 # DB seed script
    ├── config/
    │   ├── db.js               # Mongoose connection
    │   └── constants.js        # TAX_RATE, enums
    ├── models/
    │   ├── User.js
    │   ├── MenuItem.js
    │   ├── Order.js
    │   └── Payment.js
    ├── controllers/
    │   ├── authController.js
    │   ├── menuController.js
    │   ├── orderController.js
    │   ├── paymentController.js
    │   └── adminController.js
    ├── routes/
    │   ├── authRoutes.js
    │   ├── menuRoutes.js
    │   ├── orderRoutes.js
    │   ├── paymentRoutes.js
    │   └── adminRoutes.js
    └── middleware/
        ├── auth.js             # protect, adminOnly, optionalAuth
        ├── errorHandler.js     # Central error + 404 handler
        └── validate.js         # Input validation helpers
```

---

## Prerequisites

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **MongoDB** v6 or later running locally, or a [MongoDB Atlas](https://www.mongodb.com/atlas) connection string

---

## Quick Start

### 1. Install dependencies

```bash
cd Food-ordering_website
npm install
```

### 2. Configure environment

The `.env` file is already created with sensible defaults. Edit it if needed:

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/food_ordering
JWT_SECRET=cafeteria_secret_key_2024
JWT_EXPIRES_IN=7d
SESSION_SECRET=cafeteria_session_secret
NODE_ENV=development
ADMIN_EMAIL=admin@cafeteria.com
ADMIN_PASSWORD=Admin@123
```

### 3. Seed the database

```bash
npm run seed
```

This creates:
- **30 menu items** across 6 categories
- **Admin account** — `admin@cafeteria.com` / `Admin@123`
- **Sample customer** — `customer@example.com` / `Customer@123`

### 4. Start the server

```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

The app will be available at **http://localhost:5000**

---

## Pages & Routes

| URL | Description |
|-----|-------------|
| `/` | Landing page |
| `/pages/menu.html` | Browse menu with categories, search, filters |
| `/pages/cart.html` | Cart with totals, promo codes, order type |
| `/pages/checkout.html` | Checkout with payment (card/UPI/cash) |
| `/pages/track.html` | Real-time order tracking by order number |
| `/pages/login.html` | Customer / admin login |
| `/pages/register.html` | Customer registration |
| `/pages/admin.html` | Admin panel (admin login required) |

---

## REST API Reference

All API routes are prefixed with `/api`.

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | — | Register a new customer |
| POST | `/login` | — | Login (returns JWT) |
| GET  | `/me` | ✓ | Get current user profile |
| PUT  | `/me` | ✓ | Update name / phone |
| POST | `/logout` | ✓ | Logout (client-side) |

### Menu — `/api/menu`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | Get all menu items (supports `?category=`, `?available=`, `?veg=`, `?search=`) |
| GET | `/:id` | — | Get single item |
| GET | `/categories` | — | Get category list |
| POST | `/` | Admin | Create menu item |
| PUT | `/:id` | Admin | Update menu item |
| DELETE | `/:id` | Admin | Delete menu item |
| PATCH | `/:id/toggle` | Admin | Toggle availability |

### Orders — `/api/orders`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✓ | Place a new order |
| GET | `/` | ✓ | List orders (customer: own, admin: all) |
| GET | `/track/:orderNumber` | — | Public tracking by order number |
| GET | `/:id` | ✓ | Get order by ID |
| PATCH | `/:id/status` | Admin | Update order status |
| PATCH | `/:id/cancel` | Admin | Cancel an order |

### Payments — `/api/payments`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✓ | Initiate payment (mock gateway) |
| GET | `/:id` | ✓ | Get payment by ID |
| GET | `/order/:orderId` | ✓ | Get payment for an order |

### Admin — `/api/admin` *(admin only)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Stats, recent orders, top items |
| GET | `/orders` | All orders with filters + pagination |
| GET | `/users` | All customers |
| PATCH | `/users/:id/toggle` | Activate/deactivate customer |
| GET | `/analytics/sales` | Revenue by day + payment method |

### Health

```
GET /api/health
```

---

## Order Flow

```
Register / Login
      ↓
Browse Menu → Add to Cart
      ↓
Cart Review (qty, promo code, order type)
      ↓
Checkout (name, phone, payment method)
      ↓
POST /api/orders  →  POST /api/payments
      ↓
Order Confirmation (order number + receipt)
      ↓
Track Order (GET /api/orders/track/:orderNumber, polls every 15s)
```

---

## Order Statuses

```
Received → Preparing → Ready → Completed
                ↘ Cancelled (any stage, admin only)
```

---

## Promo Codes (Demo)

| Code | Discount |
|------|----------|
| `CAFE10` | 10% off |
| `FIRST20` | 20% off |
| `STUDENT5` | 5% off |

---

## Admin Panel Features

- **Dashboard** — live stat cards, recent orders, top-selling items, orders-by-status bar chart
- **Orders** — full table with status filter, date filter, pagination; update status or cancel inline
- **Menu Management** — add / edit / delete / hide items via modal form
- **Customers** — view all customers, activate / deactivate accounts
- **Analytics** — revenue bar chart (last 7 days, custom range) and revenue by payment method

---

## Security Notes

- Passwords are hashed with **bcryptjs** (cost factor 12)
- JWTs expire after **7 days**; store securely (localStorage for this demo)
- Admin routes are double-protected: `protect` middleware checks JWT, `adminOnly` checks `role === 'admin'`
- Input validation on both client (JS) and server (validate.js + Mongoose)
- MongoDB injection is prevented by Mongoose's typed schemas

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Express server port |
| `MONGO_URI` | `mongodb://localhost:27017/food_ordering` | MongoDB connection string |
| `JWT_SECRET` | `cafeteria_secret_key_2024` | JWT signing secret — **change in production** |
| `JWT_EXPIRES_IN` | `7d` | JWT expiry duration |
| `NODE_ENV` | `development` | `development` or `production` |
| `ADMIN_EMAIL` | `admin@cafeteria.com` | Seeded admin email |
| `ADMIN_PASSWORD` | `Admin@123` | Seeded admin password |

---

## Common Issues

**MongoDB not connecting**
- Make sure MongoDB is running: `mongod` or via `brew services start mongodb-community`
- Check `MONGO_URI` in `.env` matches your setup

**Port already in use**
- Change `PORT` in `.env`, or kill the process: `lsof -ti:5000 | xargs kill`

**Seed fails with duplicate key**
- The seed script clears existing menu items before re-inserting. If the admin user already exists it is preserved.

---

## License

MIT — free to use, modify, and distribute.
