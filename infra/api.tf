resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project}-${var.environment}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_health" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_support_health" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.support_health.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_support_reset" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.support_reset.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_upload" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_verify" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "health" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.health.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "support_health" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.support_health.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "support_reset" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.support_reset.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "upload" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.upload.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "verify" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.verify.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.health.id}"
}

resource "aws_apigatewayv2_route" "support_health" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /support/health"
  target             = "integrations/${aws_apigatewayv2_integration.support_health.id}"
  authorization_type = "AWS_IAM"
}

resource "aws_apigatewayv2_route" "support_reset" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /support/reset-lockout"
  target             = "integrations/${aws_apigatewayv2_integration.support_reset.id}"
  authorization_type = "AWS_IAM"
}

resource "aws_apigatewayv2_route" "upload" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /documents"
  target             = "integrations/${aws_apigatewayv2_integration.upload.id}"
  authorization_type = "AWS_IAM"
}

resource "aws_apigatewayv2_route" "verify" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /verify"
  target    = "integrations/${aws_apigatewayv2_integration.verify.id}"
}
