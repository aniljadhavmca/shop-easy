# Shop Easy - E-Commerce Microservices

## Architecture

```
                    ┌─────────────┐
                    │   Frontend  │
                    │   (React)   │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │     ALB     │
                    └──────┬──────┘
         ┌─────────┬──────┴──────┬──────────┐
         │         │             │          │
    ┌────┴───┐ ┌───┴────┐ ┌─────┴──┐ ┌─────┴───┐
    │Product │ │  Cart  │ │ Order  │ │Payment │
    │Service │ │Service │ │Service │ │Service │
    └────┬───┘ └───┬────┘ └────┬───┘ └────┬────┘
         └─────────┴───────────┴───────────┘
                           │
                    ┌──────┴──────┐
                    │  MySQL RDS  │
                    └─────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React SPA |
| Product Service | 4001 | Product CRUD |
| Cart Service | 4002 | Cart management |
| Order Service | 4003 | Order processing |
| Payment Service | 4004 | Payment handling |

## Quick Start (Local Development)

```bash
docker-compose up --build
```

Open http://localhost:3000

## Deploy to AWS (Production)

👉 **See [DEPLOYMENT.md](DEPLOYMENT.md) for complete step-by-step guide** — covers:

1. Creating AWS account & IAM user
2. Configuring AWS CLI credentials
3. Terraform infrastructure provisioning
4. Database initialization
5. Building & pushing Docker images to ECR
6. ECS Fargate deployment
7. GitHub Actions CI/CD setup (1-click deploy)

## Tech Stack

- **Frontend:** React, Nginx
- **Backend:** Node.js, Express
- **Database:** MySQL 8.0 (AWS RDS)
- **Infra:** ECS Fargate, ALB, VPC, ECR
- **IaC:** Terraform
- **CI/CD:** GitHub Actions
