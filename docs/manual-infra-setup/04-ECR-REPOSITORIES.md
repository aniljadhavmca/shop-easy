# Step 4: ECR Repositories

> Create 5 Amazon Elastic Container Registry repositories to store Docker images for each service.

---

## What We're Creating

| Repository | Image For |
|-----------|-----------|
| shop-easy/product-service | Product + Cart + Categories API |
| shop-easy/order-service | Orders + Payments + Auth API |
| shop-easy/frontend | React SPA + Nginx |
| shop-easy/observability | Grafana + Prometheus |
| shop-easy/db-init | Database migration (runs once) |

---

## 4.1 Create ECR Repositories

### AWS Console:
1. Go to **ECR** → **Repositories** → **Create repository**
2. For each repository:
   - **Visibility:** Private
   - **Repository name:** (see table above)
   - **Tag immutability:** Disabled
   - **Image scan on push:** Disabled (optional — enable for security scanning)
3. Click **Create repository**
4. **Repeat for all 5 repositories**

### AWS CLI (all 5 at once):
```bash
for repo in product-service order-service frontend observability db-init; do
  aws ecr create-repository \
    --repository-name "shop-easy/$repo" \
    --image-scanning-configuration scanOnPush=false \
    --query 'repository.repositoryUri' --output text
  echo "✅ Created: shop-easy/$repo"
done
```

---

## 4.2 Get Repository URIs

### AWS Console:
1. Go to **ECR** → **Repositories**
2. Click each repository → Copy the **URI**
   - Format: `123456789012.dkr.ecr.us-east-1.amazonaws.com/shop-easy/product-service`

### AWS CLI:
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"

echo "Registry: $REGISTRY"
echo ""
echo "Image URIs:"
echo "  Product:       $REGISTRY/shop-easy/product-service:latest"
echo "  Order:         $REGISTRY/shop-easy/order-service:latest"
echo "  Frontend:      $REGISTRY/shop-easy/frontend:latest"
echo "  Observability: $REGISTRY/shop-easy/observability:latest"
echo "  DB Init:       $REGISTRY/shop-easy/db-init:latest"
```

---

## 4.3 Verification Checklist

| ✅ | Repository | Created |
|----|-----------|---------|
| ☐ | shop-easy/product-service | |
| ☐ | shop-easy/order-service | |
| ☐ | shop-easy/frontend | |
| ☐ | shop-easy/observability | |
| ☐ | shop-easy/db-init | |

---

## Notes

- Images will be pushed in [Step 8](./08-BUILD-PUSH-IMAGES.md)
- ECR automatically handles image storage and versioning
- 💰 **Cost:** ~$0.10/GB/month (negligible for this project)
- Images are private — only accessible within your AWS account

---

## Resource IDs to Save

```
REGISTRY=123456789012.dkr.ecr.us-east-1.amazonaws.com
```

---

**Previous:** [03-RDS-DATABASE.md](./03-RDS-DATABASE.md)
**Next:** [05-IAM-ROLES.md](./05-IAM-ROLES.md) — Create IAM Roles for ECS
