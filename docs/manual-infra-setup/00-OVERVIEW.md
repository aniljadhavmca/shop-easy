# 🏗️ Shop Easy — Manual Infrastructure Setup Guide

> Step-by-step guide to manually create all AWS infrastructure for Shop Easy e-commerce application via AWS Console.

---

## Architecture Overview

```
Internet
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  VPC (10.0.0.0/16)                                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Public Subnets (10.0.1.0/24, 10.0.2.0/24)         │    │
│  │  ┌─────────┐  ┌──────────────┐                     │    │
│  │  │   ALB   │  │ NAT Gateway  │                     │    │
│  │  └─────────┘  └──────────────┘                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Private Subnets (10.0.10.0/24, 10.0.11.0/24)      │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │    │
│  │  │ Frontend │ │ Product  │ │  Order   │ │Observ.│ │    │
│  │  │  :80     │ │  :4001   │ │  :4002   │ │ :3000 │ │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └───────┘ │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────────┐   │    │
│  │  │  RDS MySQL 8.0 (db.t3.micro)                 │   │    │
│  │  └──────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Steps (Follow in Order)

| Step | Document | What You'll Create |
|------|----------|-------------------|
| 1 | [01-VPC-NETWORKING.md](./01-VPC-NETWORKING.md) | VPC, Subnets, Internet Gateway, NAT Gateway, Route Tables |
| 2 | [02-SECURITY-GROUPS.md](./02-SECURITY-GROUPS.md) | ALB SG, ECS SG, RDS SG |
| 3 | [03-RDS-DATABASE.md](./03-RDS-DATABASE.md) | MySQL RDS instance, Subnet Group |
| 4 | [04-ECR-REPOSITORIES.md](./04-ECR-REPOSITORIES.md) | 5 ECR repos for Docker images |
| 5 | [05-IAM-ROLES.md](./05-IAM-ROLES.md) | ECS Execution Role, ECS Task Role |
| 6 | [06-ALB-LOAD-BALANCER.md](./06-ALB-LOAD-BALANCER.md) | ALB, Target Groups, Listener Rules |
| 7 | [07-ECS-CLUSTER.md](./07-ECS-CLUSTER.md) | ECS Cluster, Cloud Map Namespace |
| 8 | [08-BUILD-PUSH-IMAGES.md](./08-BUILD-PUSH-IMAGES.md) | Build Docker images & push to ECR |
| 9 | [09-ECS-TASK-DEFINITIONS.md](./09-ECS-TASK-DEFINITIONS.md) | Task Definitions for all 5 services |
| 10 | [10-ECS-SERVICES.md](./10-ECS-SERVICES.md) | ECS Services deployment |
| 11 | [11-DB-MIGRATION.md](./11-DB-MIGRATION.md) | Run db-init task to load schema |
| 12 | [12-VERIFICATION.md](./12-VERIFICATION.md) | Verify all endpoints are working |
| 13 | [13-CLOUDWATCH-DASHBOARD.md](./13-CLOUDWATCH-DASHBOARD.md) | CloudWatch dashboard for monitoring |
| 14 | [14-CLEANUP.md](./14-CLEANUP.md) | Destroy all resources |

---

## Prerequisites

- AWS Account with `AdministratorAccess` (or equivalent permissions)
- AWS CLI v2 installed and configured (`aws configure`)
- Docker Desktop installed (for building images)
- Stripe test keys (get from https://dashboard.stripe.com/test/apikeys)
- PagerDuty integration key (optional — for alerting)

---

## Naming Convention

All resources use prefix: `shop-easy-`

| Resource | Name |
|----------|------|
| VPC | shop-easy-vpc |
| Subnets | shop-easy-public-1, shop-easy-public-2, shop-easy-private-1, shop-easy-private-2 |
| ALB | shop-easy-alb |
| ECS Cluster | shop-easy-cluster |
| RDS | shop-easy-db |
| ECR Repos | shop-easy/product-service, shop-easy/order-service, etc. |

---

## Region

All resources are created in **us-east-1** (N. Virginia). You can use any region — just be consistent.

---

## Estimated Time

~45-60 minutes for full manual setup (first time).

---

## Cost

~$97/month (see main README for breakdown).

---

© 2026 ShopEasy | Manual Infrastructure Guide
