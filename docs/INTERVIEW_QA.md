# 🎯 Shop Easy — DevOps & Developer Interview Q&A

> Tricky questions and answers based on real decisions made in this project.

---

## 🔧 DevOps / Infrastructure Questions

### Q1: ECS tasks are in private subnets with no public IPs. How do containers pull images from ECR and call Stripe API?

**A:** A NAT Gateway in the public subnet provides outbound-only internet access for the private subnets. ECS tasks route outbound traffic through the NAT Gateway → Internet Gateway. Inbound traffic from users comes through ALB only. This is the proper production pattern.

```hcl
# Private subnet route table
route {
  cidr_block     = "0.0.0.0/0"
  nat_gateway_id = aws_nat_gateway.main.id  # ← Outbound via NAT
}

# ECS in private subnets, no public IP
network_configuration {
  subnets          = aws_subnet.private[*].id
  security_groups  = [aws_security_group.ecs.id]
  assign_public_ip = false
}
```

**Cost:** ~$32/month for NAT Gateway, but provides proper network isolation.

---

### Q2: RDS is marked `publicly_accessible = false` but it's in a `public` subnet group. Is that a mistake?

**A:** No. `publicly_accessible = false` means RDS won't get a public DNS/IP regardless of subnet type. The subnet group uses public subnets to avoid needing additional private subnets in some setups, but the security group locks access to only the ECS security group on port 3306. The DB is effectively private.

```hcl
ingress {
  from_port       = 3306
  to_port         = 3306
  protocol        = "tcp"
  security_groups = [aws_security_group.ecs.id]  # Only ECS can reach DB
}
```

---

### Q3: The ECS task only has an execution role, not a task role. What's the difference and what breaks?

**A:** 
- **Execution role** = permissions for ECS agent (pull images from ECR, push logs to CloudWatch)
- **Task role** = permissions for your application code (call S3, DynamoDB, CloudWatch PutMetricData, etc.)

Without a task role, the app inside the container has NO AWS permissions. That's why CloudWatch EMF (Embedded Metric Format) failed in this project — the container couldn't call `cloudwatch:PutMetricData`. We solved it by using log-based dashboard widgets instead.

---

### Q4: S3 bucket name uses `shop-easy-tf-state-{ACCOUNT_ID}`. Why not a simple static name?

**A:** S3 bucket names are **globally unique** across ALL AWS accounts worldwide. If someone else already has `shop-easy-tf-state`, your deployment fails. Using the AWS Account ID guarantees uniqueness per deployer.

```yaml
TF_STATE_BUCKET: shop-easy-tf-state-${{ steps.account.outputs.ACCOUNT_ID }}
```

---

### Q5: The Terraform backend config doesn't hardcode the bucket name. How does `terraform init` know which bucket to use?

**A:** The bucket is passed dynamically via CLI flag:

```bash
terraform init -backend-config="bucket=$TF_STATE_BUCKET"
```

This allows the same Terraform code to work across different AWS accounts/environments without modifying `backend.tf`.

---

### Q6: Why does the GitHub Actions workflow refresh AWS credentials before the "Wait for Stable" step?

**A:** The full deployment takes ~15 minutes. Sandbox/temporary AWS credentials can expire during this time. The pipeline re-exports credentials before long-running steps to avoid `ExpiredToken` errors mid-deploy.

---

### Q7: ALB listener has a default action forwarding to frontend. What would happen if you set the frontend rule at priority 10 with `/*`?

**A:** ALL traffic would match `/*` first (priority 10 is highest). The product (`/products*`) and order (`/orders*`) paths at priority 20+ would never be reached. APIs would be completely unreachable. That's why specific paths get higher priority (lower number) and `/*` is the default fallback action — not a rule.

```hcl
# Priority 10 = /products*, /cart*  → Product Service
# Priority 20 = /orders*, /payments* → Order Service  
# Default (no priority) = /*        → Frontend
```

---

### Q8: The db-init runs as a one-shot ECS RunTask. What happens if it fails? What if it runs twice?

**A:** 
- **If it fails:** GitHub Actions step fails, pipeline stops. Services won't start with empty/broken schema.
- **If it runs twice:** The SQL uses `CREATE TABLE IF NOT EXISTS` and `INSERT IGNORE`, so it's **idempotent** — running multiple times won't duplicate data or error out.

---

### Q9: Why 256 CPU / 512 MB memory for all tasks? Why not different sizes?

**A:** This is the smallest Fargate configuration ($0.01/hour). For a demo/portfolio project, all 3 services fit comfortably in this tier. In production, you'd size based on load testing — order-service might need more CPU for Stripe API calls under heavy traffic.

---

### Q10: How do ECS services achieve zero-downtime deployment?

**A:** ECS rolling update strategy:
1. Spins up new task with updated image
2. ALB health check passes (`/health` endpoint returns 200)
3. ALB starts routing traffic to new task
4. Old task drains connections and stops

If the new task fails health checks, ECS rolls back automatically.

---

### Q11: The ECS security group allows inbound on ALL ports (0-65535) from ALB. Isn't that too permissive?

**A:** In this setup, each service only exposes one port (80, 4001, 4002), so it's functionally fine. However, in production, you'd restrict to specific ports per service. The broad rule simplifies Terraform for a 3-service setup where all services share one security group.

---

### Q12: CloudWatch log retention is set to 3 days. Why so short?

**A:** Cost optimization. CloudWatch Logs charges for storage ($0.03/GB/month). For a demo project, 3 days is enough to observe behavior. Production would use 30-90 days with log export to S3 for long-term retention.

```hcl
resource "aws_cloudwatch_log_group" "ecs" {
  retention_in_days = 3
}
```

---

## 💻 Developer / Application Questions

### Q13: Stripe returns card errors client-side (declined, expired). How do you track failed payments in the backend?

**A:** Stripe Elements validates cards in the browser. If `stripe.confirmCardPayment()` returns an error, the backend never knows about it. Solution: frontend explicitly calls `POST /payments/failed` with the order_id and error reason.

```javascript
// Frontend — on Stripe error
if (result.error) {
  await fetch('/payments/failed', {
    method: 'POST',
    body: JSON.stringify({ order_id, reason: result.error.message })
  });
}
```

---

### Q14: MySQL ENUM for orders.status was `('pending', 'paid')`. What happens when you try `SET status = 'failed'`?

**A:** MySQL **silently ignores** the update — no error, no exception. The row keeps its old value. This is a nasty silent bug. The fix was adding `'failed'` to the ENUM:

```sql
ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'paid', 'failed') DEFAULT 'pending';
```

---

### Q15: Why clear the cart only after payment confirmation, not when the order is created?

**A:** If you clear on order creation and the payment fails (declined card), the user loses their cart and has to re-add everything. By clearing only after `paymentIntent.status === 'succeeded'`, the cart is preserved on failure.

```javascript
// Only on success:
await pool.query('DELETE FROM cart_items WHERE user_id = ?', [order[0].user_id]);
```

---

### Q16: The order-service uses `console.log(JSON.stringify({...}))` for logging. Why not a logging library like Winston?

**A:** With ECS + awslogs driver, stdout goes directly to CloudWatch. A structured JSON string is all CloudWatch Logs Insights needs to parse fields. Winston adds complexity (transports, levels, formatters) without benefit here — the container's stdout IS the log pipeline.

---

### Q17: CloudWatch dashboard queries use `@message like /ORDER_BOOKED/` instead of `filter event = "ORDER_BOOKED"`. Why?

**A:** ECS awslogs driver wraps container stdout as a flat string in `@message`. CloudWatch doesn't auto-parse JSON fields from ECS logs like it does for Lambda. So `event` as a field doesn't exist — you must regex-match the raw `@message` string.

```
# This WORKS:
filter @message like /ORDER_BOOKED/

# This FAILS (field doesn't exist):
filter event = "ORDER_BOOKED"
```

---

### Q18: The PaymentIntent includes `receipt_email`, `shipping`, and `metadata`. Why not just the amount?

**A:** 
- `receipt_email` → Stripe sends automated receipt to the customer
- `shipping` → Shows in Stripe Dashboard under payment details
- `metadata` → Searchable in Stripe Dashboard (find payment by order_id, customer name)

Without these, Stripe Dashboard shows generic payments with no business context.

---

### Q19: Why use `mysql2/promise` with a connection pool instead of a single connection?

**A:** A single connection:
- Blocks if a query is slow (all requests queue)
- Dies if the connection drops (server crashes until reconnect)

A pool (`connectionLimit: 5`):
- Handles 5 concurrent queries
- Auto-reconnects dead connections
- Shares connections across requests efficiently

---

### Q20: The `POST /orders` endpoint uses a transaction with `BEGIN` and `COMMIT`. What would happen without it?

**A:** Without a transaction, if the server crashes between inserting the order and clearing cart items, you'd have:
- Order created ✅
- Order items partially inserted ❌
- Stock not decremented ❌

The transaction ensures all-or-nothing: either the entire order + items + stock update succeeds, or everything rolls back.

---

### Q21: Frontend is React but served by Nginx in production. Why not `serve` or Express?

**A:** After `npm run build`, React outputs static HTML/JS/CSS. Nginx serves static files 10x faster than Node.js, handles gzip compression, and supports proper SPA routing (fallback to index.html for client-side routes). It also uses ~10MB RAM vs ~50MB for a Node process.

---

### Q22: Docker Compose uses `service_healthy` condition for depends_on. What happens without it?

**A:** Without health checks, services start immediately after the DB container starts (not after MySQL is ready). The product-service would crash with `ECONNREFUSED` because MySQL takes 10-15 seconds to initialize. `service_healthy` waits for `mysqladmin ping` to succeed.

```yaml
depends_on:
  db: { condition: service_healthy }
```

---

### Q23: You have two `schema.sql` files — one in `database/` and one in `db-init/`. Why not share one?

**A:** Different deployment contexts:
- `database/schema.sql` → mounted into MySQL container via docker-compose volume (local dev)
- `db-init/schema.sql` → baked into a custom Docker image that runs `mysql` CLI against RDS (AWS deploy)

The db-init container uses a Node.js or shell script to connect to remote RDS — it can't use MySQL's init mechanism. Both files must stay manually synced (a known maintenance burden).

---

### Q24: The ALB health check hits `/health` which does `SELECT 1`. Why not just return 200 without a DB check?

**A:** If the DB connection dies, a simple 200 would tell the ALB "I'm healthy" while every real request fails. By checking DB connectivity, an unhealthy response triggers ECS to replace the task — self-healing.

```javascript
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch (e) { res.status(503).json({ status: 'unhealthy' }); }
});
```

---

### Q25: `stripe.paymentIntents.create()` uses `Math.round(order[0].total * 100)`. Why the multiply and round?

**A:** Stripe accepts amounts in **cents** (smallest currency unit), not dollars. `$29.99` must be sent as `2999`. `Math.round()` prevents floating-point issues like `29.99 * 100 = 2998.9999999`.

---

## 🏗️ Architecture / Design Questions

### Q26: Why 3 microservices instead of a monolith for a small e-commerce app?

**A:** For a demo/portfolio project, microservices showcase:
- Independent deploys (fix order-service without touching frontend)
- Service isolation (Stripe SDK only in order-service)
- ALB path-based routing skills

Trade-off: more complexity for a small app. In production, start monolith → extract services when scale demands it.

---

### Q27: Why ALB instead of API Gateway for routing?

**A:** 
| Feature | ALB | API Gateway |
|---------|-----|-------------|
| Cost | ~$16/mo flat | $3.50/million requests |
| Path routing | ✅ | ✅ |
| WebSocket | ✅ | ✅ |
| Auth/throttling | ❌ | ✅ |
| Best for | Internal microservices | Public APIs with auth |

For container-to-container routing without auth/rate-limiting, ALB is simpler and cheaper.

---

### Q28: No message queue (SQS/SNS) between services. When would you add one?

**A:** Current: Order-service directly processes payment synchronously. Add a queue when:
- Payment processing takes >30s (async processing)
- You need retry logic on failures
- Services need to be decoupled (order-service shouldn't wait for email-service)
- Traffic spikes need buffering

---

### Q29: Single-AZ RDS with `skip_final_snapshot = true`. What's the production risk?

**A:** 
- **Single-AZ** → if the AZ goes down, DB is gone until AWS restores it (minutes to hours)
- **skip_final_snapshot** → on `terraform destroy`, the DB is deleted with NO backup

Production fix: `multi_az = true` ($30/mo more) + `skip_final_snapshot = false` + automated backups.

---

### Q30: The frontend Nginx config proxies API calls. Why not call backend services directly from the browser?

**A:** 
- **CORS nightmare** — browser blocks cross-origin requests without proper headers
- **Single origin** — ALB serves everything on port 80, no CORS needed
- **Security** — backend ports (4001, 4002) aren't exposed to internet
- **Simplicity** — frontend just calls `/products`, `/orders` on same domain

---

## 🔐 Security Questions

### Q31: Stripe secret key is passed as an environment variable to ECS. Is this secure?

**A:** It's acceptable for this setup but not ideal. Better approaches:
1. **AWS Secrets Manager** → ECS natively fetches secrets at task start
2. **SSM Parameter Store** → cheaper, same concept

Current approach: GitHub Secret → env var in task definition → visible in ECS console. Anyone with AWS console access can see it. Secrets Manager encrypts at rest and rotates automatically.

---

### Q32: The ALB security group allows inbound from `0.0.0.0/0` on port 80. How would you restrict it?

**A:** For a public e-commerce site, this is correct — anyone should access it. To restrict:
- Add WAF (Web Application Firewall) for rate limiting/IP blocking
- Add CloudFront in front of ALB for DDoS protection
- Use HTTPS (ACM certificate + listener on 443)

---

### Q33: There's no authentication/authorization. How would you add it without changing architecture?

**A:** Options:
1. **Cognito + ALB** — ALB natively integrates with Cognito for auth before routing
2. **JWT middleware** — Each service validates tokens from a shared secret
3. **API Gateway** — Replace ALB with API Gateway + Cognito authorizer

Fastest: ALB + Cognito (zero code changes, just Terraform).

---

## 🚀 CI/CD Questions

### Q34: The pipeline builds Docker images with `--platform linux/amd64`. Why specify platform?

**A:** GitHub Actions runners and Apple Silicon Macs default to `arm64`. ECS Fargate in most regions runs `amd64`. Without `--platform linux/amd64`, you'd get `exec format error` when ECS tries to run an ARM image on x86 infrastructure.

---

### Q35: `terraform destroy` is in the same workflow as deploy. What prevents accidental destruction?

**A:** The workflow uses `workflow_dispatch` with an input choice:

```yaml
inputs:
  action:
    type: choice
    options: [deploy, destroy]
```

You must manually select "destroy" and click "Run workflow". There's no way to accidentally trigger it via push/PR.

---

### Q36: What happens if the pipeline fails mid-deploy (after Terraform but before ECS services start)?

**A:** Infrastructure exists but services have no images (or old images). On next run:
- Terraform detects existing resources → only applies diff
- Docker builds push new images
- ECS updates to latest image

The pipeline is **idempotent** — safe to re-run after failure.

---

## 📊 Monitoring Questions

### Q37: Dashboard uses `parse @message /\"amount\":(?<amt>[\d.]+)/` to extract revenue. Why regex instead of JSON parse?

**A:** CloudWatch Logs Insights can't auto-parse JSON from ECS container logs (unlike Lambda where `@message` is auto-parsed). The `parse` command with regex extracts fields from the raw string. Alternative: `parse @message '* "amount":* *'` glob syntax, but regex is more precise.

---

### Q38: The "Orders Over Time" widget bins by 5 minutes. What happens if you bin by 1 second?

**A:** With low traffic, most 1-second bins would be empty (sparse data). The chart would be unreadable with gaps everywhere. 5-minute bins aggregate enough events to show meaningful trends while still being granular.

---

### Q39: Log table shows last 50 events. How would you alert on failures in real-time?

**A:** Create a CloudWatch Metric Filter:
```
filter_pattern = "ORDER_FAILED"
metric_name    = "FailedOrders"
```
Then a CloudWatch Alarm → SNS → email/Slack when `FailedOrders > 5` in 5 minutes.

---

### Q40: Why 7 dashboard panels and not just CloudWatch Alarms?

**A:** Different purposes:
- **Dashboard** = visual overview for humans (trends, patterns, recent events)
- **Alarms** = automated response (alert when threshold breached)

Both should exist in production. Dashboard for daily monitoring, alarms for incidents.

---

## 💡 Bonus: "What Would You Do Differently in Production?"

| Area | Current | Production |
|------|---------|-----------|
| Database | Single-AZ, no backup | Multi-AZ, automated backups, read replicas |
| Secrets | Env vars | AWS Secrets Manager |
| Auth | None | Cognito + JWT |
| HTTPS | No | ACM + ALB HTTPS listener |
| Scaling | Fixed 1 task | Auto-scaling (CPU/memory targets) |
| CI/CD | Single workflow | Separate staging + prod environments |
| Monitoring | Dashboard only | + Alarms + X-Ray tracing |
| Security | Basic SGs | WAF + VPC Flow Logs + GuardDuty |
| State | S3 only | S3 + DynamoDB lock table |
| Images | `:latest` tag | Git SHA tags for rollback |

---

*Generated from the actual Shop Easy codebase — every answer references real code and real decisions made in this project.*
