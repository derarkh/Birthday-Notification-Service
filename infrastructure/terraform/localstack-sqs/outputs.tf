output "queue_url" {
  value = aws_sqs_queue.birthday_delivery_queue.url
}

output "dlq_url" {
  value = aws_sqs_queue.birthday_delivery_dlq.url
}

output "queue_redrive_policy" {
  value = aws_sqs_queue.birthday_delivery_queue.redrive_policy
}

