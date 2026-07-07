# Step 5: IAM Roles

> Create two IAM roles that ECS tasks need: one for pulling images (Execution Role) and one for runtime permissions (Task Role).

---

## What We're Creating

| Role | Purpose | Policies |
|------|---------|----------|
| shop-easy-ecs-execution | ECS agent uses this to pull images from ECR and write logs to CloudWatch | AmazonECSTaskExecutionRolePolicy |
| shop-easy-ecs-task | The running container uses this for ECS Exec (SSM) access | AmazonSSMManagedInstanceCore |

### How It Works:
```
ECS Agent (pulls image, sends logs) → uses Execution Role
Container (your app running inside) → uses Task Role
```

---

## 5.1 Create ECS Execution Role

### AWS Console:
1. Go to **IAM** → **Roles** → **Create role**
2. **Trusted entity type:** AWS service
3. **Use case:** Elastic Container Service → **Elastic Container Service Task**
4. Click **Next**
5. **Permissions:** Search and select:
   - ✅ `AmazonECSTaskExecutionRolePolicy`
6. Click **Next**
7. **Role name:** `shop-easy-ecs-execution`
8. **Description:** ECS execution role for Shop Easy - pulls images and writes logs
9. Click **Create role**

### AWS CLI:
```bash
# Create trust policy file
cat > /tmp/ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the execution role
aws iam create-role \
  --role-name shop-easy-ecs-execution \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
  --description "ECS execution role for Shop Easy"

# Attach the ECS execution policy
aws iam attach-role-policy \
  --role-name shop-easy-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

echo "✅ Execution role created"
```

---

## 5.2 Create ECS Task Role

### AWS Console:
1. Go to **IAM** → **Roles** → **Create role**
2. **Trusted entity type:** AWS service
3. **Use case:** Elastic Container Service → **Elastic Container Service Task**
4. Click **Next**
5. **Permissions:** Search and select:
   - ✅ `AmazonSSMManagedInstanceCore`
6. Click **Next**
7. **Role name:** `shop-easy-ecs-task`
8. **Description:** ECS task role for Shop Easy - enables ECS Exec
9. Click **Create role**

### AWS CLI:
```bash
# Create the task role (same trust policy)
aws iam create-role \
  --role-name shop-easy-ecs-task \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
  --description "ECS task role for Shop Easy - enables ECS Exec"

# Attach SSM policy (for ECS Exec)
aws iam attach-role-policy \
  --role-name shop-easy-ecs-task \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

echo "✅ Task role created"
```

---

## 5.3 Get Role ARNs

### AWS Console:
1. Go to **IAM** → **Roles** → Search `shop-easy`
2. Click each role → Copy the **ARN**

### AWS CLI:
```bash
EXEC_ROLE_ARN=$(aws iam get-role --role-name shop-easy-ecs-execution \
  --query 'Role.Arn' --output text)

TASK_ROLE_ARN=$(aws iam get-role --role-name shop-easy-ecs-task \
  --query 'Role.Arn' --output text)

echo "Execution Role ARN: $EXEC_ROLE_ARN"
echo "Task Role ARN: $TASK_ROLE_ARN"
```

---

## 5.4 Verification Checklist

| ✅ | Role | Trust Entity | Policy Attached |
|----|------|-------------|-----------------|
| ☐ | shop-easy-ecs-execution | ecs-tasks.amazonaws.com | AmazonECSTaskExecutionRolePolicy |
| ☐ | shop-easy-ecs-task | ecs-tasks.amazonaws.com | AmazonSSMManagedInstanceCore |

---

## Why Two Roles?

| Scenario | Role Used |
|----------|-----------|
| ECS agent pulls Docker image from ECR | Execution Role |
| ECS agent pushes container logs to CloudWatch | Execution Role |
| You run `aws ecs execute-command` to SSH into container | Task Role |
| Container needs to call AWS APIs (if needed) | Task Role |

The **Task Role** with SSM policy enables `ECS Exec` — you can shell into running containers for debugging:
```bash
aws ecs execute-command \
  --cluster shop-easy-cluster \
  --task <task-id> \
  --container product-service \
  --interactive \
  --command "/bin/sh"
```

---

## Resource ARNs to Save

```
EXEC_ROLE_ARN=arn:aws:iam::123456789012:role/shop-easy-ecs-execution
TASK_ROLE_ARN=arn:aws:iam::123456789012:role/shop-easy-ecs-task
```

---

**Previous:** [04-ECR-REPOSITORIES.md](./04-ECR-REPOSITORIES.md)
**Next:** [06-ALB-LOAD-BALANCER.md](./06-ALB-LOAD-BALANCER.md) — Create Application Load Balancer
