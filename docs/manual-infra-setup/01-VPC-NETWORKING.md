# Step 1: VPC & Networking

> Create the Virtual Private Cloud with public/private subnets, Internet Gateway, NAT Gateway, and Route Tables.

---

## What We're Creating

| Resource | Purpose |
|----------|---------|
| VPC (10.0.0.0/16) | Isolated network for all resources |
| 2 Public Subnets | For ALB and NAT Gateway (internet-facing) |
| 2 Private Subnets | For ECS tasks and RDS (no direct internet) |
| Internet Gateway | Allows public subnets to reach internet |
| NAT Gateway | Allows private subnets outbound-only internet (ECR pulls, Stripe API) |
| Route Tables | Controls traffic routing |

---

## 1.1 Create VPC

### AWS Console:
1. Go to **VPC** → **Your VPCs** → **Create VPC**
2. Settings:
   - **Name tag:** `shop-easy-vpc`
   - **IPv4 CIDR block:** `10.0.0.0/16`
   - **IPv6 CIDR block:** No IPv6
   - **Tenancy:** Default
3. Click **Create VPC**

### AWS CLI:
```bash
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=shop-easy-vpc}]' \
  --query 'Vpc.VpcId' --output text
```

### Enable DNS:
```bash
# Replace vpc-xxxxx with your VPC ID
aws ec2 modify-vpc-attribute --vpc-id vpc-xxxxx --enable-dns-hostnames '{"Value": true}'
aws ec2 modify-vpc-attribute --vpc-id vpc-xxxxx --enable-dns-support '{"Value": true}'
```

> 📝 **Note down:** VPC ID (e.g., `vpc-0abc123def456`)

---

## 1.2 Create Internet Gateway

### AWS Console:
1. Go to **VPC** → **Internet Gateways** → **Create internet gateway**
2. **Name tag:** `shop-easy-igw`
3. Click **Create internet gateway**
4. Select the IGW → **Actions** → **Attach to VPC** → Select `shop-easy-vpc`

### AWS CLI:
```bash
# Create IGW
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=shop-easy-igw}]' \
  --query 'InternetGateway.InternetGatewayId' --output text)

# Attach to VPC
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id vpc-xxxxx
```

> 📝 **Note down:** Internet Gateway ID

---

## 1.3 Create Public Subnets (2)

### AWS Console:
1. Go to **VPC** → **Subnets** → **Create subnet**
2. **VPC:** Select `shop-easy-vpc`

**Subnet 1:**
- **Name:** `shop-easy-public-1`
- **Availability Zone:** `us-east-1a`
- **IPv4 CIDR:** `10.0.1.0/24`

**Subnet 2:** (Click "Add new subnet")
- **Name:** `shop-easy-public-2`
- **Availability Zone:** `us-east-1b`
- **IPv4 CIDR:** `10.0.2.0/24`

3. Click **Create subnet**

**Enable Auto-assign Public IP (for both):**
1. Select subnet → **Actions** → **Edit subnet settings**
2. Check ✅ **Enable auto-assign public IPv4 address**
3. Save

### AWS CLI:
```bash
# Public Subnet 1
PUB_SUB1=$(aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=shop-easy-public-1}]' \
  --query 'Subnet.SubnetId' --output text)

# Public Subnet 2
PUB_SUB2=$(aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=shop-easy-public-2}]' \
  --query 'Subnet.SubnetId' --output text)

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute --subnet-id $PUB_SUB1 --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $PUB_SUB2 --map-public-ip-on-launch
```

> 📝 **Note down:** Public Subnet IDs

---

## 1.4 Create Private Subnets (2)

### AWS Console:
1. Go to **VPC** → **Subnets** → **Create subnet**
2. **VPC:** Select `shop-easy-vpc`

**Subnet 1:**
- **Name:** `shop-easy-private-1`
- **Availability Zone:** `us-east-1a`
- **IPv4 CIDR:** `10.0.10.0/24`

**Subnet 2:**
- **Name:** `shop-easy-private-2`
- **Availability Zone:** `us-east-1b`
- **IPv4 CIDR:** `10.0.11.0/24`

3. Click **Create subnet**

### AWS CLI:
```bash
# Private Subnet 1
PRIV_SUB1=$(aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.10.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=shop-easy-private-1}]' \
  --query 'Subnet.SubnetId' --output text)

# Private Subnet 2
PRIV_SUB2=$(aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=shop-easy-private-2}]' \
  --query 'Subnet.SubnetId' --output text)
```

> 📝 **Note down:** Private Subnet IDs

---

## 1.5 Create NAT Gateway

### AWS Console:
1. Go to **VPC** → **NAT Gateways** → **Create NAT gateway**
2. Settings:
   - **Name:** `shop-easy-nat`
   - **Subnet:** Select `shop-easy-public-1` (must be public!)
   - **Connectivity type:** Public
   - **Elastic IP:** Click **Allocate Elastic IP** → Select the new EIP
3. Click **Create NAT gateway**
4. ⏳ Wait 2-3 minutes for status to become **Available**

### AWS CLI:
```bash
# Allocate Elastic IP
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=shop-easy-nat-eip}]' \
  --query 'AllocationId' --output text)

# Create NAT Gateway in public subnet
NAT_ID=$(aws ec2 create-nat-gateway \
  --subnet-id $PUB_SUB1 \
  --allocation-id $EIP_ALLOC \
  --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=shop-easy-nat}]' \
  --query 'NatGateway.NatGatewayId' --output text)

# Wait for NAT to be available
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_ID
echo "NAT Gateway ready: $NAT_ID"
```

> 📝 **Note down:** NAT Gateway ID

---

## 1.6 Create Route Tables

### Public Route Table

#### AWS Console:
1. Go to **VPC** → **Route Tables** → **Create route table**
2. **Name:** `shop-easy-public-rt`
3. **VPC:** Select `shop-easy-vpc`
4. Click **Create route table**
5. Select the route table → **Routes** tab → **Edit routes** → **Add route**:
   - **Destination:** `0.0.0.0/0`
   - **Target:** Internet Gateway → Select `shop-easy-igw`
6. Save changes
7. **Subnet associations** tab → **Edit subnet associations** → Select both public subnets → Save

#### AWS CLI:
```bash
# Create public route table
PUB_RT=$(aws ec2 create-route-table --vpc-id vpc-xxxxx \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=shop-easy-public-rt}]' \
  --query 'RouteTable.RouteTableId' --output text)

# Add route to Internet Gateway
aws ec2 create-route --route-table-id $PUB_RT \
  --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# Associate public subnets
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_SUB1
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_SUB2
```

### Private Route Table

#### AWS Console:
1. **Create route table**
2. **Name:** `shop-easy-private-rt`
3. **VPC:** Select `shop-easy-vpc`
4. Click **Create route table**
5. **Routes** → **Edit routes** → **Add route**:
   - **Destination:** `0.0.0.0/0`
   - **Target:** NAT Gateway → Select `shop-easy-nat`
6. Save changes
7. **Subnet associations** → Select both private subnets → Save

#### AWS CLI:
```bash
# Create private route table
PRIV_RT=$(aws ec2 create-route-table --vpc-id vpc-xxxxx \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=shop-easy-private-rt}]' \
  --query 'RouteTable.RouteTableId' --output text)

# Add route to NAT Gateway
aws ec2 create-route --route-table-id $PRIV_RT \
  --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_ID

# Associate private subnets
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_SUB1
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_SUB2
```

---

## 1.7 Verification Checklist

| ✅ | Resource | Status |
|----|----------|--------|
| ☐ | VPC created with DNS enabled | |
| ☐ | Internet Gateway attached to VPC | |
| ☐ | 2 Public subnets (us-east-1a, us-east-1b) with auto-assign IP | |
| ☐ | 2 Private subnets (us-east-1a, us-east-1b) | |
| ☐ | NAT Gateway in public subnet (status: Available) | |
| ☐ | Public route table → 0.0.0.0/0 → IGW, associated with public subnets | |
| ☐ | Private route table → 0.0.0.0/0 → NAT, associated with private subnets | |

---

## Resource IDs to Save

```
VPC_ID=vpc-xxxxx
IGW_ID=igw-xxxxx
PUB_SUB1=subnet-xxxxx (us-east-1a, 10.0.1.0/24)
PUB_SUB2=subnet-xxxxx (us-east-1b, 10.0.2.0/24)
PRIV_SUB1=subnet-xxxxx (us-east-1a, 10.0.10.0/24)
PRIV_SUB2=subnet-xxxxx (us-east-1b, 10.0.11.0/24)
NAT_ID=nat-xxxxx
PUB_RT=rtb-xxxxx
PRIV_RT=rtb-xxxxx
```

---

**Next Step:** [02-SECURITY-GROUPS.md](./02-SECURITY-GROUPS.md) — Create Security Groups
