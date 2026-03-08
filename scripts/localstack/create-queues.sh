#!/usr/bin/env bash
set -euo pipefail

TF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/terraform/localstack-sqs" && pwd)"

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
export AWS_REGION

terraform -chdir="$TF_DIR" init -input=false >/dev/null
terraform -chdir="$TF_DIR" apply -auto-approve \
  -var "aws_region=$AWS_REGION" \
  -var "aws_endpoint_url=$AWS_ENDPOINT_URL" \
  -var "aws_access_key_id=$AWS_ACCESS_KEY_ID" \
  -var "aws_secret_access_key=$AWS_SECRET_ACCESS_KEY" \
  -var "queue_name=$QUEUE_NAME" \
  -var "dlq_name=$DLQ_NAME" \
  -var "max_receive_count=$MAX_RECEIVE_COUNT" \
  -var "visibility_timeout_seconds=$VISIBILITY_TIMEOUT_SECONDS" \
  -var "message_retention_seconds=$MESSAGE_RETENTION_SECONDS" >/dev/null

QUEUE_URL=$(terraform -chdir="$TF_DIR" output -raw queue_url)
DLQ_URL=$(terraform -chdir="$TF_DIR" output -raw dlq_url)

echo "Created/verified DLQ: $DLQ_NAME"
echo "DLQ URL: $DLQ_URL"
echo "Created/verified queue: $QUEUE_NAME"
echo "Queue URL: $QUEUE_URL"
