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

variable "identifier" {
  type = string
}

variable "engine_version" {
  type    = string
  default = "16.6"
}

variable "instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "db_subnet_group_name" {
  type = string
}

variable "vpc_security_group_ids" {
  type = list(string)
}

variable "database_name" {
  type    = string
  default = "sull"
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+[]{}"
}

resource "aws_db_parameter_group" "postgres16" {
  name   = "${var.identifier}-pg16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  tags = var.tags
}

resource "aws_db_instance" "this" {
  identifier                 = var.identifier
  engine                     = "postgres"
  engine_version             = var.engine_version
  instance_class             = var.instance_class
  allocated_storage          = 100
  max_allocated_storage      = 1000
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = var.database_name
  username                   = "sull_admin"
  password                   = random_password.master.result
  db_subnet_group_name       = var.db_subnet_group_name
  vpc_security_group_ids     = var.vpc_security_group_ids
  parameter_group_name       = aws_db_parameter_group.postgres16.name
  multi_az                   = true
  publicly_accessible        = false
  backup_retention_period    = 14
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.identifier}-final"
  performance_insights_enabled = true
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  tags                       = var.tags
}

output "endpoint" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "master_username" {
  value = aws_db_instance.this.username
}

output "master_password" {
  value     = random_password.master.result
  sensitive = true
}
