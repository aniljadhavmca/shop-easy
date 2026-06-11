resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"
}

resource "aws_security_group" "ecs" {
  name   = "${var.project}-ecs-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project}"
  retention_in_days = 3
}

# ─── Product Service (products + cart) ───
resource "aws_ecs_task_definition" "product" {
  family                   = "${var.project}-product"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "product-service"
    image = "${aws_ecr_repository.product.repository_url}:latest"
    portMappings = [{ containerPort = 4001 }]
    environment = [
      { name = "DB_HOST", value = aws_db_instance.main.address },
      { name = "DB_USER", value = "admin" },
      { name = "DB_PASSWORD", value = var.db_password },
      { name = "DB_NAME", value = "shop_easy" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project}"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "product"
      }
    }
  }])
}

resource "aws_ecs_service" "product" {
  name                   = "product-service"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.product.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.product.arn
    container_name   = "product-service"
    container_port   = 4001
  }
}

# ─── Order Service (orders + payments) ───
resource "aws_ecs_task_definition" "order" {
  family                   = "${var.project}-order"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "order-service"
    image = "${aws_ecr_repository.order.repository_url}:latest"
    portMappings = [{ containerPort = 4002 }]
    environment = [
      { name = "DB_HOST", value = aws_db_instance.main.address },
      { name = "DB_USER", value = "admin" },
      { name = "DB_PASSWORD", value = var.db_password },
      { name = "DB_NAME", value = "shop_easy" },
      { name = "STRIPE_SECRET_KEY", value = var.stripe_secret_key }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project}"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "order"
      }
    }
  }])
}

resource "aws_ecs_service" "order" {
  name                   = "order-service"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.order.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.order.arn
    container_name   = "order-service"
    container_port   = 4002
  }
}

# ─── Frontend ───
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project}-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "frontend"
    image = "${aws_ecr_repository.frontend.repository_url}:latest"
    portMappings = [{ containerPort = 80 }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project}"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])
}

resource "aws_ecs_service" "frontend" {
  name                   = "frontend"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.frontend.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }
}

# ─── ECR Repositories ───
resource "aws_ecr_repository" "product" {
  name         = "${var.project}/product-service"
  force_delete = true
}

resource "aws_ecr_repository" "order" {
  name         = "${var.project}/order-service"
  force_delete = true
}

resource "aws_ecr_repository" "frontend" {
  name         = "${var.project}/frontend"
  force_delete = true
}

resource "aws_ecr_repository" "db_init" {
  name         = "${var.project}/db-init"
  force_delete = true
}

# ─── DB Init Task (runs once to load schema) ───
resource "aws_ecs_task_definition" "db_init" {
  family                   = "${var.project}-db-init"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([{
    name  = "db-init"
    image = "${aws_ecr_repository.db_init.repository_url}:latest"
    environment = [
      { name = "DB_HOST", value = aws_db_instance.main.address },
      { name = "DB_USER", value = "admin" },
      { name = "DB_PASSWORD", value = var.db_password },
      { name = "DB_NAME", value = "shop_easy" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project}"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "db-init"
      }
    }
  }])
}
