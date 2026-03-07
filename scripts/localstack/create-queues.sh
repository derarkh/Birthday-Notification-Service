#!/usr/bin/env bash
set -euo pipefail

AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
QUEUE_NAME="${QUEUE_NAME:-birthday-delivery-queue}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN:-test}"

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN

aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs create-queue --queue-name "$QUEUE_NAME" >/dev/null

QUEUE_URL=$(aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs get-queue-url --queue-name "$QUEUE_NAME" --output text --query 'QueueUrl')

echo "Created/verified queue: $QUEUE_NAME"
echo "Queue URL: $QUEUE_URL"
