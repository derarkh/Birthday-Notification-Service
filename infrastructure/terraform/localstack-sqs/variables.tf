variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

variable "aws_endpoint_url" {
  type    = string
  default = "http://localhost:4566"
}

variable "aws_access_key_id" {
  type    = string
  default = "test"
}

variable "aws_secret_access_key" {
  type    = string
  default = "test"
}

variable "queue_name" {
  type    = string
  default = "birthday-delivery-queue"
}

variable "dlq_name" {
  type    = string
  default = "birthday-delivery-dlq"
}

variable "max_receive_count" {
  type    = number
  default = 5
}

variable "visibility_timeout_seconds" {
  type    = number
  default = 30
}

variable "message_retention_seconds" {
  type    = number
  default = 1209600
}

