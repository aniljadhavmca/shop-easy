# Step 10: ECS Services

> Create and deploy 4 ECS services (long-running tasks) that run your application containers.

---

## What We're Creating

| Service | Task Definition | Desired Count | Load Balancer | Service Connect |
|---------|----------------|---------------|---------------|-----------------|
| product-service | shop-easy-product | 1 | shop-easy-product-tg | Yes (port 4001) |
| order-service | shop-easy-order | 1 | shop-easy-order-tg | Yes (port 4002) |
| frontend | shop-easy-frontend | 1 | shop-easy-frontend-tg | No |
| observability | shop-easy-observability | 1 | shop-easy-observe-tg | Yes (consumer only) |

---

## 10.1 Deploy Product Service

### AWS Console:
1. Go to **ECS** → **Clusters** → `shop-easy-cluster` → **Services** → **Create**
2. **Environment:**
   - **Compute options:** Launch type
   - **Launch type:** FARGATE
3. **Deployment configuration:**
   - **Application type:** Service
   - **Task definition:** `shop-easy-product` (latest revision)
   - **Service name:** `product-service`
   - **Desired tasks:** 1
4. **Networking:**
   - **VPC:** `shop-easy-vpc`
   - **Subnets:** Select both **private** subnets (shop-easy-private-1, shop-easy-private-2)
   - **Security group:** Select `shop-easy-ecs-sg` (remove default)
   - **Public IP:** ❌ Turned off
5. **Load balancing:**
   - **Load balancer type:** Application Load Balancer
   - **Use an existing load balancer:** `shop-easy-alb`
   - **Container:** `product-service 4001:4001`
   - **Use an existing target group:** `shop-easy-product-tg`
6. **Service Connect:**
   - ✅ Turn on Service Connect
   - **Namespace:** `shop-easy`
   - **Client and server** (so other services can discover it)
   - **Port mapping:** `http` → Port alias DNS name: `product-service`, Port: 4001
7. **Service auto scaling:** Leave off
8. Click **Create**

⏳ Wait 2-3 minutes for the service to reach **Running** state.

### AWS CLI:
```bash
aws ecs create-service \
  --cluster shop-easy-cluster \
  --service-name product-service \
  --task-definition shop-easy-product \
  --desired-count 1 \
  --launch-type FARGATE \
  --enable-execute-command \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUB1,$PRIV_SUB2],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$PRODUCT_TG,containerName=product-service,containerPort=4001" \
  --service-connect-configuration '{
    "enabled": true,
    "namespace": "shop-easy",
    "services": [{
      "portName": "http",
      "discoveryName": "product-service",
      "clientAliases": [{"port": 4001, "dnsName": "product-service"}]
    }]
  }'

echo "⏳ Waiting for product-service to stabilize..."
aws ecs wait services-stable --cluster shop-easy-cluster --services product-service
echo "✅ product-service is running"
```

---

## 10.2 Deploy Order Service

### AWS Console:
Same as product service with these differences:
- **Task definition:** `shop-easy-order`
- **Service name:** `order-service`
- **Container:** `order-service 4002:4002`
- **Target group:** `shop-easy-order-tg`
- **Service Connect:** DNS name `order-service`, Port 4002

### AWS CLI:
```bash
aws ecs create-service \
  --cluster shop-easy-cluster \
  --service-name order-service \
  --task-definition shop-easy-order \
  --desired-count 1 \
  --launch-type FARGATE \
  --enable-execute-command \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUB1,$PRIV_SUB2],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$ORDER_TG,containerName=order-service,containerPort=4002" \
  --service-connect-configuration '{
    "enabled": true,
    "namespace": "shop-easy",
    "services": [{
      "portName": "http",
      "discoveryName": "order-service",
      "clientAliases": [{"port": 4002, "dnsName": "order-service"}]
    }]
  }'

echo "⏳ Waiting for order-service to stabilize..."
aws ecs wait services-stable --cluster shop-easy-cluster --services order-service
echo "✅ order-service is running"
```

---

## 10.3 Deploy Frontend

### AWS Console:
- **Task definition:** `shop-easy-frontend`
- **Service name:** `frontend`
- **Container:** `frontend 80:80`
- **Target group:** `shop-easy-frontend-tg`
- **Service Connect:** ❌ Not needed (frontend doesn't need to be discovered by other services)

### AWS CLI:
```bash
aws ecs create-service \
  --cluster shop-easy-cluster \
  --service-name frontend \
  --task-definition shop-easy-frontend \
  --desired-count 1 \
  --launch-type FARGATE \
  --enable-execute-command \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUB1,$PRIV_SUB2],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$FRONTEND_TG,containerName=frontend,containerPort=80"

echo "⏳ Waiting for frontend to stabilize..."
aws ecs wait services-stable --cluster shop-easy-cluster --services frontend
echo "✅ frontend is running"
```

---

## 10.4 Deploy Observability

### AWS Console:
- **Task definition:** `shop-easy-observability`
- **Service name:** `observability`
- **Container:** `observability 3000:3000`
- **Target group:** `shop-easy-observe-tg`
- **Service Connect:** ✅ Turn on, but **Client only** (it discovers other services but doesn't need to be discovered)

### AWS CLI:
```bash
aws ecs create-service \
  --cluster shop-easy-cluster \
  --service-name observability \
  --task-definition shop-easy-observability \
  --desired-count 1 \
  --launch-type FARGATE \
  --enable-execute-command \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUB1,$PRIV_SUB2],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$OBSERVE_TG,containerName=observability,containerPort=3000" \
  --service-connect-configuration '{
    "enabled": true,
    "namespace": "shop-easy"
  }'

echo "⏳ Waiting for observability to stabilize..."
aws ecs wait services-stable --cluster shop-easy-cluster --services observability
echo "✅ observability is running"
```

---

## 10.5 Check All Services Status

### AWS Console:
1. Go to **ECS** → **Clusters** → `shop-easy-cluster` → **Services** tab
2. All 4 services should show:
   - **Status:** Active
   - **Running count:** 1
   - **Desired count:** 1

### AWS CLI:
```bash
aws ecs describe-services \
  --cluster shop-easy-cluster \
  --services product-service order-service frontend observability \
  --query 'services[].{Name:serviceName,Status:status,Running:runningCount,Desired:desiredCount}' \
  --output table
```

Expected output:
```
---------------------------------------------------
|              DescribeServices                    |
+--------+-----------+----------+-----------------+
| Desired|   Name    | Running  |    Status       |
+--------+-----------+----------+-----------------+
|  1     | product-service | 1  |    ACTIVE       |
|  1     | order-service   | 1  |    ACTIVE       |
|  1     | frontend        | 1  |    ACTIVE       |
|  1     | observability   | 1  |    ACTIVE       |
+--------+-----------+----------+-----------------+
```

---

## 10.6 Verification Checklist

| ✅ | Service | Running | Target Group Healthy |
|----|---------|---------|---------------------|
| ☐ | product-service | 1/1 | |
| ☐ | order-service | 1/1 | |
| ☐ | frontend | 1/1 | |
| ☐ | observability | 1/1 | |

### Check Target Group Health:
Go to **EC2** → **Target Groups** → Click each TG → **Targets** tab → Status should be **healthy**

---

## Troubleshooting

| Issue | How to Debug |
|-------|-------------|
| Task keeps stopping | Check CloudWatch logs: `/ecs/shop-easy` → Look at stream prefix |
| Target unhealthy | Health check failing — check the health check path in target group |
| Service stuck at 0/1 | Check ECS Events tab for error messages |
| "CannotPullContainerError" | Image not pushed to ECR, or execution role missing ECR permissions |

### View task failure reason:
```bash
# List stopped tasks
TASK_ARN=$(aws ecs list-tasks --cluster shop-easy-cluster \
  --service-name product-service --desired-status STOPPED \
  --query 'taskArns[0]' --output text)

# Get stop reason
aws ecs describe-tasks --cluster shop-easy-cluster --tasks $TASK_ARN \
  --query 'tasks[0].{stopReason:stoppedReason,containerReason:containers[0].reason}'
```

---

**Previous:** [09-ECS-TASK-DEFINITIONS.md](./09-ECS-TASK-DEFINITIONS.md)
**Next:** [11-DB-MIGRATION.md](./11-DB-MIGRATION.md) — Run Database Migration
