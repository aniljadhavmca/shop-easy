# Step 3: RDS MySQL Database

> Create the MySQL 8.0 database instance in private subnets for storing products, orders, and payments data.

---

## What We're Creating

| Resource | Details |
|----------|---------|
| DB Subnet Group | Groups private subnets for RDS placement |
| RDS Instance | MySQL 8.0, db.t3.micro, 20GB storage |
| Database Name | shop_easy |
| Master Username | admin |
| Master Password | Your chosen password (letters + numbers only) |

---

## 3.1 Create DB Subnet Group

### AWS Console:
1. Go to **RDS** → **Subnet groups** → **Create DB subnet group**
2. Settings:
   - **Name:** `shop-easy-db-subnet`
   - **Description:** Private subnets for Shop Easy RDS
   - **VPC:** Select `shop-easy-vpc`
3. **Add subnets:**
   - **Availability Zones:** Select `us-east-1a` and `us-east-1b`
   - **Subnets:** Select `10.0.10.0/24` (private-1) and `10.0.11.0/24` (private-2)
4. Click **Create**

### AWS CLI:
```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name shop-easy-db-subnet \
  --db-subnet-group-description "Private subnets for Shop Easy RDS" \
  --subnet-ids $PRIV_SUB1 $PRIV_SUB2
```

---

## 3.2 Create RDS Instance

### AWS Console:
1. Go to **RDS** → **Databases** → **Create database**
2. **Choose a database creation method:** Standard create
3. **Engine options:**
   - **Engine type:** MySQL
   - **Engine version:** MySQL 8.0.x (latest 8.0)
4. **Templates:** Free tier
5. **Settings:**
   - **DB instance identifier:** `shop-easy-db`
   - **Master username:** `admin`
   - **Master password:** Your password (e.g., `ShopEasy2024Strong`)
   - **Confirm password:** Same password
6. **Instance configuration:**
   - **DB instance class:** db.t3.micro
7. **Storage:**
   - **Storage type:** General Purpose SSD (gp2)
   - **Allocated storage:** 20 GB
   - **Storage autoscaling:** ❌ Uncheck (to control costs)
8. **Connectivity:**
   - **VPC:** `shop-easy-vpc`
   - **DB subnet group:** `shop-easy-db-subnet`
   - **Public access:** ❌ **No**
   - **VPC security group:** Choose existing → Select `shop-easy-rds-sg` (remove default)
   - **Availability Zone:** No preference
9. **Database authentication:** Password authentication
10. **Additional configuration:**
    - **Initial database name:** `shop_easy`
    - **Backup retention:** 0 days (to save cost — no backups for dev)
    - **Monitoring:** ❌ Disable enhanced monitoring
    - **Maintenance window:** No preference
    - **Deletion protection:** ❌ Uncheck
11. Click **Create database**

⏳ **Wait 5-10 minutes** for the instance to become **Available**.

### AWS CLI:
```bash
aws rds create-db-instance \
  --db-instance-identifier shop-easy-db \
  --engine mysql \
  --engine-version 8.0 \
  --db-instance-class db.t3.micro \
  --allocated-storage 20 \
  --master-username admin \
  --master-user-password "YourPasswordHere" \
  --db-name shop_easy \
  --db-subnet-group-name shop-easy-db-subnet \
  --vpc-security-group-ids $RDS_SG \
  --publicly-accessible false \
  --backup-retention-period 0 \
  --no-multi-az \
  --storage-type gp2 \
  --no-deletion-protection \
  --tags Key=Name,Value=shop-easy-rds

# Wait for RDS to be available
echo "⏳ Waiting for RDS to be available (5-10 min)..."
aws rds wait db-instance-available --db-instance-identifier shop-easy-db
echo "✅ RDS is ready!"
```

---

## 3.3 Get RDS Endpoint

### AWS Console:
1. Go to **RDS** → **Databases** → Click `shop-easy-db`
2. Under **Connectivity & security** → Copy the **Endpoint**
   - Example: `shop-easy-db.c1234567890.us-east-1.rds.amazonaws.com`

### AWS CLI:
```bash
RDS_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier shop-easy-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)

echo "RDS Endpoint: $RDS_HOST"
```

> 📝 **Note down:** RDS Endpoint (you'll need this for ECS task definitions)

---

## 3.4 Verification Checklist

| ✅ | Check | Status |
|----|-------|--------|
| ☐ | DB Subnet Group created with 2 private subnets | |
| ☐ | RDS instance status: Available | |
| ☐ | Engine: MySQL 8.0 | |
| ☐ | Instance class: db.t3.micro | |
| ☐ | Publicly accessible: No | |
| ☐ | Security group: shop-easy-rds-sg | |
| ☐ | Initial database: shop_easy | |
| ☐ | Endpoint noted down | |

---

## Important Notes

- ⚠️ **Password:** Use only letters and numbers (no special characters) to avoid issues with environment variables in ECS
- ⚠️ **Not publicly accessible:** You cannot connect to this DB from your laptop — only from ECS tasks in the same VPC
- 💰 **Cost:** ~$15/month for db.t3.micro
- 🔒 **Security:** Only ECS tasks (via shop-easy-ecs-sg) can reach port 3306

---

## Resource IDs to Save

```
RDS_ENDPOINT=shop-easy-db.xxxxx.us-east-1.rds.amazonaws.com
DB_NAME=shop_easy
DB_USER=admin
DB_PASSWORD=YourPasswordHere
```

---

**Previous:** [02-SECURITY-GROUPS.md](./02-SECURITY-GROUPS.md)
**Next:** [04-ECR-REPOSITORIES.md](./04-ECR-REPOSITORIES.md) — Create ECR Repositories
