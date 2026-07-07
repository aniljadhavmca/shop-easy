# Step 14: Cleanup — Destroy All Resources

> Delete all AWS resources to stop billing. Follow this order to avoid dependency errors.

---

## ⚠️ Important: Delete in Reverse Order

Resources have dependencies — you must delete them in the correct order:

```
1. ECS Services (stop tasks first)
2. ECS Cluster
3. ALB + Listener + Target Groups
4. RDS Instance
5. NAT Gateway + Elastic IP
6. ECR Repositories
7. CloudWatch Log Group + Dashboard
8. IAM Roles
9. Security Groups
10. Subnets + Route Tables
11. Internet Gateway
12. VPC
13. Cloud Map Namespace
```

---

## 14.1 Delete ECS Services

### AWS Console:
1. Go to **ECS** → **Clusters** → `shop-easy-cluster` → **Services**
2. Select each service → **Delete service**
   - ✅ Force delete (stops running tasks)
3. Delete all 4: product-service, order-service, frontend, observability

### AWS CLI:
```bash
# Delete all services (force stops tasks)
for svc in product-service order-service frontend observability; do
  echo "Deleting $svc..."
  aws ecs update-service --cluster shop-easy-cluster --service $svc --desired-count 0
  aws ecs delete-service --cluster shop-easy-cluster --service $svc --force
done

echo "⏳ Waiting for tasks to stop..."
sleep 30
echo "✅ All services deleted"
```

---

## 14.2 Delete ECS Cluster

### AWS Console:
1. Go to **ECS** → **Clusters** → `shop-easy-cluster` → **Delete cluster**
2. Type `delete shop-easy-cluster` to confirm

### AWS CLI:
```bash
aws ecs delete-cluster --cluster shop-easy-cluster
echo "✅ Cluster deleted"
```

---

## 14.3 Delete Load Balancer

### AWS Console:
1. Go to **EC2** → **Load Balancers** → Select `shop-easy-alb` → **Actions** → **Delete**
2. Go to **Target Groups** → Delete all 4 target groups

### AWS CLI:
```bash
# Delete ALB
ALB_ARN=$(aws elbv2 describe-load-balancers --names shop-easy-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN

# Wait for ALB to be deleted
echo "⏳ Waiting for ALB deletion..."
sleep 30

# Delete Target Groups
for tg_name in shop-easy-frontend-tg shop-easy-product-tg shop-easy-order-tg shop-easy-observe-tg; do
  TG_ARN=$(aws elbv2 describe-target-groups --names $tg_name \
    --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null)
  if [ "$TG_ARN" != "None" ] && [ -n "$TG_ARN" ]; then
    aws elbv2 delete-target-group --target-group-arn $TG_ARN
    echo "Deleted: $tg_name"
  fi
done
echo "✅ ALB and target groups deleted"
```

---

## 14.4 Delete RDS Instance

### AWS Console:
1. Go to **RDS** → **Databases** → Select `shop-easy-db`
2. **Actions** → **Delete**
3. ❌ Uncheck "Create final snapshot"
4. ✅ Check "I acknowledge..."
5. Type `delete me` → **Delete**
6. ⏳ Wait 5-10 minutes

### AWS CLI:
```bash
aws rds delete-db-instance \
  --db-instance-identifier shop-easy-db \
  --skip-final-snapshot \
  --delete-automated-backups

echo "⏳ Waiting for RDS deletion (5-10 min)..."
aws rds wait db-instance-deleted --db-instance-identifier shop-easy-db
echo "✅ RDS deleted"

# Delete subnet group
aws rds delete-db-subnet-group --db-subnet-group-name shop-easy-db-subnet
echo "✅ DB subnet group deleted"
```

---

## 14.5 Delete NAT Gateway & Elastic IP

### AWS Console:
1. Go to **VPC** → **NAT Gateways** → Select `shop-easy-nat` → **Actions** → **Delete**
2. ⏳ Wait for status: Deleted
3. Go to **Elastic IPs** → Select the NAT EIP → **Actions** → **Release**

### AWS CLI:
```bash
# Delete NAT Gateway
NAT_ID=$(aws ec2 describe-nat-gateways \
  --filter Name=tag:Name,Values=shop-easy-nat Name=state,Values=available \
  --query 'NatGateways[0].NatGatewayId' --output text)

aws ec2 delete-nat-gateway --nat-gateway-id $NAT_ID
echo "⏳ Waiting for NAT Gateway deletion..."
sleep 60

# Release Elastic IP
EIP_ALLOC=$(aws ec2 describe-addresses \
  --filters Name=tag:Name,Values=shop-easy-nat-eip \
  --query 'Addresses[0].AllocationId' --output text)

aws ec2 release-address --allocation-id $EIP_ALLOC
echo "✅ NAT Gateway and EIP deleted"
```

---

## 14.6 Delete ECR Repositories

### AWS Console:
1. Go to **ECR** → **Repositories**
2. Select all 5 repos → **Delete** (force delete removes images too)

### AWS CLI:
```bash
for repo in product-service order-service frontend observability db-init; do
  aws ecr delete-repository --repository-name "shop-easy/$repo" --force
  echo "Deleted: shop-easy/$repo"
done
echo "✅ All ECR repos deleted"
```

---

## 14.7 Delete CloudWatch Resources

### AWS CLI:
```bash
# Delete log group
aws logs delete-log-group --log-group-name /ecs/shop-easy
echo "✅ Log group deleted"

# Delete dashboard
aws cloudwatch delete-dashboards --dashboard-names shop-easy-orders
echo "✅ Dashboard deleted"
```

---

## 14.8 Delete IAM Roles

### AWS CLI:
```bash
# Detach policies and delete execution role
aws iam detach-role-policy --role-name shop-easy-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role --role-name shop-easy-ecs-execution

# Detach policies and delete task role
aws iam detach-role-policy --role-name shop-easy-ecs-task \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role --role-name shop-easy-ecs-task

echo "✅ IAM roles deleted"
```

---

## 14.9 Delete Security Groups

### AWS CLI:
```bash
# Must delete in order (RDS SG first, then ECS, then ALB)
RDS_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=shop-easy-rds-sg \
  --query 'SecurityGroups[0].GroupId' --output text)
ECS_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=shop-easy-ecs-sg \
  --query 'SecurityGroups[0].GroupId' --output text)
ALB_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=shop-easy-alb-sg \
  --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 delete-security-group --group-id $RDS_SG
aws ec2 delete-security-group --group-id $ECS_SG
aws ec2 delete-security-group --group-id $ALB_SG
echo "✅ Security groups deleted"
```

---

## 14.10 Delete VPC and Networking

### AWS CLI:
```bash
VPC_ID=$(aws ec2 describe-vpcs --filters Name=tag:Name,Values=shop-easy-vpc \
  --query 'Vpcs[0].VpcId' --output text)

# Delete subnets
for subnet in $(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID \
  --query 'Subnets[].SubnetId' --output text); do
  aws ec2 delete-subnet --subnet-id $subnet
done

# Delete route tables (non-main only)
for rt in $(aws ec2 describe-route-tables --filters Name=vpc-id,Values=$VPC_ID \
  --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' --output text); do
  # Disassociate first
  for assoc in $(aws ec2 describe-route-tables --route-table-ids $rt \
    --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text); do
    aws ec2 disassociate-route-table --association-id $assoc
  done
  aws ec2 delete-route-table --route-table-id $rt
done

# Detach and delete Internet Gateway
IGW_ID=$(aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=$VPC_ID \
  --query 'InternetGateways[0].InternetGatewayId' --output text)
aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID

# Delete VPC
aws ec2 delete-vpc --vpc-id $VPC_ID
echo "✅ VPC and all networking deleted"
```

---

## 14.11 Delete Cloud Map Namespace

### AWS CLI:
```bash
NS_ID=$(aws servicediscovery list-namespaces \
  --query "Namespaces[?Name=='shop-easy'].Id" --output text)

# Delete any services in the namespace first
for svc_id in $(aws servicediscovery list-services \
  --filters Name=NAMESPACE_ID,Values=$NS_ID \
  --query 'Services[].Id' --output text); do
  aws servicediscovery delete-service --id $svc_id
done

aws servicediscovery delete-namespace --id $NS_ID
echo "✅ Cloud Map namespace deleted"
```

---

## 14.12 All-in-One Cleanup Script

```bash
#!/bin/bash
set -e
echo "🗑️ Destroying all Shop Easy resources..."

# 1. ECS Services
for svc in product-service order-service frontend observability; do
  aws ecs update-service --cluster shop-easy-cluster --service $svc --desired-count 0 2>/dev/null || true
  aws ecs delete-service --cluster shop-easy-cluster --service $svc --force 2>/dev/null || true
done
sleep 30

# 2. ECS Cluster
aws ecs delete-cluster --cluster shop-easy-cluster 2>/dev/null || true

# 3. ALB
ALB_ARN=$(aws elbv2 describe-load-balancers --names shop-easy-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null)
[ "$ALB_ARN" != "None" ] && aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
sleep 30
for tg in shop-easy-frontend-tg shop-easy-product-tg shop-easy-order-tg shop-easy-observe-tg; do
  TG_ARN=$(aws elbv2 describe-target-groups --names $tg --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null) || true
  [ -n "$TG_ARN" ] && [ "$TG_ARN" != "None" ] && aws elbv2 delete-target-group --target-group-arn $TG_ARN
done

# 4. RDS
aws rds delete-db-instance --db-instance-identifier shop-easy-db --skip-final-snapshot --delete-automated-backups 2>/dev/null || true
echo "⏳ Waiting for RDS deletion..."
aws rds wait db-instance-deleted --db-instance-identifier shop-easy-db 2>/dev/null || true
aws rds delete-db-subnet-group --db-subnet-group-name shop-easy-db-subnet 2>/dev/null || true

# 5. NAT Gateway
NAT_ID=$(aws ec2 describe-nat-gateways --filter Name=tag:Name,Values=shop-easy-nat Name=state,Values=available --query 'NatGateways[0].NatGatewayId' --output text 2>/dev/null)
[ "$NAT_ID" != "None" ] && [ -n "$NAT_ID" ] && aws ec2 delete-nat-gateway --nat-gateway-id $NAT_ID
sleep 60
EIP_ALLOC=$(aws ec2 describe-addresses --filters Name=tag:Name,Values=shop-easy-nat-eip --query 'Addresses[0].AllocationId' --output text 2>/dev/null)
[ "$EIP_ALLOC" != "None" ] && [ -n "$EIP_ALLOC" ] && aws ec2 release-address --allocation-id $EIP_ALLOC

# 6. ECR
for repo in product-service order-service frontend observability db-init; do
  aws ecr delete-repository --repository-name "shop-easy/$repo" --force 2>/dev/null || true
done

# 7. CloudWatch
aws logs delete-log-group --log-group-name /ecs/shop-easy 2>/dev/null || true
aws cloudwatch delete-dashboards --dashboard-names shop-easy-orders 2>/dev/null || true

# 8. IAM
aws iam detach-role-policy --role-name shop-easy-ecs-execution --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || true
aws iam delete-role --role-name shop-easy-ecs-execution 2>/dev/null || true
aws iam detach-role-policy --role-name shop-easy-ecs-task --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2>/dev/null || true
aws iam delete-role --role-name shop-easy-ecs-task 2>/dev/null || true

# 9-11. VPC (SGs, Subnets, IGW, VPC)
VPC_ID=$(aws ec2 describe-vpcs --filters Name=tag:Name,Values=shop-easy-vpc --query 'Vpcs[0].VpcId' --output text 2>/dev/null)
if [ "$VPC_ID" != "None" ] && [ -n "$VPC_ID" ]; then
  # Security Groups
  for sg_name in shop-easy-rds-sg shop-easy-ecs-sg shop-easy-alb-sg; do
    SG_ID=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$sg_name --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
    [ "$SG_ID" != "None" ] && [ -n "$SG_ID" ] && aws ec2 delete-security-group --group-id $SG_ID 2>/dev/null || true
  done
  # Subnets
  for subnet in $(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID --query 'Subnets[].SubnetId' --output text); do
    aws ec2 delete-subnet --subnet-id $subnet 2>/dev/null || true
  done
  # Route Tables
  for rt in $(aws ec2 describe-route-tables --filters Name=vpc-id,Values=$VPC_ID --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' --output text); do
    for assoc in $(aws ec2 describe-route-tables --route-table-ids $rt --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text 2>/dev/null); do
      aws ec2 disassociate-route-table --association-id $assoc 2>/dev/null || true
    done
    aws ec2 delete-route-table --route-table-id $rt 2>/dev/null || true
  done
  # IGW
  IGW_ID=$(aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=$VPC_ID --query 'InternetGateways[0].InternetGatewayId' --output text 2>/dev/null)
  [ "$IGW_ID" != "None" ] && [ -n "$IGW_ID" ] && aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID && aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID
  # VPC
  aws ec2 delete-vpc --vpc-id $VPC_ID
fi

# 12. Cloud Map
NS_ID=$(aws servicediscovery list-namespaces --query "Namespaces[?Name=='shop-easy'].Id" --output text 2>/dev/null)
if [ "$NS_ID" != "None" ] && [ -n "$NS_ID" ]; then
  for svc_id in $(aws servicediscovery list-services --filters Name=NAMESPACE_ID,Values=$NS_ID --query 'Services[].Id' --output text 2>/dev/null); do
    aws servicediscovery delete-service --id $svc_id 2>/dev/null || true
  done
  aws servicediscovery delete-namespace --id $NS_ID 2>/dev/null || true
fi

echo ""
echo "🎉 All Shop Easy resources destroyed!"
echo "💰 No more charges will be incurred."
```

---

## 14.13 Verification

After cleanup, verify nothing remains:
```bash
echo "Checking for remaining resources..."
aws ecs list-clusters --query 'clusterArns[?contains(@, `shop-easy`)]'
aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`shop-easy-db`].DBInstanceStatus'
aws ec2 describe-vpcs --filters Name=tag:Name,Values=shop-easy-vpc --query 'Vpcs[].VpcId'
aws ecr describe-repositories --query 'repositories[?contains(repositoryName, `shop-easy`)].repositoryName'
```

All should return empty arrays `[]`.

---

## Cost After Cleanup

$0/month — all resources deleted, no ongoing charges.

---

**Previous:** [13-CLOUDWATCH-DASHBOARD.md](./13-CLOUDWATCH-DASHBOARD.md)
**Back to Overview:** [00-OVERVIEW.md](./00-OVERVIEW.md)
