# AGENTS.md

## Mission
Build and maintain a TypeScript Node.js service that sends birthday messages to users at exactly 9:00 AM in their local timezone.

The system must be correct, testable, scalable, and easy to extend for future event-driven notifications such as anniversaries or other scheduled workflows.

## Source of truth
Before changing behavior, read:
- `docs/features.md`
- `docs/architecture.md`
- API contracts
- database schema and migration files
- tests covering the affected feature

If implementation and docs disagree, do not silently change behavior. Either:
1. align the code and tests to the documented behavior when the docs appear intentional, or
2. flag the mismatch clearly in the PR summary or task output.

## Product context
This service manages users and sends a birthday message at 9:00 AM in their local timezone through an outbound HTTP call to a RequestBin-like endpoint.

The service must also recover missed sends if the service was down for a period of time.

## Core non-negotiable requirements
- Use TypeScript.
- Expose only these user APIs unless explicitly asked otherwise:
  - `POST /user`
  - `DELETE /user`
- A user has:
  - `firstName`
  - `lastName`
  - `birthday`
  - `location` or canonical `timezone`
- The system sends exactly this message format:
  - `Hey, {full_name} it’s your birthday`
- Delivery time is exactly 9:00 AM in the user's local timezone on the correct birthday date for that timezone.
- Duplicate messages are unacceptable.
- The system must recover missed sends after downtime.
- The design must scale to thousands of birthdays per day.
- The design must be extensible for future scheduled event types.

## Architecture direction
Prefer an event-driven design with clear boundaries.

Recommended logical components:
1. **API layer**
   - validates input
   - creates or deletes users
2. **Domain layer**
   - user lifecycle
   - occasion scheduling rules
   - idempotency rules
3. **Persistence layer**
   - users
   - notification jobs or occurrences
   - delivery attempts and delivery state
4. **Scheduler / planner**
   - determines which birthday notifications become due
   - supports catch-up for downtime windows
5. **Queue-based dispatch**
   - enqueue due deliveries to SQS
6. **Worker**
   - consumes messages from SQS
   - performs HTTP callback to outbound endpoint
   - marks delivery status atomically
7. **Observability**
   - structured logs
   - metrics hooks
   - health checks

## AWS and LocalStack guidance
Prefer AWS-shaped architecture, runnable locally.

Default recommended stack:
- **Node.js + TypeScript**
- **Fastify** for HTTP API
- **PostgreSQL** for persistence
- **SQS** for delivery queue
- **SNS** optional only if later fan-out is needed. Do not add SNS unless it clearly improves the design.
- **LocalStack** for local AWS emulation

Recommended use of AWS services:
- Use **SQS** for durable asynchronous delivery jobs.
- Optionally use **EventBridge Scheduler** or a polling planner in production later, but for the exercise prefer an internal planner process that is easy to run locally and test.
- If using SNS, use it only as an event fan-out layer for future multi-subscriber workflows. For the current problem, SQS alone is usually enough.

### Local development expectations
Support local development using:
- LocalStack for AWS services
- local PostgreSQL, preferably via Docker Compose
- a RequestBin-like endpoint for inspecting outbound messages

Provide scripts or instructions for:
- starting dependencies
- creating required SQS queues in LocalStack
- running DB migrations
- starting API and worker processes
- running tests

## Data modeling guidance
Design for future extensibility.

Do not hardcode birthday logic deep inside transport or DB code.
Instead model a generic scheduled notification concept that can later support:
- birthday
- anniversary
- work anniversary
- renewal reminders
- arbitrary future occasion types

Recommended entities:
- `users`
- `notification_rules` or derived schedule configuration
- `notification_occurrences` or `delivery_jobs`
- `delivery_attempts`

Minimum required persisted information should support:
- user identity
- timezone resolution
- occasion type
- scheduled local date and local send time
- normalized UTC due timestamp
- status lifecycle such as `pending`, `enqueued`, `sent`, `failed`
- unique idempotency key per logical send

## Timezone and location rules
Location can be stored in any format of our choice, but the implementation must convert it deterministically into an IANA timezone.

Preferred input choices:
1. accept timezone directly, for example `Australia/Melbourne`, or
2. accept city plus country and resolve it to a timezone in a dedicated resolver component.

For the exercise, prefer storing a canonical IANA timezone string because it is deterministic and testable.

Never rely on server local time.
Always compute eligibility relative to the user's timezone.

Be careful with:
- leap years for Feb 29 birthdays
- daylight saving transitions
- exact 9:00 AM local time conversion to UTC
- date boundaries around UTC day changes

## Recovery and downtime rules
The system must recover missed sends after downtime.

Design expectation:
- A planner periodically scans for due but unsent occurrences.
- It should look back over a configurable catch-up window, for example 24 to 48 hours.
- It should safely enqueue anything still pending.
- Idempotency must guarantee that recovery scans do not create duplicate sends.

Recommended pattern:
- Persist occurrences or a durable delivery record before enqueueing.
- Use a unique constraint on the logical send key such as:
  - `user_id + occasion_type + local_occurrence_date`
- Make state transitions atomic.
- Workers must be retry-safe.

## Duplicate prevention and race conditions
Duplicate messages are unacceptable.

Required safeguards:
- DB-level unique constraint for a logical send key
- idempotent enqueue behavior
- worker-side idempotent send flow
- atomic state update when claiming work
- safe retry logic
- queue consumer must tolerate redelivery without duplicate external effects

Useful strategies:
- optimistic locking, transactional updates, or `SELECT ... FOR UPDATE SKIP LOCKED`
- an outbox-style pattern if needed
- explicit idempotency key included in logs and delivery metadata

## Scalability expectations
The design should comfortably support thousands of birthdays per day.

Prefer:
- batch planning queries with proper indexing
- queue-based asynchronous dispatch
- horizontal workers
- efficient pagination for planner scans
- limited per-request work in the API

Avoid:
- scanning all users every minute without indexing strategy
- per-user cron jobs
- in-memory-only schedules
- any solution that loses track of due work after restart

## Test strategy
Every meaningful behavior change should include tests.

Minimum expected coverage:
1. **Unit tests**
   - timezone conversion and birthday eligibility
   - message formatting
   - idempotency key generation
   - planner due-window selection logic
2. **Integration tests**
   - `POST /user`
   - `DELETE /user`
   - DB persistence
   - planner enqueue flow
   - worker delivery flow
3. **End-to-end tests**
   - create a user
   - simulate due time
   - verify exactly one outbound birthday message
   - simulate downtime and catch-up recovery

Priority edge cases to test:
- Melbourne vs New York same calendar day in different UTC offsets
- downtime recovery after one day
- repeated planner runs do not duplicate sends
- repeated worker deliveries do not duplicate sends
- deleted users do not receive future sends
- invalid timezone input is rejected
- Feb 29 behavior is explicit and documented

## Feature slicing guidance
When implementing or changing the system, work in small testable slices in this order unless the task says otherwise:

1. Project scaffolding
   - TypeScript setup
   - linting
   - testing framework
   - env config
2. Basic API
   - `POST /user`
   - `DELETE /user`
   - input validation
3. Persistence
   - users table
   - migrations
   - repository abstractions
4. Timezone-safe scheduling primitives
   - local birthday calculation
   - UTC due-time calculation
5. Notification occurrence model
   - durable logical send record
   - unique idempotency constraint
6. Planner
   - find due pending occurrences
   - enqueue to SQS
7. Worker
   - consume SQS message
   - call outbound endpoint
   - persist result atomically
8. Recovery logic
   - configurable lookback window
   - safe reprocessing
9. Observability and operational polish
   - logs
   - health endpoints
   - metrics hooks
10. Hardening
   - retries
   - dead-letter queue
   - concurrency protections

## Coding rules
- Prefer clean architecture or layered architecture with explicit interfaces.
- Keep domain logic independent from framework code.
- Keep AWS SDK usage behind adapters.
- Keep DB access behind repositories or query modules.
- Avoid premature abstractions, but keep boundaries clear.
- Prefer composition over inheritance.
- Use strict TypeScript.
- Validate all external input.
- Add concise comments only where reasoning is non-obvious.

## File and module suggestions
A structure like this is preferred unless there is a better justified alternative:

```text
src/
  app/
    api/
    worker/
    planner/
  domain/
    user/
    notification/
    scheduling/
  infrastructure/
    db/
    aws/
    http/
    config/
    logging/
  tests/
```

## Expected deliverables when asked to implement
Unless instructed otherwise, produce:
- code
- tests
- migration files
- local run instructions
- LocalStack setup instructions or scripts
- brief architecture notes

## Change safety rules
Do not:
- change the outbound message text format
- remove idempotency protections
- move business logic into ad hoc controllers
- introduce hidden time assumptions based on server timezone

Do:
- keep the design extensible
- preserve backward compatibility where reasonable
- explain tradeoffs when choosing between alternatives
- prefer simple, robust solutions over clever ones

## Decision defaults
Use these defaults unless the task explicitly asks for something else:
- Fastify over Express
- PostgreSQL over NoSQL
- SQS over SNS for current requirements
- store canonical IANA timezone on the user record
- planner plus worker model over in-memory cron-only design
- Docker Compose plus LocalStack for local setup

## Definition of done
A task is done only when:
- behavior is implemented
- tests cover the new behavior
- local instructions still work
- no duplicate-send path is introduced
- the design remains extensible for future occasion types
