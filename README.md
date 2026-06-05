# 🛍️ Shop Easy — E-Commerce Microservices

> Production-ready microservices e-commerce app deployed on AWS ECS Fargate with 1-click CI/CD.

---

## Architecture

![Shop Easy Architecture](docs/architecture.svg)

### End-to-End Flow

```
Developer → git push → GitHub Actions → Build Docker Images → Push to ECR
                                                                    ↓
User → Browser → ALB (port 80) → path-based routing:
                                    /products*  → Product Service (ECS)
                                    /cart*      → Cart Service (ECS)
                                    /orders*    → Order Service (ECS)
                                    /payments*  → Payment Service (ECS)
                                    /*          → Frontend (ECS/Nginx)
                                                        ↓
                                    All services → MySQL RDS (private subnet)
```

---

## Services

| Service | Port | Tech | Description |
|---------|------|------|-------------|
| Frontend | 80 | React + Nginx | Product browsing, cart, checkout UI |
| Product Service | 4001 | Node.js/Express | CRUD products, stock management |
| Cart Service | 4002 | Node.js/Express | Add/remove items, merge duplicates |
| Order Service | 4003 | Node.js/Express | Checkout from cart, create orders |
| Payment Service | 4004 | Node.js/Express | Process payments, update order status |

---

## Quick Start (Local)

```bash
docker compose up --build
```

Open http://localhost:3000

---

## Deploy to AWS

👉 **[DEPLOYMENT.md](DEPLOYMENT.md)** — Complete step-by-step guide:

1. ✅ Create AWS account & IAM user
2. ✅ Configure AWS CLI with named profile
3. ✅ Terraform — provision VPC, ECS, RDS, ALB, ECR (~50 resources)
4. ✅ Load database schema with sample products
5. ✅ Build & push Docker images to ECR (`--platform linux/amd64`)
6. ✅ Deploy to ECS Fargate
7. ✅ GitHub Actions — 1-click auto deploy on push to `main`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Nginx |
| Backend | Node.js, Express |
| Database | MySQL 8.0 (AWS RDS) |
| Containers | Docker, ECS Fargate |
| Networking | VPC, ALB, NAT Gateway |
| Registry | Amazon ECR |
| IaC | Terraform |
| CI/CD | GitHub Actions |

---

## Project Structure

```
shop-easy/
├── frontend/              # React SPA + Nginx
├── product-service/       # Product CRUD API
├── cart-service/          # Cart management API
├── order-service/         # Order processing API
├── payment-service/       # Payment handling API
├── database/              # SQL schema + seed data
├── terraform/             # AWS infrastructure (VPC, ECS, RDS, ALB, IAM)
├── ecs/                   # ECS task definitions
├── .github/workflows/     # CI/CD pipeline
├── docs/                  # Architecture diagrams
├── docker-compose.yml     # Local development
└── DEPLOYMENT.md          # Production deployment guide
```

---

## User Flow

1. **Browse Products** — View 10 products with images, prices, categories
2. **Add to Cart** — Click "Add to Cart", badge updates
3. **View Cart** — See items, quantities, total price
4. **Checkout** — Creates order, deducts stock, clears cart
5. **Payment** — Processes payment, marks order as "paid"
6. **Order History** — View all past orders with status
