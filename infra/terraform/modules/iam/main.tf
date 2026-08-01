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

variable "oidc_provider_arn" {
  type = string
}

variable "oidc_issuer_host" {
  type        = string
  description = "OIDC issuer host without https://, e.g. oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E"
}

variable "namespace" {
  type    = string
  default = "sull-ai"
}

variable "service_account" {
  type    = string
  default = "sull-workload"
}

variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_iam_policy_document" "workload_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_issuer_host}:sub"
      values   = ["system:serviceaccount:${var.namespace}:${var.service_account}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_issuer_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "workload_irsa" {
  name               = "${var.name_prefix}-workload-irsa"
  assume_role_policy = data.aws_iam_policy_document.workload_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "workload_runtime" {
  name = "${var.name_prefix}-workload-runtime"
  role = aws_iam_role.workload_irsa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:*:*:secret:${var.name_prefix}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:AbortMultipartUpload",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.name_prefix}-*",
          "arn:aws:s3:::${var.name_prefix}-*/*"
        ]
      }
    ]
  })
}

output "workload_role_arn" {
  value = aws_iam_role.workload_irsa.arn
}
