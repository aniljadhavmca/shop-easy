# Shop Easy - Complete Deployment Guide

> Tested and verified. Follow exactly as written.

---

## Prerequisites

| Tool | Install Command | Verify |
|------|----------------|--------|
| Docker Desktop | `arch -arm64 brew install --cask docker` | Open Docker app → engine shows "running" |
| Terraform | `brew install hashicorp/tap/terraform` | `terraform --version` |
| AWS CLI v2 | `brew install awscli` | `aws --version` |
| Git | Already on macOS | `git --version` |

---

## Part A: Run Locally (No AWS needed)

### 1. Start Docker Desktop

Open Docker Desktop from Applications → wait for whale 🐳 icon → ensure **Docker Engine is running** (click Start if stopped).

### 2. Run the app

```bash
cd /path/to/shop-easy
docker compose up --build
```

### 3. Open in browser

http://localhost:3000

### 4. To reset data (reload fresh products)

```bash
docker compose down -v
docker compose up --build
```

---

## Part B: Deploy to AWS (Production on ECS Fargate)

---

### Step 1: Create AWS Account

> Skip if you already have a personal AWS account.

1. Go to https://aws.amazon.com → **Create an AWS Account**
2. Enter email, password, account name
3. Choose **Personal** account type
4. Add payment method (credit/debit card)
5. Complete phone verification
6. Select **Basic Support (Free)**
7. Sign in to AWS Console

---

### Step 2: Create IAM User with Access Keys

1. AWS Console → search **IAM** → open it
2. Left sidebar → **Users** → **Create user**
3. User name: `shop-easy-deployer`
4. Click **Next**
5. Select **Attach policies directly**
6. Search and check: `AdministratorAccess`
7. Click **Next** → **Create user**
8. Click on user name `shop-easy-deployer`
9. **Security credentials** tab → scroll to **Access keys** → **Create access key**
10. Select **Command Line Interface (CLI)** → check box → **Next** → **Create access key**
11. **⚠️ Copy BOTH keys now — secret won't be shown again!**

---

### Step 3: Configure AWS CLI

Use a named profile to keep separate from any existing credentials:

```bash
aws configure --profile shop-easy
```

```
AWS Access Key ID [None]: <paste-your-access-key>
AWS Secret Access Key [None]: <paste-your-secret-key>
Default region name [None]: us-east-1
Default output format [None]: json
```

Verify:
```bash
aws sts get-caller-identity --profile shop-easy
```

Set as default for terminal session:
```bash
export AWS_PROFILE=shop-easy
```

---

### Step 4: Provision Infrastructure with Terraform

```bash
cd /path/to/shop-easy/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
region      = "us-east-1"
project     = "shop-easy"
db_password = "YourStr0ng#Pass2024"
aws_profile = "shop-easy"
```

Run:
```bash
terraform init
terraform plan      # Preview (~50 resources)
terraform apply     # Type "yes" — takes 10-15 min
```

Save the output:
```
alb_dns = "shop-easy-alb-xxxxx.us-east-1.elb.amazonaws.com"
```

---

### Step 5: Initialize the Database

1. AWS Console → **RDS** → `shop-easy-db` → **Modify** → set **Publicly accessible** = Yes
2. Go to security group `shop-easy-rds-sg` → Add inbound rule: MySQL 3306, Source: My IP
3. Apply immediately, then:

```bash
# Install mysql client if needed
brew install mysql-client
export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"

# Get RDS endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances --profile shop-easy \
  --db-instance-identifier shop-easy-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)

# Load schema
mysql -h $RDS_ENDPOINT -u admin -p shop_easy < ../database/schema.sql
```

**⚠️ After loading — revert public access and remove your IP from security group.**

---

### Step 6: Build and Push Docker Images to ECR

> **IMPORTANT:** Must use `--platform linux/amd64 --provenance=false` on Apple Silicon Macs.
> ECS Fargate runs linux/amd64. Without these flags, images won't work.

```bash
cd /path/to/shop-easy
export AWS_PROFILE=shop-easy
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1

# Login to ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build and push ALL services (amd64 for ECS)
for svc in product-service cart-service order-service payment-service frontend; do
  echo "🔨 Building $svc..."
  docker build --platform linux/amd64 --provenance=false \
    -t $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/shop-easy/$svc:latest ./$svc
  echo "📤 Pushing $svc..."
  docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/shop-easy/$svc:latest
done
echo "✅ All images pushed!"
```

---

### Step 7: Deploy to ECS

```bash
for svc in product-service cart-service order-service payment-service frontend; do
  aws ecs update-service --cluster shop-easy-cluster --service $svc --force-new-deployment
done

echo "⏳ Waiting for services (~2-3 min)..."
aws ecs wait services-stable --cluster shop-easy-cluster \
  --services product-service cart-service order-service payment-service frontend
echo "✅ All services running!"
```

---

### Step 8: Verify

```bash
ALB_URL=$(aws elbv2 describe-load-balancers --names shop-easy-alb \
  --query 'LoadBalancers[0].DNSName' --output text)
echo "🚀 App: http://$ALB_URL"
curl http://$ALB_URL/products
```

Open `http://<ALB_URL>` in browser.

---

### Step 9: Setup GitHub Actions (1-Click Deploy)

#### 9a. Create OIDC Provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

#### 9b. Create IAM Role

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/github-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:<YOUR_GITHUB_USER>/shop-easy:*" }
    }
  }]
}
EOF

aws iam create-role --role-name shop-easy-github-actions \
  --assume-role-policy-document file:///tmp/github-trust-policy.json

aws iam attach-role-policy --role-name shop-easy-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess
aws iam attach-role-policy --role-name shop-easy-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
```

#### 9c. Add GitHub Secret

1. Go to your repo → Settings → Secrets and variables → Actions
2. New secret: `AWS_ROLE_ARN` = `arn:aws:iam::<ACCOUNT_ID>:role/shop-easy-github-actions`

#### 9d. Deploy

Push to `main` or go to Actions → Run workflow manually.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm ci` fails in Docker | Dockerfiles use `npm install --omit=dev` (no package-lock.json needed) |
| Terraform `;` syntax errors | Use multi-line blocks, not single-line with semicolons |
| Docker Engine stopped | Open Docker Desktop → click Start |
| `docker: command not found` | Open Docker Desktop first, wait for engine |
| ECS: `image Manifest does not contain descriptor matching platform linux/amd64` | Rebuild with `--platform linux/amd64 --provenance=false` |
| ECS: `CannotPullContainerError: not found` | Images not pushed to ECR yet — run Step 6 |
| ALB shows 503 | ECS tasks not running — check ECR has images, then force redeploy |
| `ExpiredTokenException` | Refresh credentials: `aws configure --profile shop-easy` |
| DNS errors during terraform | Intermittent — retry `terraform apply` |
| Sandbox/lab account abuse warning | Use personal AWS account — labs limit Fargate tasks |

---

## Cleanup

```bash
cd /path/to/shop-easy/terraform
export AWS_PROFILE=shop-easy
terraform destroy    # Type "yes"
```

---

## Cost Estimate

| Resource | Monthly |
|----------|---------|
| ECS Fargate (5 services × 1 task) | ~$25 |
| RDS db.t3.micro | ~$15 |
| NAT Gateway | ~$32 |
| ALB | ~$16 |
| ECR storage | ~$1 |
| **Total** | **~$89/month** |

> Run `terraform destroy` when not using to avoid charges.
