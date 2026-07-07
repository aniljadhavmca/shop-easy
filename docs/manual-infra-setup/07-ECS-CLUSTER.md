# Step 7: ECS Cluster & Cloud Map Namespace

> Create the ECS Fargate cluster and Cloud Map namespace for service discovery (Service Connect).

---

## What We're Creating

| Resource | Purpose |
|----------|---------|
| ECS Cluster | Hosts all Fargate tasks |
| Cloud Map HTTP Namespace | Enables service-to-service communication (e.g., Prometheus → product-service:4001) |
| CloudWatch Log Group | Centralized logging for all ECS tasks |

### Service Connect Explained:
```
Observability (Prometheus) → product-service:4001/metrics  (via Cloud Map DNS)
Observability (Prometheus) → order-service:4002/metrics    (via Cloud Map DNS)
```

Without Service Connect, containers in private subnets can't find each other by name.

---

## 7.1 Create Cloud Map Namespace

### AWS Console:
1. Go to **AWS Cloud Map** → **Namespaces** → **Create namespace**
2. Settings:
   - **Name:** `shop-easy`
   - **Namespace type:** HTTP
   - **Description:** Shop Easy service discovery namespace
3. Click **Create namespace**

### AWS CLI:
```bash
NAMESPACE_ARN=$(aws servicediscovery create-http-namespace \
  --name shop-easy \
  --description "Shop Easy service discovery namespace" \
  --query 'OperationId' --output text)

# Wait a moment, then get the namespace ARN
sleep 5
NAMESPACE_ARN=$(aws servicediscovery list-namespaces \
  --query "Namespaces[?Name=='shop-easy'].Arn" --output text)

echo "Namespace ARN: $NAMESPACE_ARN"
```

> 📝 **Note down:** Namespace ARN

---

## 7.2 Create ECS Cluster

### AWS Console:
1. Go to **ECS** → **Clusters** → **Create cluster**
2. Settings:
   - **Cluster name:** `shop-easy-cluster`
   - **Infrastructure:** ✅ AWS Fargate (serverless) — should be selected by default
3. **Service Connect defaults:**
   - ✅ Turn on AWS Cloud Map
   - **Namespace:** Select `shop-easy`
4. **Monitoring:** (optional)
   - Container Insights: Off (to save cost)
5. Click **Create**

### AWS CLI:
```bash
aws ecs create-cluster \
  --cluster-name shop-easy-cluster \
  --service-connect-defaults namespace=$NAMESPACE_ARN \
  --query 'cluster.clusterArn' --output text

echo "✅ ECS Cluster created: shop-easy-cluster"
```

---

## 7.3 Create CloudWatch Log Group

### AWS Console:
1. Go to **CloudWatch** → **Log groups** → **Create log group**
2. Settings:
   - **Log group name:** `/ecs/shop-easy`
   - **Retention:** 3 days (to minimize cost)
3. Click **Create**

### AWS CLI:
```bash
aws logs create-log-group --log-group-name /ecs/shop-easy

aws logs put-retention-policy \
  --log-group-name /ecs/shop-easy \
  --retention-in-days 3

echo "✅ Log group created: /ecs/shop-easy"
```

---

## 7.4 Verification Checklist

| ✅ | Resource | Status |
|----|----------|--------|
| ☐ | Cloud Map namespace `shop-easy` created (HTTP type) | |
| ☐ | ECS Cluster `shop-easy-cluster` created | |
| ☐ | Cluster default namespace set to `shop-easy` | |
| ☐ | CloudWatch log group `/ecs/shop-easy` created (3-day retention) | |

---

## How Service Connect Works

When ECS services register with Service Connect:
1. Product service registers as `product-service` on port 4001
2. Order service registers as `order-service` on port 4002
3. Any task in the cluster can reach them by DNS name:
   - `http://product-service:4001/metrics`
   - `http://order-service:4002/metrics`

This is how Prometheus (in observability service) scrapes metrics from other services without knowing their IP addresses.

---

## Resource IDs to Save

```
CLUSTER_NAME=shop-easy-cluster
NAMESPACE_ARN=arn:aws:servicediscovery:us-east-1:123456789012:namespace/ns-xxxxx
LOG_GROUP=/ecs/shop-easy
```

---

**Previous:** [06-ALB-LOAD-BALANCER.md](./06-ALB-LOAD-BALANCER.md)
**Next:** [08-BUILD-PUSH-IMAGES.md](./08-BUILD-PUSH-IMAGES.md) — Build & Push Docker Images
