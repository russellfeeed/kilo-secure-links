resource "aws_dynamodb_table" "documents" {
  name         = "${var.project}-${var.environment}-documents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "documentId"

  attribute {
    name = "documentId"
    type = "S"
  }

  attribute {
    name = "customerId"
    type = "S"
  }

  attribute {
    name = "accessTokenHash"
    type = "S"
  }

  global_secondary_index {
    name            = "byCustomer"
    hash_key        = "customerId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "byAccessToken"
    hash_key        = "accessTokenHash"
    projection_type = "KEYS_ONLY"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "audit_events" {
  name         = "${var.project}-${var.environment}-audit-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "documentId"
  range_key    = "eventId"

  attribute {
    name = "documentId"
    type = "S"
  }

  attribute {
    name = "eventId"
    type = "S"
  }

  attribute {
    name = "customerId"
    type = "S"
  }

  global_secondary_index {
    name            = "byCustomerTime"
    hash_key        = "customerId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "verification_counters" {
  name         = "${var.project}-${var.environment}-verification-counters"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "documentId"

  attribute {
    name = "documentId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
