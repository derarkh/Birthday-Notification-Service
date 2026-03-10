# Birthday Notification Service

TypeScript Node.js service scaffold for timezone-safe birthday notifications.


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
- Projector polling: `PROJECTOR_POLL_INTERVAL_SECONDS=10`, `PROJECTOR_BATCH_SIZE=200`

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
npm run dev:projector
npm run dev:planner
npm run dev:worker
```

`dev:projector` projects user change events into occurrence rows.
`dev:planner` is enqueue-only and polls for due/missed projected occurrences.
`dev:worker` is implemented and polls SQS for delivery jobs.

## Runtime Flow (Projector + Planner)
1. API writes users (`POST`, `PATCH`, `DELETE`).
2. DB trigger inserts rows into `user_change_events`.
3. Projector consumes unprocessed `user_change_events` and upserts `notification_occurrences`.
4. Planner claims due occurrences and enqueues them to SQS.
5. Worker consumes SQS messages, sends outbound HTTP request, and updates occurrence status.

## Manual E2E Scenario Script
After starting `dev:api`, `dev:projector`, `dev:planner`, and `dev:worker`, run:

```bash
npm run e2e:add-users
```

What the script does:
- creates two cohorts of users:
  - `ExactScenario-*` (same birthday, same timezone, same due timestamp)
  - `LookbackScenario-*` (missed window recovered via planner lookback)
- creates and deletes `DeletedScenario-*`, then verifies no notification occurrence is created/sent for that user
- prints initial DB rows for those users
- waits for planner/worker processing
- prints final DB rows with `status`, `due_at_utc`, `sent_at`, `last_error`
- exits with error if non-deleted rows are not `sent` or deleted-user row gets an occurrence

At the end, it asks you to verify webhook requests manually.
Expected webhook requests:
- `6` total (`3` exact-scenario + `3` lookback-scenario)
- message format: `Hey, {full_name} it’s your birthday`

## Database migration wiring
Migration commands:
```bash
npm run db:migrate
npm run db:migrate:down
```

## Current API surface
- `POST /user`
- `PATCH /user`
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

### PATCH /user
Request body:
```json
{
  "id": "uuid",
  "birthday": "1990-03-08",
  "timezone": "UTC"
}
```

Rules:
- `id` is required
- at least one updatable field is required
- `birthday` and `timezone` validation is the same as `POST /user`

Responses:
- `200` with updated user
- `400` invalid payload
- `404` user not found
