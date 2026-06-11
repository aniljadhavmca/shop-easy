# Deployment Guide

## Technologies Used

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Nginx |
| Backend | Node.js 18, Express |
| Database | MySQL 8.0 (AWS RDS) |
| Payments | Stripe (test mode) |
| Monitoring | CloudWatch Dashboard + Logs Insights |
| Containers | Docker, AWS ECS Fargate |
| Load Balancer | AWS ALB (Application Load Balancer) |
| Container Registry | Amazon ECR |
| Infrastructure | Terraform (IaC) |
| CI/CD | GitHub Actions |
| State Storage | AWS S3 (auto-created) |

---

## Prerequisites

### For Local Development
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git

### For AWS Deployment (1-Click)
- AWS account with **AdministratorAccess** IAM user
- GitHub account (to fork/clone this repo)

### For Manual AWS Deployment
- All of the above, plus:
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) (v1.5+)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for building images)

---

## ⚠️ Important: DB Password Rules

The `DB_PASSWORD` secret must follow these rules:

- ✅ Letters (a-z, A-Z)
- ✅ Numbers (0-9)
- ❌ No `/` (slash)
- ❌ No `@` (at sign)
- ❌ No `"` (double quote)
- ❌ No `#` (hash)
- ❌ No spaces
- ❌ No special characters

**Good examples:**
```
ShopEasy2024Strong
MyPassword123Safe
Demo2024Pass
```

**Bad examples:**
```
MyPass#2024      ← has #
Shop@Easy!       ← has @ and !
Pass/word        ← has /
```

---

## Option 1: 1-Click Deploy (Recommended)

> Add credentials → Click deploy → App is live. No manual AWS setup needed.

### Step 1: Create AWS IAM User

1. Sign in to [AWS Console](https://console.aws.amazon.com)
2. Go to **IAM** → **Users** → **Create user**
3. Name: `shop-easy-deployer`
4. Click **Next** → **Attach policies directly**
5. Check `AdministratorAccess`
6. Click **Next** → **Create user**
7. Click on the user → **Security credentials** tab
8. **Create access key** → select **Command Line Interface (CLI)**
9. Check the confirmation → **Next** → **Create access key**
10. **Copy both keys** (you won't see the secret again)

### Step 2: Add 5 GitHub Secrets

Go to: `https://github.com/<your-user>/shop-easy/settings/secrets/actions`

> ⚠️ Must be **Repository secrets** (NOT Environment secrets)

Click **New repository secret** for each:

| Secret Name | Value |
|-------------|-------|
| `AWS_ACCESS_KEY_ID` | Your access key (starts with `AKIA...`) |
| `AWS_SECRET_ACCESS_KEY` | Your secret key |
| `DB_PASSWORD` | Letters + numbers only (see rules above) |
| `STRIPE_SECRET_KEY` | Stripe test secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key (`pk_test_...`) |

### Step 3: Deploy

1. Go to **Actions** tab in your repo
2. Click **🚀 Deploy Shop Easy**
3. Click **Run workflow** → select `deploy` → click **Run workflow**
4. Wait ~15 minutes
5. Check workflow summary → **App URL** will be there ✅

### What happens automatically:
```
Step 1: Creates S3 bucket for Terraform state
Step 2: Provisions AWS infra (VPC, ALB, ECS, RDS, ECR, CloudWatch Dashboard)
Step 3: Builds Docker images (linux/amd64, no cache)
Step 4: Pushes images to ECR
Step 5: Runs db-init ECS task (loads schema + seed data)
Step 6: Deploys 3 services to ECS Fargate
Step 7: Waits for healthy deployment
Step 8: Outputs ALB URL + Dashboard URL ✅
```

### Step 4: Destroy (when done)

Same workflow → select `destroy` → Run. Deletes all resources + state bucket.

---

## Option 2: Run Locally

No AWS account needed. Just Docker.

```bash
git clone https://github.com/aniljadhavmca/shop-easy.git
cd shop-easy

# Set Stripe keys (get from https://dashboard.stripe.com/test/apikeys)
export STRIPE_SECRET_KEY=sk_test_your_key
export REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_key

docker compose up --build
```

Open http://localhost:3000

Test card: `4242 4242 4242 4242` | Any future expiry | Any CVC

### Test Cards (Stripe)

| Card Number | Result | Dashboard Panel |
|-------------|--------|-----------------|
| `4242 4242 4242 4242` | Payment succeeds | ✅ Orders Booked |
| `4000 0000 0000 0002` | Card declined | ❌ Orders Failed |
| `4000 0000 0000 9995` | Insufficient funds | ❌ Orders Failed |
| `4000 0000 0000 0069` | Expired card | ❌ Orders Failed |

Reset data:
```bash
docker compose down -v
docker compose up --build
```

---

## Option 3: Manual CLI Deploy

```bash
# 1. Configure AWS
aws configure --profile shop-easy

# 2. Create state bucket
export AWS_PROFILE=shop-easy
aws s3 mb s3://shop-easy-tf-state-bucket --region us-east-1

# 3. Provision infrastructure (~15 min)
cd terraform
terraform init
terraform apply -var="db_password=ShopEasy2024Strong"

# 4. Build & push images
AWS_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ID.dkr.ecr.us-east-1.amazonaws.com

cd ..
for svc in product-service order-service frontend db-init; do
  docker build --platform linux/amd64 --provenance=false --no-cache \
    -t $AWS_ID.dkr.ecr.us-east-1.amazonaws.com/shop-easy/$svc:latest ./$svc
  docker push $AWS_ID.dkr.ecr.us-east-1.amazonaws.com/shop-easy/$svc:latest
done

# 5. Run DB migration
SUBNET=$(aws ec2 describe-subnets --filters Name=tag:Name,Values=shop-easy-private-1 --query 'Subnets[0].SubnetId' --output text)
SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=shop-easy-ecs-sg --query 'SecurityGroups[0].GroupId' --output text)
aws ecs run-task --cluster shop-easy-cluster --task-definition shop-easy-db-init \
  --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=DISABLED}"

# 6. Deploy services
aws ecs update-service --cluster shop-easy-cluster --service product-service --force-new-deployment
aws ecs update-service --cluster shop-easy-cluster --service order-service --force-new-deployment
aws ecs update-service --cluster shop-easy-cluster --service frontend --force-new-deployment

# 7. Wait & get URL
aws ecs wait services-stable --cluster shop-easy-cluster --services product-service order-service frontend
aws elbv2 describe-load-balancers --names shop-easy-alb --query 'LoadBalancers[0].DNSName' --output text
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Credentials could not be loaded" | Secrets must be **Repository secrets**, not Environment secrets |
| "MasterUserPassword is not valid" | DB_PASSWORD has special chars — use letters + numbers only |
| "Unknown column shipping_name" | DB migration didn't run — re-run workflow to trigger db-init |
| ECS "platform linux/amd64 not found" | Fixed: builds use `--platform linux/amd64 --provenance=false` |
| ALB returns 503 | Services starting — wait 2-3 min or check ECS console |
| Products not loading | DB schema not loaded — check db-init task in ECS logs |
| S3 bucket already exists | Change bucket name in `terraform/backend.tf` and workflow |
| Old code deployed | Fixed: builds use `--no-cache` for fresh images |
| Sandbox/lab gets deleted | Use a personal AWS account — labs have resource limits |

---

## Architecture Decisions

| Decision | Reason |
|----------|--------|
| 3 services (not 4-5) | Fewer Fargate tasks, lower cost, stays under sandbox limits |
| NAT Gateway | ECS in private subnets — proper security, no public IPs on services |
| ECS in private subnets | No direct internet exposure — outbound via NAT only |
| RDS private | Secure — only ECS security group can access port 3306 |
| DB init via ECS task | Schema loaded internally — no need to expose RDS publicly |
| S3 state auto-created | Zero manual prerequisites — truly 1-click |
| INSERT IGNORE in schema | Idempotent — safe to re-deploy without duplicating data |
| ALTER TABLE migration | Handles schema changes on existing databases |
| --no-cache builds | Ensures fresh code deployed every time |
| CloudWatch Logs Insights | Splunk-style dashboard — no extra infra, queries existing logs |
| Structured JSON logs | Enables metric extraction without custom CloudWatch metrics |

---

## Monitoring

After deployment, a CloudWatch Dashboard is auto-created:

```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=shop-easy-orders
```

### Dashboard Panels

| Panel | What it shows |
|-------|---------------|
| ✅ Orders Booked | Count of successful payments |
| ❌ Orders Failed | Count of failed payments |
| ⏳ Orders Pending | Count of orders awaiting payment |
| 💰 Revenue Received | Total $ received from successful orders |
| 📊 Orders Over Time | Line chart — booked vs failed vs pending |
| 💰 Revenue Over Time | Bar chart — hourly revenue |
| 📋 Recent Events | Table — last 50 order events |

### Time Filtering

Use CloudWatch's built-in time range selector at the top of the dashboard:
- 1 hour, 3 hours, 12 hours, 1 day, 3 days, 1 week, custom

### Log Events

The order-service emits structured JSON logs:

```json
{"timestamp":"2024-...","event":"ORDER_BOOKED","order_id":1,"user_id":"u1","amount":999.99,"customer":"John Doe","email":"john@test.com","reason":"Payment successful"}
{"timestamp":"2024-...","event":"ORDER_FAILED","order_id":2,"user_id":"u1","amount":49.99,"reason":"Your card's security code is incorrect","stripe_status":"requires_payment_method"}
{"timestamp":"2024-...","event":"ORDER_PENDING","order_id":3,"user_id":"u1","amount":149.99,"customer":"Jane Doe","email":"jane@test.com","reason":"Awaiting payment"}
```

These are queryable via CloudWatch Logs Insights:
```
SOURCE '/ecs/shop-easy' | filter @message like /ORDER_BOOKED/ | parse @message /"amount":(?<amt>[\d.]+)/ | stats sum(amt) as Revenue by bin(1h)
```

---

## Cost: ~$89/month

| Resource | Monthly |
|----------|---------|
| ECS Fargate (3 × 0.25 vCPU, 512MB) | ~$25 |
| NAT Gateway | ~$32 |
| RDS db.t3.micro | ~$15 |
| ALB | ~$16 |
| ECR + S3 | ~$1 |
| **Total** | **~$89** |

> 💡 Run the `destroy` action when not using to stop all charges.
