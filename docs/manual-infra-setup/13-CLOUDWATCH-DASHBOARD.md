# Step 13: CloudWatch Dashboard

> Create a CloudWatch dashboard to monitor orders, revenue, and application health using Log Insights queries.

---

## What We're Creating

A dashboard with 4 widgets:

| Widget | Type | Shows |
|--------|------|-------|
| ✅ Orders Booked | Single Value | Count of successful orders |
| ❌ Orders Failed | Single Value | Count of failed payments |
| 📊 Orders Over Time | Time Series | Orders by status over time |
| 💰 Revenue Over Time | Bar Chart | Revenue in dollars per hour |

---

## 13.1 Create Dashboard via Console

### AWS Console:
1. Go to **CloudWatch** → **Dashboards** → **Create dashboard**
2. **Dashboard name:** `shop-easy-orders`
3. Click **Create dashboard**

### Add Widget 1: Orders Booked
1. Click **Add widget** → **Logs table** → **Single value**
2. **Log group:** `/ecs/shop-easy`
3. **Query:**
   ```
   filter @message like /ORDER_BOOKED/
   | stats count() as Booked
   ```
4. **Title:** `✅ Orders Booked`
5. Click **Create widget**

### Add Widget 2: Orders Failed
1. **Add widget** → **Logs table** → **Single value**
2. **Log group:** `/ecs/shop-easy`
3. **Query:**
   ```
   filter @message like /ORDER_FAILED/
   | stats count() as Failed
   ```
4. **Title:** `❌ Orders Failed`

### Add Widget 3: Orders Over Time
1. **Add widget** → **Logs table** → **Time series**
2. **Log group:** `/ecs/shop-easy`
3. **Query:**
   ```
   filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/
   | parse @message /"event":"(?<event>[^"]+)"/
   | stats count() by bin(5m), event
   ```
4. **Title:** `📊 Orders Over Time`

### Add Widget 4: Revenue Over Time
1. **Add widget** → **Logs table** → **Bar**
2. **Log group:** `/ecs/shop-easy`
3. **Query:**
   ```
   filter @message like /ORDER_BOOKED/
   | parse @message /"amount":(?<amt>[\d.]+)/
   | stats sum(amt) as Revenue by bin(1h)
   ```
4. **Title:** `💰 Revenue Over Time`

### Add Widget 5: Recent Order Events (Table)
1. **Add widget** → **Logs table** → **Table**
2. **Log group:** `/ecs/shop-easy`
3. **Query:**
   ```
   filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/
   | parse @message /"event":"(?<event>[^"]+)"/
   | parse @message /"order_id":(?<order_id>[\d]+)/
   | parse @message /"amount":(?<amount>[\d.]+)/
   | parse @message /"customer":"(?<customer>[^"]+)"/
   | parse @message /"email":"(?<email>[^"]+)"/
   | parse @message /"reason":"(?<reason>[^"]+)"/
   | display @timestamp, event, order_id, customer, email, amount, reason
   | sort @timestamp desc
   | limit 50
   ```
4. **Title:** `📋 Recent Order Events`

5. Click **Save dashboard**

---

## 13.2 Create Dashboard via AWS CLI

```bash
aws cloudwatch put-dashboard \
  --dashboard-name shop-easy-orders \
  --dashboard-body '{
  "widgets": [
    {
      "type": "log",
      "x": 0, "y": 0, "width": 6, "height": 6,
      "properties": {
        "title": "✅ Orders Booked",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_BOOKED/ | stats count() as Booked",
        "view": "singleValue"
      }
    },
    {
      "type": "log",
      "x": 6, "y": 0, "width": 6, "height": 6,
      "properties": {
        "title": "❌ Orders Failed",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_FAILED/ | stats count() as Failed",
        "view": "singleValue"
      }
    },
    {
      "type": "log",
      "x": 12, "y": 0, "width": 6, "height": 6,
      "properties": {
        "title": "⏳ Orders Pending",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_PENDING/ | stats count() as Pending",
        "view": "singleValue"
      }
    },
    {
      "type": "log",
      "x": 18, "y": 0, "width": 6, "height": 6,
      "properties": {
        "title": "💰 Revenue ($)",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_BOOKED/ | parse @message /\\\"amount\\\":(?<amt>[\\\\d.]+)/ | stats sum(amt) as Revenue",
        "view": "singleValue"
      }
    },
    {
      "type": "log",
      "x": 0, "y": 6, "width": 24, "height": 6,
      "properties": {
        "title": "📊 Orders Over Time",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/ | parse @message /\\\"event\\\":\\\"(?<event>[^\\\"]+)\\\"/ | stats count() by bin(5m), event",
        "view": "timeSeries"
      }
    },
    {
      "type": "log",
      "x": 0, "y": 12, "width": 24, "height": 6,
      "properties": {
        "title": "💰 Revenue Over Time",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_BOOKED/ | parse @message /\\\"amount\\\":(?<amt>[\\\\d.]+)/ | stats sum(amt) as Revenue by bin(1h)",
        "view": "bar"
      }
    },
    {
      "type": "log",
      "x": 0, "y": 18, "width": 24, "height": 7,
      "properties": {
        "title": "📋 Recent Order Events",
        "region": "us-east-1",
        "query": "SOURCE '\''/ecs/shop-easy'\'' | filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/ | parse @message /\\\"event\\\":\\\"(?<event>[^\\\"]+)\\\"/ | parse @message /\\\"order_id\\\":(?<order_id>[\\\\d]+)/ | parse @message /\\\"amount\\\":(?<amount>[\\\\d.]+)/ | parse @message /\\\"customer\\\":\\\"(?<customer>[^\\\"]+)\\\"/ | parse @message /\\\"email\\\":\\\"(?<email>[^\\\"]+)\\\"/ | parse @message /\\\"reason\\\":\\\"(?<reason>[^\\\"]+)\\\"/ | display @timestamp, event, order_id, customer, email, amount, reason | sort @timestamp desc | limit 50",
        "view": "table"
      }
    }
  ]
}'

echo "✅ Dashboard created!"
echo "📊 URL: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=shop-easy-orders"
```

---

## 13.3 Access the Dashboard

```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=shop-easy-orders
```

---

## 13.4 Verification Checklist

| ✅ | Widget | Working |
|----|--------|---------|
| ☐ | Orders Booked counter | |
| ☐ | Orders Failed counter | |
| ☐ | Orders Pending counter | |
| ☐ | Revenue total | |
| ☐ | Orders Over Time chart | |
| ☐ | Revenue Over Time bar chart | |
| ☐ | Recent Events table | |

> 💡 **Note:** Widgets will show data only after you make some test orders through the app.

---

## How Structured Logging Works

The order-service emits JSON log events:
```json
{
  "event": "ORDER_BOOKED",
  "order_id": 1,
  "user_id": 5,
  "amount": 49.99,
  "customer": "John Doe",
  "email": "john@example.com",
  "reason": "Payment successful"
}
```

CloudWatch Log Insights parses these JSON fields to create the dashboard widgets.

---

**Previous:** [12-VERIFICATION.md](./12-VERIFICATION.md)
**Next:** [14-CLEANUP.md](./14-CLEANUP.md) — Destroy All Resources
