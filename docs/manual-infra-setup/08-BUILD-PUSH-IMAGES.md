# Step 8: Build & Push Docker Images

> Build all 5 Docker images locally and push them to ECR repositories.

---

## Prerequisites

- Docker Desktop running
- AWS CLI configured (`aws configure`)
- Project source code cloned locally

---

## 8.1 Login to ECR

### Get your Account ID and Registry URL:
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "Account: $ACCOUNT_ID"
echo "Registry: $REGISTRY"
```

### Authenticate Docker with ECR:
```bash
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $REGISTRY

# Expected output: "Login Succeeded"
```

---

## 8.2 Build & Push All Images

Run these commands from the **project root** (`shop-easy/` directory):

### Product Service:
```bash
docker build --platform linux/amd64 --provenance=false --no-cache \
  -t $REGISTRY/shop-easy/product-service:latest \
  ./product-service

docker push $REGISTRY/shop-easy/product-service:latest
echo "✅ Product service pushed"
```

### Order Service:
```bash
docker build --platform linux/amd64 --provenance=false --no-cache \
  -t $REGISTRY/shop-easy/order-service:latest \
  ./order-service

docker push $REGISTRY/shop-easy/order-service:latest
echo "✅ Order service pushed"
```

### Frontend (requires Stripe publishable key):
```bash
docker build --platform linux/amd64 --provenance=false --no-cache \
  --build-arg REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here \
  -t $REGISTRY/shop-easy/frontend:latest \
  ./frontend

docker push $REGISTRY/shop-easy/frontend:latest
echo "✅ Frontend pushed"
```

> ⚠️ Replace `pk_test_your_key_here` with your actual Stripe publishable key

### Observability (Grafana + Prometheus):
```bash
docker build --platform linux/amd64 --provenance=false --no-cache \
  -t $REGISTRY/shop-easy/observability:latest \
  ./observability-service

docker push $REGISTRY/shop-easy/observability:latest
echo "✅ Observability pushed"
```

### DB Init (database migration):
```bash
docker build --platform linux/amd64 --provenance=false --no-cache \
  -t $REGISTRY/shop-easy/db-init:latest \
  ./db-init

docker push $REGISTRY/shop-easy/db-init:latest
echo "✅ DB Init pushed"
```

---

## 8.3 All-in-One Script

```bash
#!/bin/bash
set -e

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
STRIPE_PK="pk_test_your_key_here"  # ← Replace this

# Login
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $REGISTRY

# Build & push backend services
for svc in product-service order-service db-init; do
  echo "🔨 Building $svc..."
  docker build --platform linux/amd64 --provenance=false --no-cache \
    -t $REGISTRY/shop-easy/$svc:latest ./$svc
  docker push $REGISTRY/shop-easy/$svc:latest
  echo "✅ $svc pushed"
done

# Observability
echo "🔨 Building observability..."
docker build --platform linux/amd64 --provenance=false --no-cache \
  -t $REGISTRY/shop-easy/observability:latest ./observability-service
docker push $REGISTRY/shop-easy/observability:latest
echo "✅ Observability pushed"

# Frontend (with Stripe key)
echo "🔨 Building frontend..."
docker build --platform linux/amd64 --provenance=false --no-cache \
  --build-arg REACT_APP_STRIPE_PUBLISHABLE_KEY=$STRIPE_PK \
  -t $REGISTRY/shop-easy/frontend:latest ./frontend
docker push $REGISTRY/shop-easy/frontend:latest
echo "✅ Frontend pushed"

echo ""
echo "🎉 All 5 images pushed to ECR!"
```

---

## 8.4 Verify Images in ECR

### AWS Console:
1. Go to **ECR** → **Repositories**
2. Click each repository → Verify `latest` tag exists with recent push date

### AWS CLI:
```bash
for repo in product-service order-service frontend observability db-init; do
  echo -n "shop-easy/$repo: "
  aws ecr describe-images \
    --repository-name "shop-easy/$repo" \
    --query 'imageDetails[0].imagePushedAt' --output text 2>/dev/null || echo "NOT FOUND"
done
```

---

## 8.5 Verification Checklist

| ✅ | Image | Pushed |
|----|-------|--------|
| ☐ | shop-easy/product-service:latest | |
| ☐ | shop-easy/order-service:latest | |
| ☐ | shop-easy/frontend:latest | |
| ☐ | shop-easy/observability:latest | |
| ☐ | shop-easy/db-init:latest | |

---

## Important Notes

- `--platform linux/amd64` is required because ECS Fargate runs on x86_64 (even if you're on Mac M1/M2)
- `--provenance=false` prevents multi-platform manifest issues with ECR
- `--no-cache` ensures fresh builds
- Frontend build bakes the Stripe publishable key into the React bundle at build time
- ECR login token expires after 12 hours — re-run login if push fails

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `no basic auth credentials` | Re-run the ECR login command |
| `denied: Your authorization token has expired` | Re-run ECR login |
| Build fails on M1/M2 Mac | Ensure `--platform linux/amd64` is set |
| Push timeout | Check internet connection, try again |

---

**Previous:** [07-ECS-CLUSTER.md](./07-ECS-CLUSTER.md)
**Next:** [09-ECS-TASK-DEFINITIONS.md](./09-ECS-TASK-DEFINITIONS.md) — Create Task Definitions
