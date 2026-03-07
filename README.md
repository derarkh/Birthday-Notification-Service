# Birthday Notification Service

TypeScript Node.js service scaffold for timezone-safe birthday notifications.

This Slice 1 baseline provides:
- strict TypeScript project setup
- Fastify runtime scaffold with `GET /health`
- lint/typecheck/test tooling
- PostgreSQL + LocalStack (SQS) local dependencies via Docker Compose
- migration wiring with `node-pg-migrate` (no tables yet)

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

## Environment
Copy `.env.example` to `.env` and adjust values as needed.

Key defaults:
- API port: `3000`
- PostgreSQL: `postgres://postgres:postgres@localhost:5432/birthday_service`
- LocalStack endpoint: `http://localhost:4566`
- queue URL placeholder: `http://localhost:4566/000000000000/birthday-delivery-queue`

## Install
```bash
npm install
```

## Start local dependencies
```bash
docker compose up -d postgres localstack
```

## Create SQS queue in LocalStack
```bash
./scripts/localstack/create-queues.sh
```
The script sets LocalStack-safe dummy AWS credentials automatically if they are not already defined.

Equivalent direct command:
```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_SESSION_TOKEN=test \
aws --endpoint-url=http://localhost:4566 --region ap-southeast-2 sqs create-queue --queue-name birthday-delivery-queue
```

## Validation commands
```bash
npm run typecheck
npm run lint
npm run test
```

## Run scaffold processes
```bash
npm run dev:api
npm run dev:planner
npm run dev:worker
```

`dev:planner` and `dev:worker` are placeholders in Slice 1.

## Database migration wiring
No schema migration is included in Slice 1.

Migration commands are wired for upcoming slices:
```bash
npm run db:migrate
npm run db:migrate:down
```

## Current API surface in Slice 1
- `GET /health` for scaffold verification

`POST /user` and `DELETE /user` are planned for Slice 2.
