# Step 6: Application Load Balancer (ALB)

> Create the ALB with target groups and path-based routing rules to direct traffic to the correct ECS service.

---

## What We're Creating

| Resource | Purpose |
|----------|---------|
| ALB | Internet-facing load balancer (single entry point) |
| 4 Target Groups | One per service (frontend, product, order, observability) |
| HTTP Listener | Port 80 with routing rules |
| 3 Listener Rules | Path-based routing to backend services |

### Routing Logic:
```
http://ALB_DNS/              → Frontend (default)
http://ALB_DNS/products*     → Product Service
http://ALB_DNS/cart*         → Product Service
http://ALB_DNS/categories*   → Product Service
http://ALB_DNS/orders*       → Order Service
http://ALB_DNS/payments*     → Order Service
http://ALB_DNS/auth*         → Order Service
http://ALB_DNS/grafana*      → Observability Service
```

---

## 6.1 Create Target Groups

### AWS Console:
Go to **EC2** → **Target Groups** → **Create target group** (repeat 4 times)

#### Target Group 1: Frontend
- **Target type:** IP addresses
- **Name:** `shop-easy-frontend-tg`
- **Protocol:** HTTP | **Port:** 80
- **VPC:** `shop-easy-vpc`
- **Health check path:** `/`
- **Healthy threshold:** 2
- **Unhealthy threshold:** 5
- **Timeout:** 10s
- **Interval:** 30s
- Click **Next** → **Create target group** (don't register targets yet)

#### Target Group 2: Product Service
- **Target type:** IP addresses
- **Name:** `shop-easy-product-tg`
- **Protocol:** HTTP | **Port:** 4001
- **VPC:** `shop-easy-vpc`
- **Health check path:** `/health`
- **Healthy threshold:** 2
- **Unhealthy threshold:** 5
- **Timeout:** 10s
- **Interval:** 30s

#### Target Group 3: Order Service
- **Target type:** IP addresses
- **Name:** `shop-easy-order-tg`
- **Protocol:** HTTP | **Port:** 4002
- **VPC:** `shop-easy-vpc`
- **Health check path:** `/health`
- **Healthy threshold:** 2
- **Unhealthy threshold:** 5
- **Timeout:** 10s
- **Interval:** 30s

#### Target Group 4: Observability
- **Target type:** IP addresses
- **Name:** `shop-easy-observe-tg`
- **Protocol:** HTTP | **Port:** 3000
- **VPC:** `shop-easy-vpc`
- **Health check path:** `/grafana/api/health`
- **Healthy threshold:** 2
- **Unhealthy threshold:** 6
- **Timeout:** 10s
- **Interval:** 30s
- **Success codes:** 200

### AWS CLI:
```bash
# Frontend TG
FRONTEND_TG=$(aws elbv2 create-target-group \
  --name shop-easy-frontend-tg \
  --protocol HTTP --port 80 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path "/" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 5 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Product TG
PRODUCT_TG=$(aws elbv2 create-target-group \
  --name shop-easy-product-tg \
  --protocol HTTP --port 4001 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path "/health" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 5 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Order TG
ORDER_TG=$(aws elbv2 create-target-group \
  --name shop-easy-order-tg \
  --protocol HTTP --port 4002 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path "/health" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 5 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Observability TG
OBSERVE_TG=$(aws elbv2 create-target-group \
  --name shop-easy-observe-tg \
  --protocol HTTP --port 3000 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path "/grafana/api/health" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 6 \
  --matcher HttpCode=200 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

echo "Frontend TG: $FRONTEND_TG"
echo "Product TG:  $PRODUCT_TG"
echo "Order TG:    $ORDER_TG"
echo "Observe TG:  $OBSERVE_TG"
```

---

## 6.2 Create Application Load Balancer

### AWS Console:
1. Go to **EC2** → **Load Balancers** → **Create Load Balancer**
2. Select **Application Load Balancer** → Create
3. Settings:
   - **Name:** `shop-easy-alb`
   - **Scheme:** Internet-facing
   - **IP address type:** IPv4
4. **Network mapping:**
   - **VPC:** `shop-easy-vpc`
   - **Mappings:** Select both AZs → Select **public subnets** (shop-easy-public-1, shop-easy-public-2)
5. **Security groups:** Select `shop-easy-alb-sg` (remove default)
6. **Listeners:**
   - **Protocol:** HTTP | **Port:** 80
   - **Default action:** Forward to → `shop-easy-frontend-tg`
7. Click **Create load balancer**

### AWS CLI:
```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name shop-easy-alb \
  --subnets $PUB_SUB1 $PUB_SUB2 \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Get ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB ARN: $ALB_ARN"
echo "ALB DNS: $ALB_DNS"

# Create HTTP Listener (default → frontend)
LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG \
  --query 'Listeners[0].ListenerArn' --output text)
```

---

## 6.3 Create Listener Rules (Path-Based Routing)

### AWS Console:
1. Go to **EC2** → **Load Balancers** → Select `shop-easy-alb`
2. **Listeners** tab → Click the HTTP:80 listener → **Manage rules** → **Add rules**

**Rule 1 — Observability (Priority 5):**
- **Condition:** Path pattern = `/grafana*`
- **Action:** Forward to `shop-easy-observe-tg`

**Rule 2 — Product Service (Priority 10):**
- **Condition:** Path pattern = `/products*`, `/cart*`, `/categories*`
- **Action:** Forward to `shop-easy-product-tg`

**Rule 3 — Order Service (Priority 20):**
- **Condition:** Path pattern = `/orders*`, `/payments*`, `/auth*`
- **Action:** Forward to `shop-easy-order-tg`

### AWS CLI:
```bash
# Rule 1: /grafana* → Observability (priority 5)
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 5 \
  --conditions Field=path-pattern,Values='/grafana*' \
  --actions Type=forward,TargetGroupArn=$OBSERVE_TG

# Rule 2: /products*, /cart*, /categories* → Product Service (priority 10)
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 10 \
  --conditions Field=path-pattern,Values='/products*','/cart*','/categories*' \
  --actions Type=forward,TargetGroupArn=$PRODUCT_TG

# Rule 3: /orders*, /payments*, /auth* → Order Service (priority 20)
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 20 \
  --conditions Field=path-pattern,Values='/orders*','/payments*','/auth*' \
  --actions Type=forward,TargetGroupArn=$ORDER_TG
```

---

## 6.4 Verification Checklist

| ✅ | Resource | Status |
|----|----------|--------|
| ☐ | ALB created (internet-facing, public subnets) | |
| ☐ | ALB security group: shop-easy-alb-sg | |
| ☐ | HTTP Listener on port 80 | |
| ☐ | Default action → frontend target group | |
| ☐ | Rule: /grafana* → observe-tg (priority 5) | |
| ☐ | Rule: /products*, /cart*, /categories* → product-tg (priority 10) | |
| ☐ | Rule: /orders*, /payments*, /auth* → order-tg (priority 20) | |
| ☐ | All 4 target groups created with correct health checks | |

---

## Why These Priorities?

Lower number = higher priority (evaluated first):
- **5** — Grafana checked first (specific path)
- **10** — Product service paths
- **20** — Order service paths
- **Default** — Everything else goes to frontend (React handles client-side routing)

---

## Resource IDs to Save

```
ALB_ARN=arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/shop-easy-alb/xxxxx
ALB_DNS=shop-easy-alb-xxxxx.us-east-1.elb.amazonaws.com
LISTENER_ARN=arn:aws:elasticloadbalancing:...
FRONTEND_TG=arn:aws:elasticloadbalancing:...
PRODUCT_TG=arn:aws:elasticloadbalancing:...
ORDER_TG=arn:aws:elasticloadbalancing:...
OBSERVE_TG=arn:aws:elasticloadbalancing:...
```

---

**Previous:** [05-IAM-ROLES.md](./05-IAM-ROLES.md)
**Next:** [07-ECS-CLUSTER.md](./07-ECS-CLUSTER.md) — Create ECS Cluster
