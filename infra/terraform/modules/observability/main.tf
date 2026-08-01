terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82"
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

resource "aws_prometheus_workspace" "this" {
  alias = "${var.name_prefix}-amp"
  tags  = var.tags
}

resource "aws_cloudwatch_log_group" "platform" {
  name              = "/sull-ai/${var.name_prefix}"
  retention_in_days = 30
  tags              = var.tags
}

output "prometheus_workspace_id" {
  value = aws_prometheus_workspace.this.id
}

output "prometheus_endpoint" {
  value = aws_prometheus_workspace.this.prometheus_endpoint
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.platform.name
}
