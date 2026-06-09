resource "aws_cloudwatch_dashboard" "orders" {
  dashboard_name = "${var.project}-orders"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Counter panels
      {
        type   = "log"
        x      = 0
        y      = 0
        width  = 6
        height = 4
        properties = {
          title  = "✅ Orders Booked"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event = 'ORDER_BOOKED' | stats count() as Booked"
          view   = "singleValue"
        }
      },
      {
        type   = "log"
        x      = 6
        y      = 0
        width  = 6
        height = 4
        properties = {
          title  = "❌ Orders Failed"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event = 'ORDER_FAILED' | stats count() as Failed"
          view   = "singleValue"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 0
        width  = 6
        height = 4
        properties = {
          title  = "⏳ Orders Pending"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event = 'ORDER_PENDING' | stats count() as Pending"
          view   = "singleValue"
        }
      },
      {
        type   = "log"
        x      = 18
        y      = 0
        width  = 6
        height = 4
        properties = {
          title  = "💰 Revenue Received ($)"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event = 'ORDER_BOOKED' | stats sum(amount) as Revenue"
          view   = "singleValue"
        }
      },
      # Row 2: Orders over time
      {
        type   = "log"
        x      = 0
        y      = 4
        width  = 24
        height = 6
        properties = {
          title  = "📊 Orders Over Time"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event in ['ORDER_BOOKED', 'ORDER_FAILED', 'ORDER_PENDING'] | stats count() by bin(5m), event"
          view   = "timeSeries"
        }
      },
      # Row 3: Revenue over time
      {
        type   = "log"
        x      = 0
        y      = 10
        width  = 24
        height = 6
        properties = {
          title  = "💰 Revenue Over Time"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event = 'ORDER_BOOKED' | stats sum(amount) as Revenue by bin(1h)"
          view   = "bar"
        }
      },
      # Row 4: Recent logs
      {
        type   = "log"
        x      = 0
        y      = 16
        width  = 24
        height = 6
        properties = {
          title  = "📋 Recent Order Events"
          region = var.region
          query  = "SOURCE '/ecs/${var.project}' | filter event in ['ORDER_BOOKED', 'ORDER_FAILED', 'ORDER_PENDING'] | sort @timestamp desc | limit 50"
          view   = "table"
        }
      }
    ]
  })
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.project}-orders"
}
