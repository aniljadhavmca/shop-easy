# 🛍️ Shop Easy — E-Commerce Microservices

> Full-featured microservices e-commerce app on AWS ECS Fargate with Stripe payments, admin dashboard, category management, customer portal, Grafana + Prometheus observability, and PagerDuty alerting. 1-click deploy via GitHub Actions.

---

## Live Demo

![Shop Easy Live Demo](https://github.com/aniljadhavmca/shop-easy/blob/feature/observability-stack/docs/demo.jpg)

---

## Architecture

![Shop Easy Architecture](https://github.com/aniljadhavmca/shop-easy/blob/feature/observability-stack/docs/flow.png)

---

## Services (4 Fargate Tasks)

| Service | Port | Handles | Tech |
|---------|------|---------|------|
| Frontend | 80 | UI — shop, cart, checkout, admin panel, customer portal | React + Recharts + Stripe Elements + Nginx |
| Product Service | 4001 | Products CRUD + Cart + Categories + Prometheus metrics | Node.js/Express + prom-client |
| Order Service | 4002 | Orders + Payments + Auth + Analytics + Prometheus metrics | Node.js/Express + Stripe SDK + prom-client |
| Observability | 3000/9090 | Grafana dashboards + Prometheus scraping + PagerDuty alerts | Grafana 10.4 + Prometheus |

---

## Features

### Customer Experience
- Hero banner, category navigation (Flipkart-style scrollable icons)
- Product catalog — 4-column grid, star ratings, search by name/category
- Hot Deals, Trending slider, product detail modal with reviews
- Shopping cart → Checkout (name, email, phone, address + Stripe)
- My Orders — Email login, order progress tracker, printable receipts
- Trust bar, promo banner, mobile responsive (hamburger menu), back to top

### Admin Panel (Protected — no header, full-screen layout)
- **Login** — Username/password authentication (`admin` / `ShopEasy2026`)
- **Dashboard** — Stats cards (📊 Total Orders, 💰 Paid, 🚨 Failed, 🚀 Products Live)
- **Grafana-style charts** — Revenue Over Time (area chart) + Revenue Breakdown (bar chart)
- **Revenue** includes paid + shipped + delivered orders
- **Time range selector** — 10m, 1h, 4h, 6h, 12h, 1d, 3d
- **Products CRUD** — Add/edit/delete products on dedicated form page, category dropdown
- **Categories management** — Add/edit/delete categories with custom icon URLs, product count per category
- **Orders management** — Filter by status (All/Paid/Pending/Failed/Shipped/Delivered), update status
- **Logout** — Session-based admin auth

### Admin Panel

![Admin Panel](https://github.com/aniljadhavmca/shop-easy/blob/feature/observability-stack/docs/admin_panel.jpg)

### Observability (Grafana + Prometheus + PagerDuty)

![Grafana Dashboard](https://github.com/aniljadhavmca/shop-easy/blob/feature/observability-stack/docs/grphana.jpg)

- **Business Dashboard** — Booking Amount, Booking Count (Booked/Pending/Failed), pie chart, revenue over time
- **Infrastructure Dashboard** — Service UP/DOWN, CPU, Memory, HTTP request rates, P95 response time, error rates
- **PagerDuty Alerting** — Auto-triggers incident if `orders_failed_total > 5`
- **Prometheus Metrics** — `orders_created_total`, `orders_paid_total`, `orders_failed_total`, `payment_amount_dollars`, `http_requests_total`, `http_duration_seconds`
- **ECS Service Connect** — Prometheus discovers services via Cloud Map namespace

---

## 1-Click Deploy to AWS

### Prerequisites
- AWS account with `AdministratorAccess` IAM user
- GitHub repo forked/cloned

### Setup (once)

Add **6 secrets** to your GitHub repo → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Your IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret key |
| `DB_PASSWORD` | Any password — letters + numbers only (e.g. `ShopEasy2024Strong`) |
| `STRIPE_SECRET_KEY` | Stripe test secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key (`pk_test_...`) |
| `PAGERDUTY_INTEGRATION_KEY` | PagerDuty Events API v2 integration key |

### Deploy

1. Go to **Actions** → **🚀 Deploy Shop Easy**
2. Click **Run workflow** → select `deploy`
3. Wait ~15 min → get ALB URL in the summary ✅

### What happens automatically:
```
Step 1: Creates S3 bucket for Terraform state
Step 2: Provisions AWS infra (VPC, ALB, ECS, RDS, ECR, Cloud Map, CloudWatch)
Step 3: Builds 5 Docker images (linux/amd64)
Step 4: Pushes images to ECR
Step 5: Runs db-init ECS task (loads schema + seed data)
Step 6: Deploys 4 services sequentially (waits for each to be stable)
Step 7: Verifies /products, /orders/stats/summary, /grafana/login
Step 8: Outputs ALB URL + Grafana URL ✅
```

### Destroy

Same workflow → select `destroy` → all resources + state bucket deleted.

---

## Run Locally

```bash
# Set Stripe test keys in .env
cat > .env << EOF
STRIPE_SECRET_KEY=sk_test_your_key
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
EOF

docker compose up --build
```

Open http://localhost:3000

- **Admin Panel:** Click Admin → Login with `admin` / `ShopEasy2026`
- **My Orders:** Click My Orders → Enter the email used during checkout
- **Grafana:** http://localhost:3001 (admin / ShopEasy2026)
- **Prometheus:** http://localhost:9090
- **Test card:** `4242 4242 4242 4242` | Any future expiry | Any CVC

---

## Test Cards (Stripe)

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Payment succeeds ✅ |
| `4000 0000 0000 0002` | Card declined ❌ |
| `4000 0000 0000 9995` | Insufficient funds ❌ |
| `4000 0000 0000 0069` | Expired card ❌ |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Recharts, Stripe Elements, Nginx |
| Backend | Node.js, Express, Stripe SDK, prom-client |
| Database | MySQL 8.0 (RDS) |
| Caching | Redis 7 (Alpine) — product & category listings |
| Payments | Stripe (test mode) |
| Code Quality | SonarCloud (SAST, bugs, code smells, security) |
| Charts | Recharts (admin panel), Grafana (observability) |
| Metrics | Prometheus |
| Alerting | PagerDuty (via Grafana Unified Alerting) |
| Icons | Icons8 Fluency (CDN) |
| Monitoring | CloudWatch + Grafana + Prometheus |
| Containers | Docker, ECS Fargate |
| Networking | VPC, ALB, NAT Gateway, ECS Service Connect (Cloud Map) |
| Registry | Amazon ECR |
| State | S3 (auto-created) |
| IaC | Terraform |
| CI/CD | GitHub Actions |

---

## Project Structure

```
shop-easy/
├── frontend/              # React SPA + Nginx (shop, admin, customer portal)
├── product-service/       # Products CRUD + Cart + Categories + Redis cache + Prometheus
├── order-service/         # Orders + Payments + Auth + Analytics + Prometheus metrics
├── observability-service/ # Grafana + Prometheus (single container, 2 dashboards + alerting)
├── db-init/               # DB migration container (runs once)
├── database/              # SQL schema + seed data (15 products, 11 categories)
├── terraform/             # AWS infra (VPC, ECS, RDS, ALB, Cloud Map, CloudWatch)
├── .github/workflows/
│   ├── full-deploy.yml    # 1-click deploy/destroy pipeline
│   └── sonarcloud.yml     # Code quality scan on PRs
├── sonar-project.properties # SonarCloud configuration
├── docs/                  # Architecture diagrams + documentation
├── docker-compose.yml     # Local development (6 services including Redis)
└── .env                   # Local Stripe keys (gitignored)
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `categories` | Category name, icon, image URL |
| `products` | Name, description, price, image, category, stock |
| `users` | Email, name |
| `cart_items` | User cart (user_id, product_id, quantity) |
| `orders` | Order with shipping details + status |
| `order_items` | Products in each order |
| `payments` | Payment records (amount, status, method) |

---

## API Endpoints

### Product Service (port 4001)
| Method | Path | Description |
|--------|------|-------------|
| GET | /products | List all products |
| GET | /products/:id | Get product |
| POST | /products | Create product (admin) |
| PUT | /products/:id | Update product (admin) |
| DELETE | /products/:id | Safe delete (soft-delete if has orders) |
| GET | /categories | List all categories |
| POST | /categories | Create category (admin) |
| PUT | /categories/:id | Update category (admin) |
| DELETE | /categories/:id | Delete category (admin) |
| GET | /cart/:userId | Get cart items |
| POST | /cart | Add to cart |
| DELETE | /cart/:id | Remove from cart |
| GET | /metrics | Prometheus metrics |

### Order Service (port 4002)
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/admin | Admin login |
| GET | /orders/stats/summary | Dashboard stats |
| GET | /orders/stats/timeseries | Revenue chart data (query: ?minutes=60) |
| GET | /orders/all | All orders (admin) |
| GET | /orders/by-email/:email | Customer orders |
| GET | /orders/:userId | User orders |
| POST | /orders | Create order |
| PUT | /orders/:id/status | Update order status (validates: pending/paid/failed/shipped/delivered) |
| POST | /payments/create-intent | Stripe payment intent |
| POST | /payments/confirm | Confirm payment |
| POST | /payments/failed | Log failed payment |
| GET | /metrics | Prometheus metrics |

---

## Observability

### Grafana Dashboards (at /grafana/)

**Business Overview:**
- Booking Amount (stat panel)
- Booking Count by status (stat panels)
- Revenue Over Time (time series)
- Order Status Distribution (pie chart)

**Infrastructure & ECS:**
- Service UP/DOWN (stat panels)
- HTTP Request Rate (time series)
- P95 Response Time (time series)
- Error Rate (time series)
- CPU & Memory (gauges)

### Prometheus Metrics

| Metric | Type | Service |
|--------|------|---------|
| `orders_created_total` | Counter | order-service |
| `orders_paid_total` | Counter | order-service |
| `orders_failed_total` | Counter | order-service |
| `payment_amount_dollars` | Histogram | order-service |
| `http_requests_total` | Counter | product-service |
| `http_duration_seconds` | Histogram | product-service |

### PagerDuty Alert Rule
- **Condition:** `orders_failed_total > 5` over 5 minutes
- **Action:** Triggers PagerDuty incident via Events API v2

---

## User Flow

1. **Browse** — Hero banner → Category strip → Product grid with search
2. **Filter** — Click category or search by name/category
3. **View** — Click product → Modal with details, ratings, reviews
4. **Cart** — Add items, view cart, proceed to checkout
5. **Pay** — Fill shipping details + Stripe card → Payment processed
6. **Track** — My Orders → Email login → Order progress tracker + receipts
7. **Admin** — Login → Dashboard → Manage products, categories, orders
8. **Monitor** — Grafana dashboards → Real-time metrics + PagerDuty alerts

---

## Default Categories

Mobile, Laptop, Television, Earpods, Kitchen, Accessories, Cameras, Fans, Grooming, Storage, Air Conditioners (11 total — manageable from admin panel)

---

## Cost (~$97/month)

| Resource | Cost |
|----------|------|
| ECS Fargate (4 tasks × 0.25vCPU/512MB) | ~$33 |
| NAT Gateway | ~$32 |
| RDS db.t3.micro | ~$15 |
| ALB | ~$16 |
| ECR + S3 | ~$1 |
| **Total** | **~$97/month** |

---

## Monitoring (CloudWatch + Grafana)

### CloudWatch Dashboard
Auto-provisioned via Terraform:
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=shop-easy-orders
```

### Grafana
Accessible at `http://<ALB_DNS>/grafana/` (admin / ShopEasy2026)

### Structured Log Events

| Event | Trigger | Fields |
|-------|---------|--------|
| `ORDER_PENDING` | Order created | order_id, user_id, amount, customer, email, reason |
| `ORDER_BOOKED` | Payment succeeded | order_id, user_id, amount, customer, email, reason |
| `ORDER_FAILED` | Payment failed | order_id, user_id, amount, reason, stripe_status |
| `ORDER_ERROR` | Exception | order_id, error |

---

## Redis Cache

Product Service uses Redis for high-performance caching, reducing database load by up to 90%.

### Cache Strategy

| Endpoint | Cache Key | TTL | Invalidation |
|----------|-----------|-----|---------------|
| `GET /products` | `products:all` | 5 min | On create/update/delete product |
| `GET /products/:id` | `products:{id}` | 10 min | On update/delete that product |
| `GET /categories` | `categories:all` | 15 min | On create/update/delete category |
| `GET /cart/:userId` | No cache | — | Cart changes too frequently |

### Cache Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /cache/stats` | View hit/miss ratio, total keys |
| `DELETE /cache/flush` | Manually clear all cache (admin) |

### How It Works

```
Request → Check Redis → HIT? → Return cached data (fast, no DB query)
                       → MISS? → Query MySQL → Store in Redis → Return data
```

### Configuration

| Setting | Value |
|---------|-------|
| Image | `redis:7-alpine` (~30 MB) |
| Max Memory | 128 MB |
| Eviction Policy | `allkeys-lru` (removes least recently used) |
| Persistence | AOF (append-only file) |
| Failover | Graceful — app works even if Redis is down |

---

## SonarCloud (Code Quality & Security)

Automated code analysis runs on every Pull Request to `main`.

### How SonarCloud Scan Works

```
Developer opens/updates PR to main
        ↓
GitHub Actions triggers sonarcloud.yml
        ↓
┌─────────────────────────────────────────────────┐
│  1. Checkout code (full git history)            │
│  2. Install dependencies (all 3 services)       │
│  3. SonarCloud scanner analyzes source code     │
│  4. Checks for bugs, vulnerabilities, smells    │
│  5. Results uploaded to SonarCloud dashboard    │
│  6. Quality Gate pass/fail reported on PR       │
└─────────────────────────────────────────────────┘
        ↓
PR gets ✅ (pass) or ❌ (fail) status check
Merge blocked until Quality Gate passes
```

### What SonarCloud Detects

| Category | Examples |
|----------|----------|
| 🐛 Bugs | Null dereferences, logic errors, unreachable code |
| 🔒 Vulnerabilities | SQL injection, XSS, hardcoded credentials |
| 🦨 Code Smells | Long methods, duplicated code, high complexity |
| 📊 Duplications | Copy-pasted code blocks |
| 📏 Maintainability | Technical debt estimation |

### Services Scanned

| Service | Path |
|---------|------|
| Frontend | `frontend/src/` |
| Product Service | `product-service/` |
| Order Service | `order-service/` |

### Quality Gate (Merge Blocker)

PR cannot be merged if:
- New bugs introduced
- Security rating drops below A
- Code duplication > 3%
- Maintainability rating drops below A

### Dashboard

View results: [SonarCloud — Shop Easy](https://sonarcloud.io/project/overview?id=aniljadhavmca_shop-easy)

### Setup

| Secret | Where to Add |
|--------|-------------|
| `SONAR_TOKEN` | GitHub → Settings → Secrets → Actions |

---

## Security

- ECS tasks in **private subnets** — no public IPs
- RDS in **private subnets** (`publicly_accessible = false`)
- NAT Gateway provides outbound-only internet access (ECR pulls, Stripe API)
- ALB is the only internet-facing resource (public subnets, port 80)
- ECS security group allows inbound only from ALB
- **Request body size limit** — 1MB max on all endpoints
- **Input validation** — Order status whitelist (pending/paid/failed/shipped/delivered)
- **Input sanitization** — All user inputs trimmed and length-capped
- **Safe product delete** — Soft-delete (stock=0) if product has order history
- Admin panel protected by username/password authentication
- DB password stored as GitHub Secret — never in code
- Stripe keys stored as GitHub Secrets — never in code
- Terraform state encrypted in S3 with versioning
- Stripe test mode — no real charges
- **DB connection hardening** — 30s connect timeout + keepAlive enabled
- **SonarCloud** — Automated security scanning on every PR

---

## Credits

© 2026 ShopEasy. Proudly built by **Anil Jadhav**
