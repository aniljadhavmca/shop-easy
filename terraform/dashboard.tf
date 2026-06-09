resource "aws_cloudwatch_dashboard" "orders" {
  dashboard_name = "${var.project}-orders"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Big bold metric counters (metric widgets = largest font)
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 6
        height = 6
        properties = {
          title                = "✅ Orders Booked"
          region               = var.region
          stat                 = "Sum"
          period               = 2592000
          view                 = "singleValue"
          metrics              = [["ShopEasy/Orders", "OrdersBooked"]]
          setPeriodToTimeRange = true
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 0
        width  = 6
        height = 6
        properties = {
          title                = "❌ Orders Failed"
          region               = var.region
          stat                 = "Sum"
          period               = 2592000
          view                 = "singleValue"
          metrics              = [["ShopEasy/Orders", "OrdersFailed"]]
          setPeriodToTimeRange = true
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 6
        height = 6
        properties = {
          title                = "⏳ Orders Pending"
          region               = var.region
          stat                 = "Sum"
          period               = 2592000
          view                 = "singleValue"
          metrics              = [["ShopEasy/Orders", "OrdersPending"]]
          setPeriodToTimeRange = true
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 0
        width  = 6
        height = 6
        properties = {
          title                = "💰 Revenue Received ($)"
          region               = var.region
          stat                 = "Sum"
          period               = 2592000
          view                 = "singleValue"
          metrics              = [["ShopEasy/Orders", "Revenue"]]
          setPeriodToTimeRange = true
        }
      },
      # Row 2: Orders over time
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          title  = "📊 Orders Over Time"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/ | parse @message /\"event\":\"(?<event>[^\"]+)\"/ | stats count() by bin(5m), event"
          view   = "timeSeries"
        }
      },
      # Row 3: Revenue over time
      {
        type   = "log"
        x      = 0
        y      = 12
        width  = 24
        height = 6
        properties = {
          title  = "💰 Revenue Over Time"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED/ | parse @message /\"amount\":(?<amt>[\\d.]+)/ | stats sum(amt) as Revenue by bin(1h)"
          view   = "bar"
        }
      },
      # Row 4: Recent events with customer + reason
      {
        type   = "log"
        x      = 0
        y      = 18
        width  = 24
        height = 7
        properties = {
          title  = "📋 Recent Order Events"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/ | parse @message /\"event\":\"(?<event>[^\"]+)\"/ | parse @message /\"order_id\":(?<order_id>[\\d]+)/ | parse @message /\"amount\":(?<amount>[\\d.]+)/ | parse @message /\"customer\":\"(?<customer>[^\"]+)\"/ | parse @message /\"email\":\"(?<email>[^\"]+)\"/ | parse @message /\"reason\":\"(?<reason>[^\"]+)\"/ | display @timestamp, event, order_id, customer, email, amount, reason | sort @timestamp desc | limit 50"
          view   = "table"
        }
      }
    ]
  })
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.project}-orders"
}
