#!/usr/bin/env bash
set -euo pipefail

AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
QUEUE_NAME="${QUEUE_NAME:-birthday-delivery-queue}"
DLQ_NAME="${DLQ_NAME:-birthday-delivery-dlq}"
MAX_RECEIVE_COUNT="${MAX_RECEIVE_COUNT:-5}"
VISIBILITY_TIMEOUT_SECONDS="${VISIBILITY_TIMEOUT_SECONDS:-30}"
MESSAGE_RETENTION_SECONDS="${MESSAGE_RETENTION_SECONDS:-1209600}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN:-test}"

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN

# Create DLQ first and resolve its ARN for main queue redrive policy.
aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs create-queue --queue-name "$DLQ_NAME" >/dev/null

DLQ_URL=$(aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs get-queue-url --queue-name "$DLQ_NAME" --output text --query 'QueueUrl')
DLQ_ARN=$(aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --output text --query 'Attributes.QueueArn')

REDRIVE_POLICY=$(printf '{"deadLetterTargetArn":"%s","maxReceiveCount":"%s"}' "$DLQ_ARN" "$MAX_RECEIVE_COUNT")
REDRIVE_POLICY_ESCAPED=${REDRIVE_POLICY//\"/\\\"}
ATTRIBUTES=$(cat <<EOF
{
  "RedrivePolicy": "$REDRIVE_POLICY_ESCAPED",
  "VisibilityTimeout": "$VISIBILITY_TIMEOUT_SECONDS",
  "MessageRetentionPeriod": "$MESSAGE_RETENTION_SECONDS"
}
EOF
)

aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs create-queue \
  --queue-name "$QUEUE_NAME" \
  --attributes "$ATTRIBUTES" >/dev/null

QUEUE_URL=$(aws --endpoint-url="$AWS_ENDPOINT_URL" --region "$AWS_REGION" sqs get-queue-url --queue-name "$QUEUE_NAME" --output text --query 'QueueUrl')

echo "Created/verified DLQ: $DLQ_NAME"
echo "DLQ URL: $DLQ_URL"
echo "Created/verified queue: $QUEUE_NAME"
echo "Queue URL: $QUEUE_URL"
