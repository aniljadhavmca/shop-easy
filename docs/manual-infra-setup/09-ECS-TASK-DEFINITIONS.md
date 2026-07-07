# Step 9: ECS Task Definitions

> Create task definitions for all 5 services. A task definition is like a blueprint — it tells ECS what image to run, how much CPU/memory, environment variables, and logging config.

---

## What We're Creating

| Task Definition | CPU | Memory | Port | Environment Variables |
|----------------|-----|--------|------|----------------------|
| shop-easy-product | 256 (0.25 vCPU) | 512 MB | 4001 | DB_HOST, DB_USER, DB_PASSWORD, DB_NAME |
| shop-easy-order | 256 | 512 MB | 4002 | DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, STRIPE_SECRET_KEY, ADMIN_USERNAME, ADMIN_PASSWORD |
| shop-easy-frontend | 256 | 512 MB | 80 | (none) |
| shop-easy-observability | 256 | 512 MB | 3000 | PAGERDUTY_INTEGRATION_KEY |
| shop-easy-db-init | 256 | 512 MB | — | DB_HOST, DB_USER, DB_PASSWORD, DB_NAME |

---

## 9.1 Product Service Task Definition

### AWS Console:
1. Go to **ECS** → **Task definitions** → **Create new task definition**
2. **Task definition family:** `shop-easy-product`
3. **Infrastructure requirements:**
   - **Launch type:** AWS Fargate
   - **OS/Architecture:** Linux/X86_64
   - **CPU:** 0.25 vCPU
   - **Memory:** 0.5 GB
   - **Task execution role:** `shop-easy-ecs-execution`
   - **Task role:** `shop-easy-ecs-task`
4. **Container - 1:**
   - **Name:** `product-service`
   - **Image URI:** `123456789012.dkr.ecr.us-east-1.amazonaws.com/shop-easy/product-service:latest`
   - **Port mappings:** Container port `4001`, Protocol TCP, Port name `http`
   - **Environment variables:**
     | Key | Value |
     |-----|-------|
     | DB_HOST | (your RDS endpoint) |
     | DB_USER | admin |
     | DB_PASSWORD | (your password) |
     | DB_NAME | shop_easy |
   - **Log configuration:**
     - Log driver: awslogs
     - awslogs-group: `/ecs/shop-easy`
     - awslogs-region: `us-east-1`
     - awslogs-stream-prefix: `product`
5. Click **Create**

### AWS CLI (JSON file method):
```bash
# Replace these values
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
RDS_HOST="shop-easy-db.xxxxx.us-east-1.rds.amazonaws.com"  # From Step 3
DB_PASSWORD="YourPasswordHere"
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/shop-easy-ecs-execution"
TASK_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/shop-easy-ecs-task"

cat > /tmp/product-task.json << EOF
{
  "family": "shop-easy-product",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "product-service",
      "image": "$REGISTRY/shop-easy/product-service:latest",
      "portMappings": [
        { "containerPort": 4001, "name": "http", "protocol": "tcp" }
      ],
      "environment": [
        { "name": "DB_HOST", "value": "$RDS_HOST" },
        { "name": "DB_USER", "value": "admin" },
        { "name": "DB_PASSWORD", "value": "$DB_PASSWORD" },
        { "name": "DB_NAME", "value": "shop_easy" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/shop-easy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "product"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/product-task.json
echo "✅ Product task definition registered"
```

---

## 9.2 Order Service Task Definition

### AWS Console:
Same steps as above with these differences:
- **Family:** `shop-easy-order`
- **Container name:** `order-service`
- **Image:** `.../shop-easy/order-service:latest`
- **Port:** 4002
- **Stream prefix:** `order`
- **Additional env vars:**
  | Key | Value |
  |-----|-------|
  | STRIPE_SECRET_KEY | sk_test_your_stripe_key |
  | ADMIN_USERNAME | admin |
  | ADMIN_PASSWORD | ShopEasy2026 |

### AWS CLI:
```bash
STRIPE_SECRET_KEY="sk_test_your_stripe_key_here"

cat > /tmp/order-task.json << EOF
{
  "family": "shop-easy-order",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "order-service",
      "image": "$REGISTRY/shop-easy/order-service:latest",
      "portMappings": [
        { "containerPort": 4002, "name": "http", "protocol": "tcp" }
      ],
      "environment": [
        { "name": "DB_HOST", "value": "$RDS_HOST" },
        { "name": "DB_USER", "value": "admin" },
        { "name": "DB_PASSWORD", "value": "$DB_PASSWORD" },
        { "name": "DB_NAME", "value": "shop_easy" },
        { "name": "STRIPE_SECRET_KEY", "value": "$STRIPE_SECRET_KEY" },
        { "name": "ADMIN_USERNAME", "value": "admin" },
        { "name": "ADMIN_PASSWORD", "value": "ShopEasy2026" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/shop-easy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "order"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/order-task.json
echo "✅ Order task definition registered"
```

---

## 9.3 Frontend Task Definition

### AWS Console:
- **Family:** `shop-easy-frontend`
- **Container name:** `frontend`
- **Image:** `.../shop-easy/frontend:latest`
- **Port:** 80
- **Stream prefix:** `frontend`
- **No environment variables** (Stripe key is baked in at build time)

### AWS CLI:
```bash
cat > /tmp/frontend-task.json << EOF
{
  "family": "shop-easy-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "frontend",
      "image": "$REGISTRY/shop-easy/frontend:latest",
      "portMappings": [
        { "containerPort": 80 }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/shop-easy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "frontend"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/frontend-task.json
echo "✅ Frontend task definition registered"
```

---

## 9.4 Observability Task Definition

### AWS Console:
- **Family:** `shop-easy-observability`
- **Container name:** `observability`
- **Image:** `.../shop-easy/observability:latest`
- **Port:** 3000
- **Stream prefix:** `observability`
- **Env var:** PAGERDUTY_INTEGRATION_KEY = your_key

### AWS CLI:
```bash
PAGERDUTY_KEY="your-pagerduty-integration-key"

cat > /tmp/observability-task.json << EOF
{
  "family": "shop-easy-observability",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "observability",
      "image": "$REGISTRY/shop-easy/observability:latest",
      "portMappings": [
        { "containerPort": 3000 }
      ],
      "environment": [
        { "name": "PAGERDUTY_INTEGRATION_KEY", "value": "$PAGERDUTY_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/shop-easy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "observability"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/observability-task.json
echo "✅ Observability task definition registered"
```

---

## 9.5 DB Init Task Definition

### AWS Console:
- **Family:** `shop-easy-db-init`
- **Container name:** `db-init`
- **Image:** `.../shop-easy/db-init:latest`
- **No port mappings** (runs once and exits)
- **Stream prefix:** `db-init`
- **Task role:** Not needed (only execution role)

### AWS CLI:
```bash
cat > /tmp/db-init-task.json << EOF
{
  "family": "shop-easy-db-init",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "db-init",
      "image": "$REGISTRY/shop-easy/db-init:latest",
      "environment": [
        { "name": "DB_HOST", "value": "$RDS_HOST" },
        { "name": "DB_USER", "value": "admin" },
        { "name": "DB_PASSWORD", "value": "$DB_PASSWORD" },
        { "name": "DB_NAME", "value": "shop_easy" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/shop-easy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "db-init"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/db-init-task.json
echo "✅ DB Init task definition registered"
```

---

## 9.6 Verification Checklist

| ✅ | Task Definition | Registered |
|----|----------------|-----------|
| ☐ | shop-easy-product (port 4001) | |
| ☐ | shop-easy-order (port 4002) | |
| ☐ | shop-easy-frontend (port 80) | |
| ☐ | shop-easy-observability (port 3000) | |
| ☐ | shop-easy-db-init (no port) | |

### Verify via CLI:
```bash
aws ecs list-task-definitions --family-prefix shop-easy --query 'taskDefinitionArns' --output table
```

---

## Important Notes

- ⚠️ **Port name `http`** is required for Service Connect (product & order services)
- ⚠️ **Environment variables** contain secrets in plain text — in production, use AWS Secrets Manager
- The `db-init` task has no task role because it only needs to connect to RDS (no AWS API calls)
- Task definitions are versioned — each update creates a new revision (e.g., shop-easy-product:1, :2, :3)

---

**Previous:** [08-BUILD-PUSH-IMAGES.md](./08-BUILD-PUSH-IMAGES.md)
**Next:** [10-ECS-SERVICES.md](./10-ECS-SERVICES.md) — Deploy ECS Services
