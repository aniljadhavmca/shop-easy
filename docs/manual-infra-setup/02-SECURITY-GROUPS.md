# Step 2: Security Groups

> Create three security groups that control network access between ALB, ECS tasks, and RDS database.

---

## What We're Creating

| Security Group | Purpose | Inbound Rules |
|---------------|---------|---------------|
| shop-easy-alb-sg | ALB (internet-facing) | Port 80 from 0.0.0.0/0 |
| shop-easy-ecs-sg | ECS Fargate tasks | All ports from ALB SG + Self (service-to-service) |
| shop-easy-rds-sg | RDS MySQL | Port 3306 from ECS SG only |

### Traffic Flow:
```
Internet → ALB (port 80) → ECS Tasks (ports 80, 4001, 4002, 3000) → RDS (port 3306)
                                    ↕ (Service Connect between ECS tasks)
```

---

## 2.1 Create ALB Security Group

### AWS Console:
1. Go to **VPC** → **Security Groups** → **Create security group**
2. Settings:
   - **Name:** `shop-easy-alb-sg`
   - **Description:** ALB security group - allows HTTP from internet
   - **VPC:** Select `shop-easy-vpc`
3. **Inbound rules** → Add rule:
   - **Type:** HTTP
   - **Port:** 80
   - **Source:** Anywhere-IPv4 (`0.0.0.0/0`)
4. **Outbound rules** (keep default — all traffic allowed)
5. Click **Create security group**

### AWS CLI:
```bash
# Create ALB SG
ALB_SG=$(aws ec2 create-security-group \
  --group-name shop-easy-alb-sg \
  --description "ALB security group - allows HTTP from internet" \
  --vpc-id vpc-xxxxx \
  --query 'GroupId' --output text)

# Add inbound rule: HTTP from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

echo "ALB SG: $ALB_SG"
```

> 📝 **Note down:** ALB Security Group ID

---

## 2.2 Create ECS Security Group

### AWS Console:
1. **Create security group**
2. Settings:
   - **Name:** `shop-easy-ecs-sg`
   - **Description:** ECS tasks - allows traffic from ALB and between services
   - **VPC:** Select `shop-easy-vpc`
3. **Inbound rules** → Add 2 rules:

   **Rule 1 — From ALB:**
   - **Type:** Custom TCP
   - **Port range:** 0 - 65535
   - **Source:** Custom → Select `shop-easy-alb-sg`

   **Rule 2 — Self (ECS to ECS for Service Connect + Prometheus scraping):**
   - **Type:** Custom TCP
   - **Port range:** 0 - 65535
   - **Source:** Custom → Select `shop-easy-ecs-sg` (self-reference)

4. **Outbound rules** (keep default — all traffic allowed)
5. Click **Create security group**

### AWS CLI:
```bash
# Create ECS SG
ECS_SG=$(aws ec2 create-security-group \
  --group-name shop-easy-ecs-sg \
  --description "ECS tasks - allows traffic from ALB and between services" \
  --vpc-id vpc-xxxxx \
  --query 'GroupId' --output text)

# Rule 1: All TCP from ALB SG
aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG \
  --protocol tcp --port 0-65535 \
  --source-group $ALB_SG

# Rule 2: All TCP from self (ECS to ECS)
aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG \
  --protocol tcp --port 0-65535 \
  --source-group $ECS_SG

echo "ECS SG: $ECS_SG"
```

> 📝 **Note down:** ECS Security Group ID

---

## 2.3 Create RDS Security Group

### AWS Console:
1. **Create security group**
2. Settings:
   - **Name:** `shop-easy-rds-sg`
   - **Description:** RDS MySQL - allows port 3306 from ECS tasks only
   - **VPC:** Select `shop-easy-vpc`
3. **Inbound rules** → Add rule:
   - **Type:** MySQL/Aurora
   - **Port:** 3306
   - **Source:** Custom → Select `shop-easy-ecs-sg`
4. **Outbound rules** (keep default)
5. Click **Create security group**

### AWS CLI:
```bash
# Create RDS SG
RDS_SG=$(aws ec2 create-security-group \
  --group-name shop-easy-rds-sg \
  --description "RDS MySQL - allows port 3306 from ECS tasks only" \
  --vpc-id vpc-xxxxx \
  --query 'GroupId' --output text)

# Rule: MySQL from ECS SG only
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG \
  --protocol tcp --port 3306 \
  --source-group $ECS_SG

echo "RDS SG: $RDS_SG"
```

> 📝 **Note down:** RDS Security Group ID

---

## 2.4 Verification Checklist

| ✅ | Security Group | Inbound | Outbound |
|----|---------------|---------|----------|
| ☐ | shop-easy-alb-sg | TCP 80 from 0.0.0.0/0 | All traffic |
| ☐ | shop-easy-ecs-sg | TCP 0-65535 from ALB SG + Self | All traffic |
| ☐ | shop-easy-rds-sg | TCP 3306 from ECS SG | All traffic |

---

## Security Design Explained

- **ALB** is the ONLY internet-facing resource (port 80)
- **ECS tasks** have NO public IPs — only reachable via ALB
- **RDS** is ONLY accessible from ECS tasks — not from internet
- **ECS self-reference** allows Prometheus (in observability service) to scrape metrics from product-service and order-service via Service Connect
- **Outbound all** is needed for: ECR image pulls, Stripe API calls, DNS resolution

---

## Resource IDs to Save

```
ALB_SG=sg-xxxxx
ECS_SG=sg-xxxxx
RDS_SG=sg-xxxxx
```

---

**Previous:** [01-VPC-NETWORKING.md](./01-VPC-NETWORKING.md)
**Next:** [03-RDS-DATABASE.md](./03-RDS-DATABASE.md) — Create RDS MySQL Database
