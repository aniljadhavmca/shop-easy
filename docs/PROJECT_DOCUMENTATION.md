# 📖 Shop Easy — Project Documentation

> Complete technical documentation covering architecture, flows, services, database, deployment, and monitoring.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Service Details](#service-details)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [User Flows](#user-flows)
7. [Payment Flow (Stripe)](#payment-flow-stripe)
8. [Deployment Flow (CI/CD)](#deployment-flow-cicd)
9. [Infrastructure (Terraform)](#infrastructure-terraform)
10. [Monitoring (CloudWatch)](#monitoring-cloudwatch)
11. [Networking & Security](#networking--security)
12. [Local Development](#local-development)
13. [Key Design Decisions](#key-design-decisions)
14. [Troubleshooting](#troubleshooting)

---

## Project Overview

Shop Easy is a **production-grade e-commerce application** built with microservices architecture, deployed on AWS ECS Fargate with Stripe payment integration and real-time CloudWatch monitoring.

**What it demonstrates:**
- Microservices communication via ALB path-based routing
- Stripe PaymentIntents flow (create → confirm → track)
- Infrastructure as Code with Terraform
- 1-click CI/CD with GitHub Actions
- Structured logging → CloudWatch dashboards
- Cost-optimized AWS architecture (no NAT Gateway)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud (us-east-1)                     │
│                                                                  │
│  ┌─────────────────── VPC (10.0.0.0/16) ──────────────────────┐ │
│  │                                                              │ │
│  │  ┌──── Public Subnet 1 ────┐  ┌──── Public Subnet 2 ────┐  │ │
│  │  │                          │  │                          │  │ │
│  │  │  ┌── ECS Fargate ────┐  │  │                          │  │ │
│  │  │  │ • Frontend (Nginx) │  │  │     ┌── ALB ──────┐     │  │ │
│  │  │  │ • Product Service  │  │  │     │ Port 80     │     │  │ │
│  │  │  │ • Order Service    │  │  │     │ Path-based  │     │  │ │
│  │  │  └────────────────────┘  │  │     │ Routing     │     │  │ │
│  │  │                          │  │     └─────────────┘     │  │ │
│  │  │  ┌── RDS MySQL ──────┐  │  │                          │  │ │
│  │  │  │ db.t3.micro       │  │  │                          │  │ │
│  │  │  │ publicly_acc=false│  │  │                          │  │ │
│  │  │  └───────────────────┘  │  │                          │  │ │
│  │  └──────────────────────────┘  └──────────────────────────┘  │ │
│  │                                                              │ │
│  │  Internet Gateway ←→ Route Table ←→ Public Subnets           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌── ECR ──────┐  ┌── S3 ─────────┐  ┌── CloudWatch ────────┐  │
│  │ 4 repos     │  │ TF state      │  │ Logs + Dashboard     │  │
│  └─────────────┘  └───────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Traffic Flow:**
```
User → Browser → ALB (port 80) → Path-based routing:
   /products*, /cart*    → Product Service (4001)
   /orders*, /payments*  → Order Service (4002)
   /*                    → Frontend/Nginx (80)
```

---

## Service Details

### 1. Frontend (React + Nginx)

| Property | Value |
|----------|-------|
| Port | 80 |
| Tech | React 18, Stripe Elements, Nginx |
| Container | Multi-stage build (npm build → nginx serve) |
| State | Client-side only (user_id hardcoded as 1) |

**Responsibilities:**
- Product browsing with category filters
- Cart management (add, remove, view)
- Checkout form with shipping details
- Stripe card input (CardElement)
- Order history display with status badges
- Product detail modal on card click
- Mobile responsive (768px, 480px breakpoints)

**Key Frontend Logic:**
```
1. User clicks "Pay" → creates order (POST /orders)
2. Gets paymentIntent clientSecret (POST /payments/create-intent)
3. Stripe.js confirms card payment (client-side)
4. On success → confirms backend (POST /payments/confirm) → clears cart
5. On failure → reports to backend (POST /payments/failed)
```

---

### 2. Product Service (Node.js/Express)

| Property | Value |
|----------|-------|
| Port | 4001 |
| Tech | Node.js, Express, mysql2/promise |
| Routes | /products, /cart |
| DB Tables | products, cart_items |

**Responsibilities:**
- Serve product catalog (all + by ID)
- Manage cart (add/update/delete items)
- Join cart_items with products for price/image

**Cart Logic:**
- `POST /cart` — if product already in cart, increments quantity; otherwise inserts new row
- `DELETE /cart/:id` — removes specific cart item
- `GET /cart/:userId` — returns cart items with product details (JOIN)

---

### 3. Order Service (Node.js/Express + Stripe)

| Property | Value |
|----------|-------|
| Port | 4002 |
| Tech | Node.js, Express, mysql2/promise, Stripe SDK |
| Routes | /orders, /payments |
| DB Tables | orders, order_items, payments |

**Responsibilities:**
- Create orders from cart (with transaction)
- Stripe PaymentIntent lifecycle
- Track payment success/failure
- Structured JSON logging for CloudWatch
- Clear cart only after confirmed payment

**Structured Logging:**
```javascript
const log = (event, data) => console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  event,
  ...data
}));
```

Emits: `ORDER_PENDING`, `ORDER_BOOKED`, `ORDER_FAILED`, `ORDER_ERROR`

---

## Database Schema

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     users       │     │    products       │     │   cart_items     │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)           │     │ id (PK)         │
│ email           │     │ name              │     │ user_id (FK)    │
│ name            │     │ description       │     │ product_id (FK) │
│ created_at      │     │ price             │     │ quantity        │
└────────┬────────┘     │ image             │     │ created_at      │
         │              │ category          │     └─────────────────┘
         │              │ stock             │
         │              │ created_at        │
         │              └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     orders      │     │   order_items     │     │   payments      │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ id (PK)         │────▶│ id (PK)           │     │ id (PK)         │
│ user_id (FK)    │     │ order_id (FK)     │     │ order_id (FK)   │
│ total           │     │ product_id (FK)   │     │ amount          │
│ shipping_name   │     │ quantity          │     │ status          │
│ shipping_email  │     │ price             │     │ method          │
│ shipping_address│     └──────────────────┘     │ created_at      │
│ status (ENUM)   │──────────────────────────────▶└─────────────────┘
│ created_at      │
└─────────────────┘

Status ENUM: 'pending' | 'paid' | 'failed' | 'shipped' | 'delivered' | 'cancelled'
Payment Status ENUM: 'pending' | 'completed' | 'failed'
```

**Seed Data:** 10 products across Electronics and Accessories categories, 1 demo user.

**Idempotent Migrations:**
- `CREATE TABLE IF NOT EXISTS` — safe on first run
- `ON DUPLICATE KEY UPDATE` — updates products if re-run
- `ALTER TABLE ... MODIFY COLUMN` — adds 'failed' to ENUM safely
- Dynamic `ALTER TABLE` with `INFORMATION_SCHEMA` check for shipping columns

---

## API Endpoints

### Product Service (port 4001)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (DB connectivity) |
| GET | `/products` | List all products |
| GET | `/products/:id` | Get single product |
| GET | `/cart/:userId` | Get user's cart with product details |
| POST | `/cart` | Add to cart (or increment quantity) |
| DELETE | `/cart/:id` | Remove cart item |

### Order Service (port 4002)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (DB connectivity) |
| GET | `/orders/:userId` | Get user's order history |
| POST | `/orders` | Create order from cart (transaction) |
| POST | `/payments/create-intent` | Create Stripe PaymentIntent |
| POST | `/payments/confirm` | Confirm payment after Stripe success |
| POST | `/payments/failed` | Log frontend card error to backend |
| POST | `/payments` | Legacy payment endpoint (fallback) |

---

## User Flows

### Flow 1: Browse Products

```
User opens app → Frontend loads → GET /products → Display grid
                                                     ↓
User clicks category filter → Client-side filter (no API call)
                                                     ↓
User clicks product card → Modal opens (client-side state)
```

### Flow 2: Add to Cart

```
User clicks "Add" → POST /cart {user_id, product_id, quantity: 1}
                        ↓
Product Service checks if item exists in cart
  → Yes: UPDATE quantity + 1
  → No: INSERT new row
                        ↓
Frontend re-fetches cart → Badge updates
                        ↓
Notification: "✓ Added to cart!"
```

### Flow 3: Checkout & Payment (detailed)

```
┌─── FRONTEND ───────────────────────────────────────────────────┐
│ 1. User fills shipping (name, email, address)                   │
│ 2. User enters card in Stripe CardElement                       │
│ 3. User clicks "Pay $XX.XX"                                    │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
┌─── ORDER SERVICE ──────────────────────────────────────────────┐
│ 4. POST /orders                                                 │
│    → BEGIN transaction                                          │
│    → Fetch cart items + prices                                  │
│    → Calculate total                                            │
│    → INSERT into orders                                         │
│    → INSERT into order_items (for each cart item)               │
│    → UPDATE products stock (decrement)                          │
│    → COMMIT                                                     │
│    → log('ORDER_PENDING', {order_id, amount, customer, email})  │
│    → Return {id, total, status: 'pending'}                      │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
┌─── ORDER SERVICE ──────────────────────────────────────────────┐
│ 5. POST /payments/create-intent                                 │
│    → Fetch order from DB                                        │
│    → stripe.paymentIntents.create({                             │
│        amount: total * 100 (cents),                             │
│        currency: 'usd',                                         │
│        receipt_email: customer email,                            │
│        shipping: {name, address},                               │
│        metadata: {order_id, customer, email}                    │
│      })                                                         │
│    → Return {clientSecret}                                      │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
┌─── STRIPE (Client-Side) ──────────────────────────────────────┐
│ 6. stripe.confirmCardPayment(clientSecret, {card})              │
│    → Stripe validates card                                      │
│    → Returns success or error                                   │
└──────────┬─────────────────────────────┬───────────────────────┘
           │ SUCCESS                      │ ERROR
           ▼                              ▼
┌─── ORDER SERVICE ─────────┐  ┌─── ORDER SERVICE ─────────────┐
│ 7a. POST /payments/confirm │  │ 7b. POST /payments/failed      │
│  → Retrieve PaymentIntent  │  │  → INSERT payment (failed)     │
│  → Verify status=succeeded │  │  → UPDATE order status=failed  │
│  → INSERT payment(complete)│  │  → log('ORDER_FAILED',         │
│  → UPDATE order status=paid│  │      {order_id, reason})       │
│  → DELETE cart_items ← KEY!│  │  → Return {status: 'failed'}   │
│  → log('ORDER_BOOKED')     │  └───────────────────────────────┘
│  → Return {status: done}   │
└─────────────────────────────┘
           │
           ▼
┌─── FRONTEND ───────────────────────────────────────────────────┐
│ 8. Cart cleared, redirect to Orders page                        │
│    Notification: "🎉 Payment successful!"                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 4: View Orders

```
User clicks "Orders" → GET /orders/1 → Display list with:
  • Order ID, date, total
  • Status badge (green=paid, yellow=pending, red=failed)
  • Shipping details (name, email, address)
```

---

## Payment Flow (Stripe)

### Why PaymentIntents (not Charges)?

PaymentIntents support:
- SCA (Strong Customer Authentication) for EU
- 3D Secure card verification
- Async payment confirmations
- Better error handling on client-side

### Stripe Data Sent

```javascript
stripe.paymentIntents.create({
  amount: 2999,                    // $29.99 in cents
  currency: 'usd',
  receipt_email: 'john@email.com', // Auto-sends Stripe receipt
  shipping: {
    name: 'John Smith',
    address: { line1: '123 Main St' }
  },
  metadata: {                      // Searchable in Stripe Dashboard
    order_id: '42',
    customer: 'John Smith',
    email: 'john@email.com'
  }
});
```

### Test Cards

| Card Number | Result | What Happens |
|-------------|--------|--------------|
| `4242 4242 4242 4242` | ✅ Success | ORDER_BOOKED logged, cart cleared |
| `4000 0000 0000 0002` | ❌ Declined | Stripe returns error client-side → POST /payments/failed |
| `4000 0000 0000 9995` | ❌ Insufficient funds | Same as declined |
| `4000 0000 0000 0069` | ❌ Expired | Same as declined |

### Critical Bug Fixed: Cart Clearing

**Problem:** If cart cleared on order creation, a declined card = user loses cart items.
**Solution:** Cart cleared ONLY inside `/payments/confirm` after `status === 'succeeded'`.

### Critical Bug Fixed: Frontend Errors Never Reached Backend

**Problem:** Stripe validates cards client-side. If card is declined, no API call happens → backend never knows → no ORDER_FAILED log.
**Solution:** Added `POST /payments/failed` endpoint. Frontend explicitly reports card errors.

---

## Deployment Flow (CI/CD)

### Pipeline: `.github/workflows/full-deploy.yml`

```
┌─────────────────────────────────────────────────────────────┐
│              GitHub Actions (workflow_dispatch)               │
│              Input: "deploy" or "destroy"                     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─── Step 1: S3 Bucket ────────────────────────────────────────┐
│ • Get AWS Account ID                                          │
│ • Create shop-easy-tf-state-{ACCOUNT_ID} if not exists        │
│ • Enable versioning                                           │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─── Step 2: Terraform Apply ──────────────────────────────────┐
│ • terraform init -backend-config="bucket=$TF_STATE_BUCKET"    │
│ • terraform apply (creates VPC, ALB, ECS, RDS, ECR, CW)      │
│ • Outputs: ALB_DNS, RDS_HOST                                  │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─── Step 3: Build Docker Images ──────────────────────────────┐
│ • Build 4 images (--platform linux/amd64):                    │
│   - product-service                                           │
│   - order-service                                             │
│   - frontend (with STRIPE_PUBLISHABLE_KEY build arg)          │
│   - db-init                                                   │
│ • Push all to ECR                                             │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─── Step 4: Database Migration ───────────────────────────────┐
│ • aws ecs run-task (db-init) — one-shot Fargate task          │
│ • Connects to RDS, runs schema.sql                            │
│ • aws ecs wait tasks-stopped                                  │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─── Step 5: Deploy Services ──────────────────────────────────┐
│ • aws ecs update-service --force-new-deployment (x3)          │
│ • ECS pulls latest images from ECR                            │
│ • Rolling update: new task up → health check → drain old      │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─── Step 6: Credential Refresh ───────────────────────────────┐
│ • Re-configure AWS credentials (sandbox tokens may expire)    │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─── Step 7: Verify ───────────────────────────────────────────┐
│ • aws ecs wait services-stable                                │
│ • Output ALB URL + Dashboard URL to GitHub Summary            │
└──────────────────────────────────────────────────────────────┘
```

### Destroy Flow

```
1. terraform init (with same dynamic bucket)
2. terraform destroy -auto-approve
3. aws s3 rm + aws s3 rb (delete state bucket)
4. All AWS resources removed
```

### Why Account-ID-Based Bucket?

S3 bucket names are globally unique. `shop-easy-tf-state` would conflict across accounts. Using `shop-easy-tf-state-{ACCOUNT_ID}` guarantees uniqueness per deployer.

---

## Infrastructure (Terraform)

### Files

| File | Creates |
|------|---------|
| `vpc.tf` | VPC, 2 public subnets, 2 private subnets, IGW, route table |
| `alb.tf` | ALB, listener, 3 target groups, path-based routing rules |
| `ecs.tf` | ECS cluster, 4 task definitions, 3 services, 4 ECR repos, security group, log group |
| `rds.tf` | RDS MySQL instance, DB subnet group, security group |
| `iam.tf` | ECS execution role (ECR pull + CloudWatch logs) |
| `dashboard.tf` | CloudWatch dashboard with 7 panels |
| `backend.tf` | S3 backend configuration (bucket passed via CLI) |

### Resource Map

```
VPC (10.0.0.0/16)
├── Public Subnet 1 (10.0.1.0/24) - AZ a
├── Public Subnet 2 (10.0.2.0/24) - AZ b
├── Private Subnet 1 (10.0.10.0/24) - AZ a  (unused, for future NAT)
├── Private Subnet 2 (10.0.11.0/24) - AZ b  (unused, for future NAT)
├── Internet Gateway
├── Route Table (0.0.0.0/0 → IGW)
│
├── ALB (public, port 80)
│   ├── Listener Rule priority 10: /products*, /cart* → product-tg
│   ├── Listener Rule priority 20: /orders*, /payments* → order-tg
│   └── Default action: /* → frontend-tg
│
├── ECS Cluster
│   ├── product-service (256 CPU, 512 MB, public IP)
│   ├── order-service (256 CPU, 512 MB, public IP)
│   └── frontend (256 CPU, 512 MB, public IP)
│
├── RDS MySQL 8.0 (db.t3.micro, private, single-AZ)
│
├── ECR Repositories (4)
│   ├── shop-easy/product-service
│   ├── shop-easy/order-service
│   ├── shop-easy/frontend
│   └── shop-easy/db-init
│
└── CloudWatch
    ├── Log Group: /ecs/shop-easy (3-day retention)
    └── Dashboard: shop-easy-orders (7 panels)
```

### Security Groups

```
ALB SG:
  Inbound:  80/tcp from 0.0.0.0/0 (public access)
  Outbound: all traffic

ECS SG:
  Inbound:  0-65535/tcp from ALB SG only
  Outbound: all traffic (internet via IGW for ECR, Stripe)

RDS SG:
  Inbound:  3306/tcp from ECS SG only
  Outbound: all traffic
```

---

## Monitoring (CloudWatch)

### Dashboard: `shop-easy-orders`

7 log-based widgets using CloudWatch Logs Insights queries:

| # | Panel | Type | Query Logic |
|---|-------|------|-------------|
| 1 | ✅ Orders Booked | Counter | `filter @message like /ORDER_BOOKED/ \| stats count()` |
| 2 | ❌ Orders Failed | Counter | `filter @message like /ORDER_FAILED/ \| stats count()` |
| 3 | ⏳ Orders Pending | Counter | `filter @message like /ORDER_PENDING/ \| stats count()` |
| 4 | 💰 Revenue ($) | Counter | `parse @message /\"amount\":(?<amt>[\d.]+)/ \| stats sum(amt)` |
| 5 | 📊 Orders Over Time | Line chart | Group by event type, bin(5m) |
| 6 | 💰 Revenue Over Time | Bar chart | Sum amount by bin(1h) |
| 7 | 📋 Recent Events | Table | Last 50 events with timestamp, event, order_id, customer, email, amount, reason |

### Log Events

| Event | When | Fields |
|-------|------|--------|
| `ORDER_PENDING` | Order created, awaiting payment | order_id, user_id, amount, customer, email, reason |
| `ORDER_BOOKED` | Payment confirmed successful | order_id, user_id, amount, customer, email, reason |
| `ORDER_FAILED` | Card declined or payment failed | order_id, user_id, amount, customer, email, reason, stripe_status |
| `ORDER_ERROR` | Exception thrown | order_id, error |

### Why Log-Based (Not EMF Metrics)?

ECS tasks only have an **execution role** (ECR pull + logs). No **task role** with `cloudwatch:PutMetricData` permission. EMF (Embedded Metric Format) requires that permission. Log-based widgets work because logs are sent via awslogs driver (execution role handles that).

### Why `@message like` Instead of Field Filters?

ECS awslogs driver sends container stdout as a flat string in `@message`. CloudWatch does NOT auto-parse JSON from ECS container logs (unlike Lambda). You must regex-match the raw `@message` string.

---

## Networking & Security

### No NAT Gateway — How It Works

```
Proper production architecture:
  ECS (private subnet) → NAT Gateway → IGW → Internet
  RDS (private subnet) → No internet access needed
```

**Why it's secure:**
- ECS tasks have NO public IPs — completely private
- Only outbound traffic allowed via NAT (ECR pulls, Stripe API)
- ALB is the ONLY internet-facing resource
- RDS has no public IP + security group allows only ECS

**Cost:** NAT Gateway adds ~$32/month but provides proper network isolation.

### Secrets Management

| Secret | Where Stored | How Passed |
|--------|-------------|-----------|
| DB_PASSWORD | GitHub Secrets | → env var → terraform -var → ECS task env |
| STRIPE_SECRET_KEY | GitHub Secrets | → env var → terraform -var → ECS task env |
| STRIPE_PUBLISHABLE_KEY | GitHub Secrets | → Docker build-arg → baked into React bundle |
| AWS credentials | GitHub Secrets | → configure-aws-credentials action |

**Note:** For production, use AWS Secrets Manager with ECS native secret injection.

---

## Local Development

### Setup

```bash
# 1. Set Stripe keys
export STRIPE_SECRET_KEY=sk_test_your_key
export REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_key

# 2. Start all services
docker compose up --build

# 3. Open
open http://localhost:3000
```

### Docker Compose Architecture (Local)

```
┌─── docker-compose ────────────────────────────┐
│                                                │
│  db (MySQL 8.0)                                │
│    └── mounts database/schema.sql              │
│    └── healthcheck: mysqladmin ping            │
│                                                │
│  product-service (port 4001)                   │
│    └── depends_on: db (service_healthy)        │
│                                                │
│  order-service (port 4002)                     │
│    └── depends_on: db (service_healthy)        │
│    └── STRIPE_SECRET_KEY env var               │
│                                                │
│  frontend (port 3000 → nginx:80)              │
│    └── nginx.local.conf (proxy to services)    │
│    └── REACT_APP_STRIPE_PUBLISHABLE_KEY arg    │
│    └── depends_on: both services               │
└────────────────────────────────────────────────┘
```

### Local vs AWS Differences

| Aspect | Local (docker-compose) | AWS (ECS) |
|--------|----------------------|-----------|
| DB | MySQL container | RDS instance |
| Schema | Volume mount → auto-init | db-init ECS RunTask |
| Networking | Docker bridge network | VPC + ALB routing |
| Frontend proxy | nginx.local.conf | ALB path rules |
| Stripe key | Build arg from env | Build arg from GitHub Secret |
| Logs | Docker stdout | CloudWatch via awslogs driver |

---

## Key Design Decisions

### 1. Two schema.sql Files

- `database/schema.sql` — Docker Compose mounts this into MySQL container's init directory
- `db-init/schema.sql` — Baked into db-init Docker image, runs via mysql CLI against RDS

**Why separate:** Different execution mechanisms. Docker MySQL auto-runs files in `/docker-entrypoint-initdb.d/`. RDS needs a client container to connect remotely.

**Risk:** Must keep both files synced manually.

### 2. Single User (user_id = 1)

No auth system. Hardcoded `USER_ID = 1` in frontend. All operations use the same demo user. Simplifies the demo while showing all e-commerce flows.

### 3. Cart in MySQL (Not Redis)

For demo scale, MySQL is sufficient. Redis would add cost (~$13/mo) and complexity. Trade-off: slightly slower cart reads under high concurrency.

### 4. All Services Share One Log Group

Single log group `/ecs/shop-easy` with different stream prefixes (`product/`, `order/`, `frontend/`). Simplifies CloudWatch queries — one `SOURCE` for all dashboard widgets.

### 5. `force_delete = true` on ECR

Allows `terraform destroy` to delete ECR repos even with images inside. Without this, destroy would fail with "repository not empty" error.

### 6. Frontend Calls Backend on Stripe Error

Stripe validates cards client-side. Declined cards never reach the backend. Without the explicit `POST /payments/failed` call, the dashboard would show 0 failures — misleading.

### 7. Health Check Queries Database

`/health` does `SELECT 1` against MySQL. If DB is down, health check fails → ALB routes away → ECS replaces task. A simple `return 200` would mask database issues.

---

## Troubleshooting

### Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Images not updating after deploy | Old `db-init/schema.sql` | Sync both schema files |
| MySQL silently ignores status update | ENUM missing 'failed' | Add 'failed' to ENUM via ALTER TABLE |
| Dashboard shows 0 for all panels | Wrong time range or no traffic | Adjust time range, make test orders |
| `field event = "ORDER_BOOKED"` fails | ECS logs aren't auto-parsed JSON | Use `@message like /ORDER_BOOKED/` |
| S3 bucket creation fails | Name conflict across accounts | Use account-ID-based bucket name |
| `exec format error` in ECS | ARM image on x86 infra | Build with `--platform linux/amd64` |
| Pipeline timeout | AWS credential expiry | Add credential refresh step mid-pipeline |
| Cart not clearing | Cleared before payment confirms | Clear only in /payments/confirm on success |
| Failed orders stay "pending" | ENUM rejects 'failed' silently | ALTER TABLE to add 'failed' value |
| Stripe Dashboard shows wrong email | No receipt_email set | Add receipt_email to paymentIntents.create |

### Debugging Commands

```bash
# Check ECS service status
aws ecs describe-services --cluster shop-easy-cluster \
  --services product-service order-service frontend

# View recent logs
aws logs tail /ecs/shop-easy --since 1h --filter-pattern "ORDER_"

# Check ALB target health
aws elbv2 describe-target-health --target-group-arn <tg-arn>

# Test service directly
curl http://<ALB_DNS>/products
curl http://<ALB_DNS>/health  # hits frontend (nginx)

# Check RDS connectivity from ECS
aws ecs execute-command --cluster shop-easy-cluster \
  --task <task-id> --container order-service \
  --interactive --command "/bin/sh"
```

---

---

## Connecting to Private ECS Tasks (Debugging)

All ECS services run in **private subnets** with no public IPs. Use **ECS Exec** — AWS's built-in remote shell for Fargate (already enabled in this project).

### How It Works

```
Your Laptop → AWS CLI → SSM Session Manager → NAT Gateway → ECS Task (private subnet)
```

No bastion host, no SSH keys, no open ports. All via AWS APIs + IAM.

### Prerequisites (on your laptop)

1. AWS CLI v2 installed
2. [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) installed

### What's Enabled in Terraform

- `enable_execute_command = true` on all 3 ECS services
- Task role (`shop-easy-ecs-task`) with `AmazonSSMManagedInstanceCore` policy
- NAT Gateway allows SSM HTTPS outbound from private subnets

### Usage

```bash
# 1. Find task ID
aws ecs list-tasks --cluster shop-easy-cluster --service-name order-service
# Output: arn:aws:ecs:us-east-1:123456789:task/shop-easy-cluster/abc123

# 2. Connect to container shell
aws ecs execute-command \
  --cluster shop-easy-cluster \
  --task abc123 \
  --container order-service \
  --interactive \
  --command "/bin/sh"

# 3. You're inside the private container!
```

### Common Debugging Commands

```bash
# Check environment variables
env | grep DB

# Test DB connectivity
node -e "const m=require('mysql2/promise'); m.createConnection({host:process.env.DB_HOST,user:'admin',password:process.env.DB_PASSWORD,database:'shop_easy'}).then(c=>c.query('SELECT COUNT(*) as n FROM products').then(r=>{console.log(r[0]);c.end()}))"

# Check outbound connectivity (Stripe API via NAT)
curl -s https://api.stripe.com/v1 -o /dev/null -w "%{http_code}"

# Check health endpoint
curl http://localhost:4002/health
```

### Why ECS Exec Over a Bastion?

| Aspect | Bastion Host | ECS Exec |
|--------|-------------|----------|
| Cost | ~$8/mo | $0 |
| Security | SSH port open, key mgmt | No open ports, IAM-based |
| Maintenance | Patch OS, rotate keys | Zero |
| Audit | Manual | CloudTrail logs every session |
| Setup | VPC + SG + EC2 + keys | Task role + 1 flag |

---

*This documentation reflects the actual implementation in the `feature/stripe-monitoring` branch.*
