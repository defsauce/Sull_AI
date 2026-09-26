terraform {
  required_version = ">= 1.9.0"

  backend "s3" {
    bucket         = "sull-ai-terraform-state-dev"
    key            = "envs/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "sull-ai-terraform-locks"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "sull-ai"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "sull-ai-dev"
  azs  = slice(data.aws_availability_zones.available.names, 0, 3)
  tags = {
    Project     = "sull-ai"
    Environment = "dev"
  }
}

module "vpc" {
  source           = "../../modules/vpc"
  name             = local.name
  cidr             = "10.40.0.0/16"
  azs              = local.azs
  public_subnets   = ["10.40.0.0/20", "10.40.16.0/20", "10.40.32.0/20"]
  private_subnets  = ["10.40.48.0/20", "10.40.64.0/20", "10.40.80.0/20"]
  database_subnets = ["10.40.96.0/24", "10.40.97.0/24", "10.40.98.0/24"]
  tags             = local.tags
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "PostgreSQL access from private subnets"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.40.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

module "eks" {
  source         = "../../modules/eks"
  cluster_name   = local.name
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  tags           = local.tags
}

module "rds" {
  source                 = "../../modules/rds"
  identifier             = "${local.name}-postgres"
  db_subnet_group_name   = module.vpc.db_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  instance_class         = "db.r6g.large"
  tags                   = local.tags
}

output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "rds_endpoint" {
  value = module.rds.endpoint
}
