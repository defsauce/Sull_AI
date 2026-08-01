terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "name_prefix" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_secretsmanager_secret" "platform" {
  name                    = "${var.name_prefix}/platform"
  recovery_window_in_days = 30
  tags                    = var.tags
}

resource "random_password" "platform_bootstrap" {
  length  = 48
  special = true
}

resource "aws_secretsmanager_secret_version" "platform" {
  secret_id = aws_secretsmanager_secret.platform.id
  secret_string = jsonencode({
    bootstrap_token = random_password.platform_bootstrap.result
  })
}

output "platform_secret_arn" {
  value = aws_secretsmanager_secret.platform.arn
}
