# Step 12: Verify Deployment

> Confirm all services are healthy and the application is fully functional.

---

## 12.1 Get ALB URL

### AWS Console:
1. Go to **EC2** → **Load Balancers** → `shop-easy-alb`
2. Copy the **DNS name** (e.g., `shop-easy-alb-123456789.us-east-1.elb.amazonaws.com`)

### AWS CLI:
```bash
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names shop-easy-alb \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "🌐 App URL: http://$ALB_DNS"
echo "📊 Grafana: http://$ALB_DNS/grafana"
```

---

## 12.2 Check Target Group Health

### AWS Console:
1. Go to **EC2** → **Target Groups**
2. Click each target group → **Targets** tab
3. All targets should show **Status: healthy**

### AWS CLI:
```bash
for tg_name in shop-easy-frontend-tg shop-easy-product-tg shop-easy-order-tg shop-easy-observe-tg; do
  TG_ARN=$(aws elbv2 describe-target-groups --names $tg_name \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  HEALTH=$(aws elbv2 describe-target-health --target-group-arn $TG_ARN \
    --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text)
  echo "$tg_name: $HEALTH"
done
```

Expected:
```
shop-easy-frontend-tg: healthy
shop-easy-product-tg: healthy
shop-easy-order-tg: healthy
shop-easy-observe-tg: healthy
```

---

## 12.3 Test All Endpoints

### From Browser:

| URL | Expected |
|-----|----------|
| `http://<ALB_DNS>/` | Shop Easy homepage with products |
| `http://<ALB_DNS>/products` | JSON array of 15 products |
| `http://<ALB_DNS>/categories` | JSON array of 11 categories |
| `http://<ALB_DNS>/orders/stats/summary` | JSON with order stats |
| `http://<ALB_DNS>/grafana/login` | Grafana login page |

### From Terminal:
```bash
echo "Testing endpoints..."
echo ""

# Frontend
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$ALB_DNS/)
echo "Frontend (/):              $HTTP_CODE $([ $HTTP_CODE = 200 ] && echo '✅' || echo '❌')"

# Products
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$ALB_DNS/products)
echo "Products (/products):      $HTTP_CODE $([ $HTTP_CODE = 200 ] && echo '✅' || echo '❌')"

# Categories
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$ALB_DNS/categories)
echo "Categories (/categories):  $HTTP_CODE $([ $HTTP_CODE = 200 ] && echo '✅' || echo '❌')"

# Orders Stats
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$ALB_DNS/orders/stats/summary)
echo "Orders (/orders/stats):    $HTTP_CODE $([ $HTTP_CODE = 200 ] && echo '✅' || echo '❌')"

# Grafana
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$ALB_DNS/grafana/login)
echo "Grafana (/grafana/login):  $HTTP_CODE $([ $HTTP_CODE = 200 ] && echo '✅' || echo '❌')"
```

---

## 12.4 Test Application Features

### Shop Flow:
1. Open `http://<ALB_DNS>` in browser
2. Browse products → Click a product → Add to cart
3. Go to cart → Proceed to checkout
4. Fill shipping details + use test card: `4242 4242 4242 4242` (any future expiry, any CVC)
5. Payment should succeed → Order confirmation shown

### Admin Panel:
1. Click **Admin** in navigation
2. Login: `admin` / `ShopEasy2026`
3. Verify dashboard shows stats
4. Check Products, Categories, Orders pages

### My Orders:
1. Click **My Orders** in navigation
2. Enter the email used during checkout
3. Should see your order with status tracker

### Grafana:
1. Open `http://<ALB_DNS>/grafana`
2. Login: `admin` / `ShopEasy2026`
3. Go to Dashboards → Should see Business Overview and Infrastructure dashboards

---

## 12.5 Check ECS Service Logs

### AWS Console:
1. Go to **CloudWatch** → **Log groups** → `/ecs/shop-easy`
2. Check log streams:
   - `product/...` — Product service logs
   - `order/...` — Order service logs
   - `frontend/...` — Nginx access logs
   - `observability/...` — Grafana/Prometheus logs

### AWS CLI:
```bash
# View recent product-service logs
aws logs tail /ecs/shop-easy --filter-pattern "product" --since 5m --format short
```

---

## 12.6 Verification Checklist

| ✅ | Test | Result |
|----|------|--------|
| ☐ | All 4 target groups healthy | |
| ☐ | Homepage loads with products | |
| ☐ | /products returns JSON | |
| ☐ | /categories returns JSON | |
| ☐ | /orders/stats/summary returns JSON | |
| ☐ | Grafana login page loads | |
| ☐ | Test payment with 4242 card succeeds | |
| ☐ | Admin panel login works | |
| ☐ | My Orders shows order history | |
| ☐ | No errors in CloudWatch logs | |

---

## Common Issues After Deployment

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| 502 Bad Gateway | Service not running or health check failing | Check ECS service running count, check logs |
| 503 Service Unavailable | Target group has no healthy targets | Wait 30s for health check, or check service |
| Products page empty | db-init didn't run | Run db-init task (Step 11) |
| Payment fails | Wrong Stripe key | Check STRIPE_SECRET_KEY in order task definition |
| Grafana 404 | Observability service not running | Check observability service status |

---

## 🎉 Deployment Complete!

Your Shop Easy application is now live at:
```
App:     http://<ALB_DNS>
Grafana: http://<ALB_DNS>/grafana (admin / ShopEasy2026)
Admin:   http://<ALB_DNS> → Click Admin → Login (admin / ShopEasy2026)
```

---

**Previous:** [11-DB-MIGRATION.md](./11-DB-MIGRATION.md)
**Next:** [13-CLOUDWATCH-DASHBOARD.md](./13-CLOUDWATCH-DASHBOARD.md) — Create CloudWatch Dashboard
