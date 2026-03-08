# Birthday Notification Service

TypeScript Node.js service scaffold for timezone-safe birthday notifications.

This Slice 1 baseline provides:
- strict TypeScript project setup
- Fastify API scaffold with user endpoints
- lint/typecheck/test tooling
- PostgreSQL + LocalStack (SQS) local dependencies via Docker Compose
- migration wiring with `node-pg-migrate`

## Stack
- Node.js + TypeScript
- Fastify
- PostgreSQL
- AWS SQS (via LocalStack for local development)
- Vitest

## Project structure
```text
src/
  app/
    api/
    planner/
    worker/
  domain/
  infrastructure/
    aws/
    config/
    db/
    http/
    logging/
  tests/
```

## Prerequisites
- Node.js 20+
- npm
- Docker + Docker Compose
- AWS CLI (for LocalStack queue setup)
- Terraform

## Environment
Copy `.env.example` to `.env` and adjust values as needed.

Key defaults:
- API port: `3000`
- PostgreSQL: `postgres://postgres:postgres@localhost:5432/birthday_service`
- LocalStack endpoint: `http://localhost:4566`
- queue URL placeholder: `http://localhost:4566/000000000000/birthday-delivery-queue`
- DLQ name: `birthday-delivery-dlq`
- SQS redrive defaults: `maxReceiveCount=5`, `VisibilityTimeout=30`, `MessageRetentionPeriod=1209600`

## Install
```bash
npm install
```

## Start local dependencies
```bash
docker compose up -d postgres localstack
```

## Create SQS queues in LocalStack (Terraform)
```bash
npm run infra:queues
```
This runs Terraform from `infrastructure/terraform/localstack-sqs` and provisions:
- main queue: `birthday-delivery-queue`
- dead-letter queue: `birthday-delivery-dlq`

It also configures redrive defaults:
- `maxReceiveCount=5`
- `VisibilityTimeout=30`
- `MessageRetentionPeriod=1209600`
- and sets LocalStack-safe dummy AWS credentials automatically if they are not already defined.

Equivalent direct Terraform commands:
```bash
cd infrastructure/terraform/localstack-sqs
terraform init
terraform apply -auto-approve \
  -var='aws_endpoint_url=http://localhost:4566' \
  -var='aws_region=ap-southeast-2'
```

Verify queue attributes:
```bash
aws --endpoint-url=http://localhost:4566 --region ap-southeast-2 sqs get-queue-attributes \
  --queue-url "$SQS_BIRTHDAY_QUEUE_URL" \
  --attribute-names RedrivePolicy VisibilityTimeout MessageRetentionPeriod
```

## Validation commands
```bash
npm run typecheck
npm run lint
npm run test
npm run test:integration
```
Planner SQS LocalStack integration test is optional and gated:
```bash
RUN_INTEGRATION=true RUN_AWS_INTEGRATION=true npm run test src/tests/sqs-delivery-queue.integration.test.ts
RUN_INTEGRATION=true RUN_AWS_INTEGRATION=true npm run test src/tests/dlq-redrive.integration.test.ts
```

## Run scaffold processes
```bash
npm run dev:api
npm run dev:planner
npm run dev:worker
```

`dev:planner` is implemented and polls for due/missed occurrences.
`dev:worker` is implemented and polls SQS for delivery jobs.

## Database migration wiring
Migration commands:
```bash
npm run db:migrate
npm run db:migrate:down
```

## Current API surface
- `POST /user`
- `DELETE /user`

### POST /user
Request body:
```json
{
  "firstName": "Derar",
  "lastName": "Alkhateeb",
  "birthday": "1990-03-07",
  "timezone": "Australia/Melbourne"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "firstName": "Derar",
  "lastName": "Alkhateeb",
  "birthday": "1990-03-07",
  "timezone": "Australia/Melbourne"
}
```

### DELETE /user
Request body:
```json
{
  "id": "uuid"
}
```

Responses:
- `204` when deleted
- `404` when user does not exist
