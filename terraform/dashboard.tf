resource "aws_cloudwatch_dashboard" "orders" {
  dashboard_name = "${var.project}-orders"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Big counter panels (height=5 for large font)
      {
        type   = "log"
        x      = 0
        y      = 0
        width  = 6
        height = 5
        properties = {
          title  = "✅ Orders Booked"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED/ | stats count() as Booked"
          view   = "singleValue"
        }
      },
      {
        type   = "log"
        x      = 6
        y      = 0
        width  = 6
        height = 5
        properties = {
          title  = "❌ Orders Failed"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_FAILED/ | stats count() as Failed"
          view   = "singleValue"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 0
        width  = 6
        height = 5
        properties = {
          title  = "⏳ Orders Pending"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_PENDING/ | stats count() as Pending"
          view   = "singleValue"
        }
      },
      {
        type   = "log"
        x      = 18
        y      = 0
        width  = 6
        height = 5
        properties = {
          title  = "💰 Revenue Received ($)"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED/ | parse @message /\"amount\":(?<amt>[\\d.]+)/ | stats sum(amt) as Revenue"
          view   = "singleValue"
        }
      },
      # Row 2: Orders over time (line chart)
      {
        type   = "log"
        x      = 0
        y      = 5
        width  = 24
        height = 6
        properties = {
          title  = "📊 Orders Over Time"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/ | parse @message /\"event\":\"(?<event>[^\"]+)\"/ | stats count() by bin(5m), event"
          view   = "timeSeries"
        }
      },
      # Row 3: Revenue over time (bar chart)
      {
        type   = "log"
        x      = 0
        y      = 11
        width  = 24
        height = 6
        properties = {
          title  = "💰 Revenue Over Time"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED/ | parse @message /\"amount\":(?<amt>[\\d.]+)/ | stats sum(amt) as Revenue by bin(1h)"
          view   = "bar"
        }
      },
      # Row 4: Recent events with customer details
      {
        type   = "log"
        x      = 0
        y      = 17
        width  = 24
        height = 7
        properties = {
          title  = "📋 Recent Order Events"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter @message like /ORDER_BOOKED|ORDER_FAILED|ORDER_PENDING/ | parse @message /\"event\":\"(?<event>[^\"]+)\"/ | parse @message /\"order_id\":(?<order_id>[\\d]+)/ | parse @message /\"amount\":(?<amount>[\\d.]+)/ | parse @message /\"customer\":\"(?<customer>[^\"]+)\"/ | parse @message /\"email\":\"(?<email>[^\"]+)\"/ | display @timestamp, event, order_id, customer, email, amount | sort @timestamp desc | limit 50"
          view   = "table"
        }
      }
    ]
  })
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.project}-orders"
}
