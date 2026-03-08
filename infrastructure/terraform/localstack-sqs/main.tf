provider "aws" {
  region                      = var.aws_region
  access_key                  = var.aws_access_key_id
  secret_key                  = var.aws_secret_access_key
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    sqs = var.aws_endpoint_url
  }
}

resource "aws_sqs_queue" "birthday_delivery_dlq" {
  name = var.dlq_name
}

resource "aws_sqs_queue" "birthday_delivery_queue" {
  name                       = var.queue_name
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.birthday_delivery_dlq.arn
    maxReceiveCount     = tostring(var.max_receive_count)
  })
}

