resource "aws_iam_group" "support" {
  name = "${var.project}-${var.environment}-support"
}

resource "aws_iam_policy" "support_read" {
  name = "${var.project}-${var.environment}-support-read"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query"
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
        Effect = "Allow"
        Action = [
          "execute-api:Invoke"
        ]
        Resource = ["${aws_apigatewayv2_api.main.execution_arn}/*/GET/support/health"]
      }
    ]
  })
}

resource "aws_iam_policy" "support_reset" {
  name = "${var.project}-${var.environment}-support-reset"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "execute-api:Invoke"
        ]
        Resource = ["${aws_apigatewayv2_api.main.execution_arn}/*/POST/support/reset-lockout"]
      }
    ]
  })
}

resource "aws_iam_group_policy_attachment" "support_read" {
  group      = aws_iam_group.support.name
  policy_arn = aws_iam_policy.support_read.arn
}

resource "aws_iam_group_policy_attachment" "support_reset" {
  group      = aws_iam_group.support.name
  policy_arn = aws_iam_policy.support_reset.arn
}

output "support_group" {
  value = aws_iam_group.support.name
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.web.domain_name
}
