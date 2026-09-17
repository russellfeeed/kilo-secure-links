variable "aws_region" {
  type        = string
  description = "AWS region for SecureLinks Phase 1 pilot"
  default     = "eu-west-2"
}

variable "environment" {
  type        = string
  description = "Environment name (dev/test/prod) — parity across all three"
}

variable "project" {
  type    = string
  default = "securelinks"
}

variable "link_expiry_days" {
  type        = number
  description = "Configurable document link expiry (REQ-004, default 14 within 7-14 range)"
  default     = 14
}

variable "retention_days" {
  type        = number
  description = "Rolling document retention in days (REQ-004, fixed 90)"
  default     = 90
}

variable "api_prism_key_value" {
  type        = string
  description = "Prism API key value (sensitive, never commit)"
  sensitive   = true
}

variable "enable_dev_routes" {
  type        = bool
  description = "Enable unsigned local-harness routes (dev only, REQ-021). Must be false in test/prod."
  default     = false
}
