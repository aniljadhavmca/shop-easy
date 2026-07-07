# Step 11: Database Migration (db-init)

> Run the db-init task once to create tables and load seed data (15 products, 11 categories) into RDS.

---

## What This Does

The `db-init` container:
1. Connects to RDS MySQL
2. Creates all tables (categories, products, users, cart_items, orders, order_items, payments)
3. Inserts seed data (11 categories + 15 products)
4. Exits with code 0 (success)

This is a **one-time task** — not a long-running service.

---

## 11.1 Run the DB Init Task

### AWS Console:
1. Go to **ECS** → **Clusters** → `shop-easy-cluster`
2. Click **Tasks** tab → **Run new task**
3. Settings:
   - **Compute options:** Launch type
   - **Launch type:** FARGATE
   - **Task definition:** `shop-easy-db-init` (latest revision)
   - **Desired tasks:** 1
4. **Networking:**
   - **VPC:** `shop-easy-vpc`
   - **Subnets:** Select one **private** subnet (e.g., shop-easy-private-1)
   - **Security group:** Select `shop-easy-ecs-sg`
   - **Public IP:** ❌ Turned off
5. Click **Run task**
6. ⏳ Wait for task status to change: `PROVISIONING` → `PENDING` → `RUNNING` → `STOPPED`
7. Check **Exit code:** Should be `0` (success)

### AWS CLI:
```bash
# Get subnet and security group
PRIVATE_SUBNET=$(aws ec2 describe-subnets \
  --filters Name=tag:Name,Values=shop-easy-private-1 \
  --query 'Subnets[0].SubnetId' --output text)

ECS_SG=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values=shop-easy-ecs-sg \
  --query 'SecurityGroups[0].GroupId' --output text)

# Run the task
TASK_ARN=$(aws ecs run-task \
  --cluster shop-easy-cluster \
  --task-definition shop-easy-db-init \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)

echo "Task ARN: $TASK_ARN"
echo "⏳ Waiting for db-init task to complete..."

# Wait for task to stop
aws ecs wait tasks-stopped --cluster shop-easy-cluster --tasks $TASK_ARN

# Check exit code
EXIT_CODE=$(aws ecs describe-tasks --cluster shop-easy-cluster --tasks $TASK_ARN \
  --query 'tasks[0].containers[0].exitCode' --output text)

if [ "$EXIT_CODE" = "0" ]; then
  echo "✅ Database migration successful!"
else
  echo "❌ Migration failed with exit code: $EXIT_CODE"
  echo "Check logs in CloudWatch: /ecs/shop-easy → db-init stream"
fi
```

---

## 11.2 Verify Migration (Check Logs)

### AWS Console:
1. Go to **CloudWatch** → **Log groups** → `/ecs/shop-easy`
2. Find the log stream starting with `db-init/`
3. Look for messages like:
   ```
   Connected to MySQL
   Creating tables...
   Tables created successfully
   Inserting seed data...
   ✅ Database initialized successfully
   ```

### AWS CLI:
```bash
# Get the latest db-init log stream
LOG_STREAM=$(aws logs describe-log-streams \
  --log-group-name /ecs/shop-easy \
  --log-stream-name-prefix db-init \
  --order-by LastEventTime --descending \
  --query 'logStreams[0].logStreamName' --output text)

# View logs
aws logs get-log-events \
  --log-group-name /ecs/shop-easy \
  --log-stream-name "$LOG_STREAM" \
  --query 'events[].message' --output text
```

---

## 11.3 Verify Data via Product Service

Once the migration is done and product-service is running, test the API:

```bash
# Get ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names shop-easy-alb \
  --query 'LoadBalancers[0].DNSName' --output text)

# Test products endpoint
curl -s http://$ALB_DNS/products | python3 -m json.tool | head -20

# Test categories endpoint
curl -s http://$ALB_DNS/categories | python3 -m json.tool
```

Expected: JSON array with 15 products and 11 categories.

---

## 11.4 Verification Checklist

| ✅ | Check | Status |
|----|-------|--------|
| ☐ | db-init task ran and stopped with exit code 0 | |
| ☐ | CloudWatch logs show "Database initialized successfully" | |
| ☐ | /products returns 15 products | |
| ☐ | /categories returns 11 categories | |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Exit code 1 | DB connection failed | Check DB_HOST, DB_PASSWORD env vars in task definition |
| "Connection refused" in logs | RDS not ready or wrong SG | Ensure RDS is Available, ECS SG can reach RDS SG on 3306 |
| "Access denied" | Wrong password | Verify DB_PASSWORD matches what you set in RDS |
| Task stuck in PROVISIONING | NAT Gateway issue | Ensure private subnet route table has 0.0.0.0/0 → NAT |

---

## Important Notes

- This task only needs to run **once** (or when you want to reset the database)
- If you need to re-run it (reset data), just run the task again — it will recreate tables
- The task automatically stops after completion — no ongoing cost

---

**Previous:** [10-ECS-SERVICES.md](./10-ECS-SERVICES.md)
**Next:** [12-VERIFICATION.md](./12-VERIFICATION.md) — Verify Deployment
