# Shop Easy - Complete Deployment Guide

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Terraform](https://developer.hashicorp.com/terraform/downloads) installed (v1.5+)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed (v2)
- [Git](https://git-scm.com/) installed
- A personal AWS account (not your office one)

---

## Step 1: Create AWS Account (Skip if you already have one)

1. Go to https://aws.amazon.com
2. Click **Create an AWS Account**
3. Enter email, password, account name
4. Choose **Personal** account type
5. Add payment method (credit/debit card — free tier won't charge much)
6. Complete phone verification
7. Select **Basic Support (Free)** plan
8. Sign in to the AWS Console

---

## Step 2: Create IAM User with Access Keys

> Never use your root account for deployments. Create a dedicated IAM user.

1. Sign in to AWS Console → search **IAM** → click **IAM**
2. Left sidebar → **Users** → **Create user**
3. User name: `shop-easy-deployer`
4. Click **Next**
5. Select **Attach policies directly**
6. Search and check: `AdministratorAccess`
7. Click **Next** → **Create user**
8. Click on the user name `shop-easy-deployer`
9. Go to **Security credentials** tab
10. Scroll to **Access keys** → **Create access key**
11. Select **Command Line Interface (CLI)**
12. Check the confirmation box → **Next** → **Create access key**
13. **⚠️ IMPORTANT: Copy both keys NOW — you won't see the secret key again!**
    - Access Key ID: (looks like `AKIAIOSFODNN7EXAMPLE`)
    - Secret Access Key: (looks like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)
14. Click **Done**

---

## Step 3: Configure AWS CLI with New Profile

Open terminal and run:

```bash
aws configure --profile shop-easy
```

Enter the values when prompted:

```
AWS Access Key ID [None]: <paste-your-access-key-id>
AWS Secret Access Key [None]: <paste-your-secret-access-key>
Default region name [None]: us-east-1
Default output format [None]: json
```

Verify it works:

```bash
aws sts get-caller-identity --profile shop-easy
```

You should see output like:
```json
{
    "UserId": "AIDAEXAMPLEID",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/shop-easy-deployer"
}
```

Set it as default for this terminal session:

```bash
export AWS_PROFILE=shop-easy
```

> **Tip:** Add `export AWS_PROFILE=shop-easy` to your `~/.zshrc` or `~/.bashrc` if you don't want to type it every time.

---

## Step 4: Provision AWS Infrastructure with Terraform

```bash
cd /path/to/shop-easy/terraform

# Create your variables file
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your preferred editor:

```bash
nano terraform.tfvars
```

Set a strong database password:

```hcl
region      = "us-east-1"
project     = "shop-easy"
db_password = "MyStr0ng!Passw0rd#2024"
```

> **Password rules:** Min 8 chars, avoid `/`, `@`, `"`, spaces

Now run Terraform:

```bash
# Initialize terraform (downloads providers)
terraform init

# Preview what will be created
terraform plan

# Create everything (type "yes" when asked)
terraform apply
```

⏱️ This takes **10-15 minutes** (RDS is slow to create).

When done, you'll see:

```
Apply complete! Resources: 30 added, 0 changed, 0 destroyed.

Outputs:
alb_dns = "shop-easy-alb-123456789.us-east-1.elb.amazonaws.com"
```

**Save that ALB DNS — that's your app URL!**

---

## Step 5: Initialize the Database

The RDS instance is in a private subnet, so you need to connect through a bastion or temporarily allow access.

### Option A: Quick method (temporary public access)

1. Go to AWS Console → **RDS** → **Databases** → `shop-easy-db`
2. Click **Modify**
3. Under Connectivity → set **Publicly accessible** to **Yes**
4. Add your IP to the RDS security group:
   - Go to the linked security group `shop-easy-rds-sg`
   - Edit inbound rules → Add rule: MySQL/Aurora, port 3306, Source: My IP
5. Click **Apply immediately**

Then run:

```bash
# Get RDS endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances --profile shop-easy --db-instance-identifier shop-easy-db --query 'DBInstances[0].Endpoint.Address' --output text)

echo "RDS Endpoint: $RDS_ENDPOINT"

# Run the schema
mysql -h $RDS_ENDPOINT -u admin -p shop_easy < ../database/schema.sql
```

Enter your db_password when prompted.

> **⚠️ After schema is loaded, REVERT public access:**
> - Remove your IP from the security group
> - Set Publicly accessible back to No

### Option B: If you don't have mysql client installed

```bash
brew install mysql-client
export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"
```

Then run the mysql command above.

---

## Step 6: Build and Push Docker Images to ECR

```bash
cd /path/to/shop-easy

# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile shop-easy --query Account --output text)
REGION=us-east-1

echo "Account ID: $AWS_ACCOUNT_ID"

# Login to ECR
aws ecr get-login-password --region $REGION --profile shop-easy | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build and push ALL services
for svc in product-service cart-service order-service payment-service frontend; do
  echo "🔨 Building $svc..."
  docker build -t $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/shop-easy/$svc:latest ./$svc
  echo "📤 Pushing $svc..."
  docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/shop-easy/$svc:latest
done

echo "✅ All images pushed!"
```

---

## Step 7: Deploy Services on ECS

```bash
# Force ECS to pull the new images
aws ecs update-service --profile shop-easy --cluster shop-easy-cluster --service product-service --force-new-deployment
aws ecs update-service --profile shop-easy --cluster shop-easy-cluster --service cart-service --force-new-deployment
aws ecs update-service --profile shop-easy --cluster shop-easy-cluster --service order-service --force-new-deployment
aws ecs update-service --profile shop-easy --cluster shop-easy-cluster --service payment-service --force-new-deployment
aws ecs update-service --profile shop-easy --cluster shop-easy-cluster --service frontend --force-new-deployment

# Wait for all services to become stable (~2-3 minutes)
echo "⏳ Waiting for services to stabilize..."
aws ecs wait services-stable --profile shop-easy --cluster shop-easy-cluster --services product-service cart-service order-service payment-service frontend

echo "✅ All services are running!"
```

---

## Step 8: Verify Your App is Live

```bash
# Get the ALB URL
ALB_URL=$(aws elbv2 describe-load-balancers --profile shop-easy --names shop-easy-alb --query 'LoadBalancers[0].DNSName' --output text)

echo "🚀 Your app is live at: http://$ALB_URL"

# Test the product API
curl http://$ALB_URL/products
```

Open `http://<ALB_URL>` in your browser — you should see the Shop Easy storefront!

---

## Step 9: Setup GitHub Actions (1-Click Auto Deploy)

This makes it so every push to `main` automatically deploys to production.

### 9a. Create GitHub OIDC Provider in AWS

```bash
aws iam create-open-id-connect-provider --profile shop-easy \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 9b. Create IAM Role for GitHub Actions

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile shop-easy --query Account --output text)

# Create trust policy file
cat > /tmp/github-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:aniljadhavmca/shop-easy:*"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role --profile shop-easy \
  --role-name shop-easy-github-actions \
  --assume-role-policy-document file:///tmp/github-trust-policy.json

# Attach required permissions
aws iam attach-role-policy --profile shop-easy \
  --role-name shop-easy-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess

aws iam attach-role-policy --profile shop-easy \
  --role-name shop-easy-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

echo "✅ Role created: arn:aws:iam::${AWS_ACCOUNT_ID}:role/shop-easy-github-actions"
```

### 9c. Add Secret to GitHub Repository

1. Open https://github.com/aniljadhavmca/shop-easy/settings/secrets/actions
2. Click **New repository secret**
3. Fill in:
   - **Name:** `AWS_ROLE_ARN`
   - **Value:** `arn:aws:iam::<YOUR_ACCOUNT_ID>:role/shop-easy-github-actions`
   (replace `<YOUR_ACCOUNT_ID>` with your actual 12-digit account ID)
4. Click **Add secret**

### 9d. Test the Pipeline

**Option 1: Push any change**
```bash
cd /path/to/shop-easy
git add .
git commit -m "trigger deploy"
git push
```

**Option 2: Manual trigger**
1. Go to https://github.com/aniljadhavmca/shop-easy/actions
2. Click **Deploy to Production** in the left sidebar
3. Click **Run workflow** → **Run workflow**
4. Watch the green checkmarks ✅

---

## Step 10: Local Development (docker-compose)

For local development without AWS:

```bash
cd /path/to/shop-easy
docker-compose up --build
```

Open http://localhost:3000 — full app running locally with MySQL.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `terraform apply` fails on ECS service | Images must exist in ECR first. Do Step 6 before Step 7 |
| ECS tasks keep restarting | Check logs: `aws logs tail /ecs/shop-easy --profile shop-easy --follow` |
| Can't connect to RDS | Make sure ECS security group allows port 3306 to RDS security group |
| GitHub Actions fails auth | Verify OIDC provider exists and role trust policy has correct repo name |
| `docker push` denied | Run the ECR login command again (token expires in 12 hours) |
| Frontend shows no products | Check if schema.sql was loaded into RDS |

---

## Cleanup (Destroy Everything)

When you're done and want to avoid charges:

```bash
cd /path/to/shop-easy/terraform
terraform destroy
```

Type "yes" — this deletes ALL AWS resources.

---

## Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| ECS Fargate (5 services × 2 tasks) | ~$50 |
| RDS db.t3.micro | ~$15 |
| NAT Gateway | ~$32 |
| ALB | ~$16 |
| ECR storage | ~$1 |
| **Total** | **~$114/month** |

> 💡 **Save money during dev:** In `terraform/ecs.tf`, change `desired_count = 2` to `desired_count = 1`
