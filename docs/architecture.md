# Architecture

## Overview
The service is a planner + worker system with PostgreSQL as source of truth:
- API manages users (`POST /user`, `DELETE /user`)
- Planner generates and enqueues due birthday occurrences
- SQS buffers delivery jobs
- Worker consumes SQS and performs outbound HTTP delivery
- PostgreSQL stores durable user and occurrence state

Current local infrastructure includes SQS main queue + DLQ provisioning (via Terraform + LocalStack).

## High-Level Components
```text
Client -> API -> PostgreSQL

Planner -> PostgreSQL -> SQS (main queue)
Worker -> SQS (main queue) -> PostgreSQL -> Outbound HTTP endpoint

SQS main queue -> DLQ (redrive policy provisioned)
```

## Hexagonal Component Diagram
The project follows a ports-and-adapters style:
- Core (`app` + `domain`) defines ports (interfaces and business workflows).
- Infrastructure implements adapters for those ports (Postgres, SQS, HTTP).
- External systems interact only through adapters.

```mermaid
flowchart LR
  Client[Client]
  Scheduler[Planner Loop]
  QueuePoller[Worker Loop]
  PG[(PostgreSQL)]
  SQS[(SQS Main Queue)]
  DLQ[(SQS DLQ)]
  Webhook[Outbound Webhook]

  subgraph Core["Hexagon Core (Domain + App Services)"]
    APIUseCase[API Use Cases]
    PlannerSvc[PlannerService]
    WorkerSvc[WorkerService]

    UserPort[[UserRepository Port]]
    OccPort[[NotificationOccurrenceRepository Port]]
    QueuePubPort[[DeliveryQueuePublisher Port]]
    QueueConPort[[DeliveryQueueConsumer Port]]
    OutboundPort[[OutboundBirthdayClient Port]]

    APIUseCase --> UserPort
    PlannerSvc --> UserPort
    PlannerSvc --> OccPort
    PlannerSvc --> QueuePubPort
    WorkerSvc --> QueueConPort
    WorkerSvc --> OccPort
    WorkerSvc --> OutboundPort
  end

  subgraph Adapters["Infrastructure Adapters"]
    ApiAdapter[Fastify API Adapter]
    PlannerAdapter[Planner Runtime Adapter]
    WorkerAdapter[Worker Runtime Adapter]
    UserRepoAdapter[PostgresUserRepository]
    OccRepoAdapter[PostgresNotificationOccurrenceRepository]
    QueuePubAdapter[SqsDeliveryQueuePublisher]
    QueueConAdapter[SqsDeliveryQueueConsumer]
    OutboundAdapter[HttpOutboundBirthdayClient]
  end

  Client --> ApiAdapter --> APIUseCase
  Scheduler --> PlannerAdapter --> PlannerSvc
  QueuePoller --> WorkerAdapter --> WorkerSvc

  UserPort --> UserRepoAdapter --> PG
  OccPort --> OccRepoAdapter --> PG
  QueuePubPort --> QueuePubAdapter --> SQS
  QueueConPort --> QueueConAdapter --> SQS
  OutboundPort --> OutboundAdapter --> Webhook

  SQS --> DLQ
```

## Data Model

### `users`
- `id`
- `first_name`
- `last_name`
- `birthday` (`YYYY-MM-DD`)
- `timezone` (canonical IANA)
- `created_at`
- `deleted_at` (soft delete marker)

### `notification_occurrences`
- `id`
- `user_id`
- `occasion_type` (`birthday`)
- `local_occurrence_date`
- `due_at_utc`
- `status` (`pending`, `enqueued`, `processing`, `sent`, `failed`)
- `idempotency_key`
- `enqueued_at`
- `sent_at`
- `last_error`
- `created_at`
- `updated_at`

Logical uniqueness is enforced at DB level by:
`(user_id, occasion_type, local_occurrence_date)`.

## Scheduling and Delivery Behavior

### Birthday scheduling rule
- Send at exactly `09:00` in the user's local timezone.
- Planner computes `due_at_utc` from birthday + timezone.
- Planner uses configurable lookback window for recovery.

### Planner behavior
- Pages active users (`deleted_at IS NULL`).
- Generates occurrences for years intersecting lookback window.
- Upserts occurrences idempotently.
- Claims due occurrences with `FOR UPDATE SKIP LOCKED`.
- Enqueues claimed occurrences to SQS.
- On enqueue failure, marks occurrence `failed`.

### Worker behavior
- Polls SQS messages.
- Claims occurrence atomically only if `status='enqueued'` and not sent.
- Sends outbound message: `Hey, {full_name} it’s your birthday`.
- On outbound success: marks `sent`.
- On outbound failure: marks `failed`.
- Always acknowledges the SQS message after processing attempt.

## Idempotency and Concurrency
- Occurrence upsert + unique logical key prevents duplicate logical sends.
- Worker claim transition (`enqueued -> processing`) prevents concurrent duplicate processing.
- Sent transition is conditional (`status='processing' AND sent_at IS NULL`).
- Repeated planner runs are safe because creates are idempotent and claim query is state-filtered.

## Retry and Recovery Model (Current)
- Retries currently happen via planner lookback re-claiming `failed` occurrences.
- Worker acknowledges messages even on failure, so queue redelivery is not used for retries.
- DLQ and redrive policy are provisioned in queue topology for operational hardening and future retry semantics.

## Sequence Diagrams

### 1) Happy Path: User -> Due Occurrence -> Sent
```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant API as API
  participant DB as PostgreSQL
  participant Planner as Planner
  participant SQS as SQS Main Queue
  participant Worker as Worker
  participant Outbound as Webhook Endpoint

  Client->>API: POST /user
  API->>DB: INSERT user
  DB-->>API: user row
  API-->>Client: 201

  loop Every planner interval
    Planner->>DB: List active users
    Planner->>DB: Upsert occurrence (unique logical key)
    Planner->>DB: Claim due occurrences (pending/failed, lookback window)
    DB-->>Planner: claimed occurrences
    Planner->>SQS: SendMessage(occurrenceId)
    Planner->>DB: Mark occurrence enqueued
  end

  Worker->>SQS: ReceiveMessage
  SQS-->>Worker: occurrenceId message
  Worker->>DB: Claim for delivery (enqueued -> processing)
  Worker->>Outbound: POST {"message":"Hey, Full Name it’s your birthday"}
  Outbound-->>Worker: 2xx
  Worker->>DB: Mark sent
  Worker-->>SQS: DeleteMessage (ack)
```

### 2) Outbound Failure + Lookback Recovery Retry
```mermaid
sequenceDiagram
  autonumber
  participant Planner as Planner
  participant DB as PostgreSQL
  participant SQS as SQS Main Queue
  participant Worker as Worker
  participant Outbound as Webhook Endpoint

  Planner->>DB: Claim due occurrence
  Planner->>SQS: Enqueue message
  Worker->>SQS: ReceiveMessage
  Worker->>DB: Claim for delivery (enqueued -> processing)
  Worker->>Outbound: POST birthday message
  Outbound-->>Worker: 5xx / timeout
  Worker->>DB: Mark failed (store last_error)
  Worker-->>SQS: DeleteMessage (ack)

  Note over Planner,DB: Next planner interval (within lookback window)
  Planner->>DB: Claim due occurrences where status in (pending, failed)
  Planner->>SQS: Re-enqueue failed occurrence
  Worker->>SQS: ReceiveMessage
  Worker->>DB: Claim for delivery
  Worker->>Outbound: POST birthday message
  Outbound-->>Worker: 2xx
  Worker->>DB: Mark sent
  Worker-->>SQS: DeleteMessage
```

### 3) Deleted User Safety
```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant API as API
  participant DB as PostgreSQL
  participant Planner as Planner

  Client->>API: DELETE /user
  API->>DB: Soft delete user (set deleted_at)
  DB-->>API: deleted
  API-->>Client: 204

  Planner->>DB: List active users
  Note over Planner,DB: deleted_at IS NOT NULL users are excluded
  Planner->>DB: Generate/claim occurrences
  DB-->>Planner: no occurrences for deleted user
```

## Local Infrastructure Notes
- Queue topology is provisioned with Terraform (`infrastructure/terraform/localstack-sqs`):
  - main queue: `birthday-delivery-queue`
  - DLQ: `birthday-delivery-dlq`
  - redrive policy (`maxReceiveCount`)
  - visibility timeout and retention configuration

## Scalability Notes
- Planner uses batched user paging + due-claim batch size.
- Queue decouples scheduling from outbound delivery throughput.
- Worker can scale horizontally with DB claim guards.
- Indexed due/status queries keep planner scans bounded.
