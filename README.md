# 🛍️ Shop Easy — E-Commerce Microservices

> Lightweight microservices e-commerce app on AWS ECS Fargate with Stripe payments. 1-click deploy via GitHub Actions.

---

## Architecture

![Shop Easy Architecture](https://raw.githubusercontent.com/aniljadhavmca/shop-easy/feature/stripe-monitoring/docs/AWS_ECS_Microservices_Architecture.png)

### Live Demo Screenshot

![Shop Easy Screenshot](https://raw.githubusercontent.com/aniljadhavmca/shop-easy/feature/stripe-monitoring/docs/livedemo.png)

### End-to-End Flow

```
Developer → git push → GitHub Actions → Build Docker → Push ECR → Deploy ECS
                                                                        ↓
User → Browser → ALB (port 80) → path-based routing:
                                    /products*  → Product Service (ECS)
                                    /cart*      → Product Service (ECS)
                                    /orders*    → Order Service (ECS)
                                    /payments*  → Order Service (ECS) → Stripe API
                                    /*          → Frontend (ECS/Nginx)
                                                        ↓
                                    All services → MySQL RDS (private)
```

---

## Services (3 Fargate Tasks)

| Service | Port | Handles | Tech |
|---------|------|---------|------|
| Frontend | 80 | UI — browse, cart, checkout, Stripe card form | React + Stripe Elements + Nginx |
| Product Service | 4001 | Products + Cart | Node.js/Express |
| Order Service | 4002 | Orders + Stripe Payments | Node.js/Express + Stripe SDK |

---

## 1-Click Deploy to AWS

### Prerequisites
- AWS account with `AdministratorAccess` IAM user
- GitHub repo forked/cloned

### Setup (once)

Add **5 secrets** to your GitHub repo → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Your IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret key |
| `DB_PASSWORD` | Any password — letters + numbers only (e.g. `ShopEasy2024Strong`) |
| `STRIPE_SECRET_KEY` | Stripe test secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key (`pk_test_...`) |

### Deploy

1. Go to **Actions** → **🚀 Deploy Shop Easy**
2. Click **Run workflow** → select `deploy`
3. Wait ~15 min → get ALB URL in the summary ✅

### What happens automatically:
```
Step 1: Creates S3 bucket for Terraform state
Step 2: Provisions AWS infra (VPC, ALB, ECS, RDS, ECR, CloudWatch Dashboard)
Step 3: Builds Docker images (linux/amd64)
Step 4: Pushes images to ECR
Step 5: Runs db-init ECS task (loads schema + seed data)
Step 6: Deploys 3 services to ECS Fargate
Step 7: Waits for healthy deployment
Step 8: Outputs ALB URL + Dashboard URL ✅
```

### Destroy

Same workflow → select `destroy` → all resources + state bucket deleted.

---

## Run Locally

```bash
# Set Stripe test keys
export STRIPE_SECRET_KEY=sk_test_your_key
export REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_key

docker compose up --build
```

Open http://localhost:3000

Test card: `4242 4242 4242 4242` | Any future expiry | Any CVC

---

## Test Cards (Stripe)

| Card Number | Result | Dashboard Panel |
|-------------|--------|-----------------|
| `4242 4242 4242 4242` | Payment succeeds | ✅ Orders Booked |
| `4000 0000 0000 0002` | Card declined | ❌ Orders Failed |
| `4000 0000 0000 9995` | Insufficient funds | ❌ Orders Failed |
| `4000 0000 0000 0069` | Expired card | ❌ Orders Failed |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Stripe Elements, Nginx |
| Backend | Node.js, Express, Stripe SDK |
| Database | MySQL 8.0 (RDS) |
| Payments | Stripe (test mode) |
| Monitoring | CloudWatch Dashboard + Logs Insights |
| Containers | Docker, ECS Fargate |
| Networking | VPC, ALB (no NAT) |
| Registry | Amazon ECR |
| State | S3 (auto-created) |
| IaC | Terraform |
| CI/CD | GitHub Actions |

---

## Project Structure

```
shop-easy/
├── frontend/           # React SPA + Nginx
├── product-service/    # Products + Cart API
├── order-service/      # Orders + Payments API (structured logging)
├── db-init/            # DB migration container (runs once)
├── database/           # SQL schema + seed data
├── terraform/          # AWS infra (VPC, ECS, RDS, ALB, CloudWatch)
├── .github/workflows/  # 1-click CI/CD pipeline
├── docs/               # Architecture diagrams
├── docker-compose.yml  # Local development
└── DEPLOYMENT.md       # Manual deployment guide
```

---

## User Flow

1. **Browse Products** — View products with images, prices, category filters
2. **Add to Cart** — Click "Add to Cart", badge updates
3. **View Cart** — See items, quantities, total
4. **Checkout** — Fill shipping details, enter card via Stripe
5. **Payment** — Stripe processes card, order marked "paid"
6. **Orders** — View past orders with status

---

## Cost (~$57/month)

| Resource | Cost |
|----------|------|
| ECS Fargate (3 tasks) | ~$25 |
| RDS db.t3.micro | ~$15 |
| ALB | ~$16 |
| ECR + S3 | ~$1 |
| **Total** | **~$57/month** |

> No NAT Gateway = saves $32/month vs typical setups.

---

## Monitoring (CloudWatch Dashboard)

Auto-provisioned via Terraform — accessible at:
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=shop-easy-orders
```

![Sales Dashboard](https://raw.githubusercontent.com/aniljadhavmca/shop-easy/feature/stripe-monitoring/docs/dashboard.png)

### Dashboard Panels

| Panel | Type | Shows |
|-------|------|-------|
| ✅ Orders Booked | Counter | Total successful payments |
| ❌ Orders Failed | Counter | Total failed payments |
| ⏳ Orders Pending | Counter | Orders awaiting payment |
| 💰 Revenue Received | Counter | Total $ from paid orders |
| 📊 Orders Over Time | Line chart | Booked vs Failed vs Pending (5min bins) |
| 💰 Revenue Over Time | Bar chart | Hourly revenue |
| 📋 Recent Events | Table | Last 50 order events with details |

> Use CloudWatch time range selector (1h, 3h, 12h, 1d, 1w) to filter all panels.

### Structured Log Events

| Event | Trigger | Fields |
|-------|---------|--------|
| `ORDER_PENDING` | Order created | order_id, user_id, amount, customer, email, reason |
| `ORDER_BOOKED` | Payment succeeded | order_id, user_id, amount, customer, email, reason |
| `ORDER_FAILED` | Payment failed | order_id, user_id, amount, reason, stripe_status |
| `ORDER_ERROR` | Exception | order_id, error |

---

## Security

- RDS is **private** (`publicly_accessible = false`) — only ECS can reach it
- ECS tasks in public subnets with security group locked to ALB traffic only
- DB password stored as GitHub Secret — never in code
- Stripe keys stored as GitHub Secrets — never in code
- Terraform state encrypted in S3 with versioning
- Stripe test mode — no real charges
