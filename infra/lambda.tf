data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/dist"
  output_path = "${path.module}/../backend/dist.zip"

  # dist/package.json ({type:module}) is written by the backend build step
  # (npm run build:backend), not by tsc itself. Depend on its mtime so the
  # zip (and therefore the Lambda source hash) refreshes when it changes.
  excludes = ["*.tsbuildinfo", "*.d.ts", "*.d.ts.map"]
}

resource "aws_iam_role" "lambda_exec" {
  name = "${var.project}-${var.environment}-lambda-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_data" {
  name = "${var.project}-${var.environment}-lambda-data"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.documents.arn,
          "${aws_dynamodb_table.documents.arn}/index/*",
          aws_dynamodb_table.audit_events.arn,
          "${aws_dynamodb_table.audit_events.arn}/index/*",
          aws_dynamodb_table.verification_counters.arn
        ]
      },
      {
        Effect = "Deny"
        Action = [
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.audit_events.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = ["${aws_s3_bucket.documents.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [aws_kms_key.documents.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "logs:FilterLogEvents"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_data" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_data.arn
}

resource "aws_lambda_function" "health" {
  function_name = "${var.project}-${var.environment}-health"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "health.handler"
  filename      = data.archive_file.backend.output_path
  timeout       = 5
  environment {
    variables = {
      DOCUMENTS_TABLE = aws_dynamodb_table.documents.name
      AUDIT_TABLE     = aws_dynamodb_table.audit_events.name
      COUNTERS_TABLE  = aws_dynamodb_table.verification_counters.name
    }
  }
}

resource "aws_lambda_function" "support_health" {
  function_name = "${var.project}-${var.environment}-support-health"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "support/health.handler"
  filename      = data.archive_file.backend.output_path
  timeout       = 10
  environment {
    variables = {
      DOCUMENTS_TABLE = aws_dynamodb_table.documents.name
      AUDIT_TABLE     = aws_dynamodb_table.audit_events.name
      COUNTERS_TABLE  = aws_dynamodb_table.verification_counters.name
    }
  }
}

resource "aws_lambda_function" "support_reset" {
  function_name = "${var.project}-${var.environment}-support-reset"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "support/resetLockout.handler"
  filename      = data.archive_file.backend.output_path
  timeout       = 10
  environment {
    variables = {
      DOCUMENTS_TABLE = aws_dynamodb_table.documents.name
      AUDIT_TABLE     = aws_dynamodb_table.audit_events.name
      COUNTERS_TABLE = aws_dynamodb_table.verification_counters.name
    }
  }
}

resource "aws_lambda_function" "upload" {
  function_name = "${var.project}-${var.environment}-upload"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "upload.handler"
  filename      = data.archive_file.backend.output_path
  timeout       = 30
  memory_size   = 256
  environment {
    variables = {
      DOCUMENTS_TABLE = aws_dynamodb_table.documents.name
      AUDIT_TABLE     = aws_dynamodb_table.audit_events.name
      DOCUMENTS_BUCKET = aws_s3_bucket.documents.id
      ACCESS_URL_BASE  = "https://${aws_cloudfront_distribution.web.domain_name}"
    }
  }
}

resource "aws_lambda_function" "verify" {
  function_name = "${var.project}-${var.environment}-verify"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "verify.handler"
  filename      = data.archive_file.backend.output_path
  timeout       = 10
  environment {
    variables = {
      DOCUMENTS_TABLE = aws_dynamodb_table.documents.name
      AUDIT_TABLE     = aws_dynamodb_table.audit_events.name
      COUNTERS_TABLE  = aws_dynamodb_table.verification_counters.name
      DOCUMENTS_BUCKET = aws_s3_bucket.documents.id
    }
  }
}

resource "aws_lambda_function" "report" {
  function_name = "${var.project}-${var.environment}-report"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "report.handler"
  filename      = data.archive_file.backend.output_path
  timeout       = 15
  environment {
    variables = {
      DOCUMENTS_TABLE = aws_dynamodb_table.documents.name
      AUDIT_TABLE     = aws_dynamodb_table.audit_events.name
    }
  }
}
