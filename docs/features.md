# Birthday Notification Service Features

## Overview
This service stores users and sends a birthday greeting exactly at 9:00 AM in each user's local timezone.

Current message format:
- `Hey, {full_name} it’s your birthday`

Current supported capability:
- create user
- delete user
- schedule birthday notification delivery
- recover missed deliveries after downtime

The architecture should support future scheduled occasions without major redesign.

---

## Goals
- Send birthday messages at the correct local time.
- Never send duplicate messages.
- Recover missed messages after downtime.
- Scale to thousands of birthdays per day.
- Make future occasions like anniversaries easy to add.

---

## Non-goals for the first version
- User updates
- Authentication and authorization
- UI
- complex geographic address parsing
- multi-channel delivery such as SMS or email
- user preferences and opt-out flows
- distributed multi-region deployment

---

## API features

### Feature 1. Create user
**Endpoint**
- `POST /user`

**Purpose**
Create a user eligible for future birthday notifications.

**Input**
- `firstName`: string
- `lastName`: string
- `birthday`: date-only value
- `timezone`: canonical IANA timezone string

Using `timezone` instead of a free-form location is preferred for correctness and testability.
If a `location` field is required by the exercise wording, the service may still accept `location`, but it should normalize and persist a canonical `timezone`.

**Validation rules**
- first and last names are required
- birthday must be a valid date
- timezone must be a valid IANA timezone
- duplicate user creation behavior should be explicit and tested

**Acceptance criteria**
- valid input creates a user record
- invalid input returns a validation error
- stored record includes a canonical timezone
- creation does not send any message immediately unless the user is already due under explicitly defined behavior

**Suggested tests**
- create user with valid Melbourne timezone
- reject invalid timezone
- reject malformed birthday

---

### Feature 2. Delete user
**Endpoint**
- `DELETE /user`

**Purpose**
Delete a user so they do not receive future birthday notifications.

**Input**
The request should identify the user explicitly, for example by user ID.

**Acceptance criteria**
- existing user can be deleted
- deleting a non-existent user returns a documented result
- future unsent occurrences for the deleted user are not delivered
- already sent historical delivery records may remain for auditability

**Suggested tests**
- delete existing user
- delete non-existent user
- deleted user does not receive future birthday delivery

---

## Scheduling features

### Feature 3. Compute birthday due time correctly
**Purpose**
Determine when a user's birthday notification is due.

**Business rule**
A birthday notification is due at `09:00:00` in the user's local timezone on the user's birthday date.

**Important details**
- timezone conversion must be deterministic
- server timezone must not matter
- local birthday must be interpreted in the user's timezone
- due time should be normalized to UTC for storage or comparison

**Acceptance criteria**
- Melbourne and New York users receive the message at their own 9:00 AM
- users in different timezones may be due at different UTC times on the same local date
- due-time calculation is unit tested

**Suggested tests**
- Melbourne birthday due calculation
- New York birthday due calculation
- DST transition period scenarios

---

### Feature 4. Durable occurrence tracking
**Purpose**
Persist a durable logical record for each birthday send so the system can recover from downtime and prevent duplicates.

**Business rule**
There must be at most one logical birthday delivery per user per birthday occurrence.

**Recommended logical key**
- `userId + occasionType + localOccurrenceDate`

For birthdays, `occasionType = birthday`.

**Acceptance criteria**
- each logical birthday occurrence has one durable record
- duplicate creation attempts do not produce duplicate logical sends
- state transitions are explicit

**Suggested states**
- `pending`
- `enqueued`
- `sent`
- `failed`

**Suggested tests**
- unique key prevents duplicates
- duplicate planner run does not create duplicate occurrence

---

## Dispatch features

### Feature 5. Enqueue due deliveries via SQS
**Purpose**
Move due birthday deliveries onto a durable queue for asynchronous processing.

**Business rule**
A planner process periodically finds due pending occurrences and enqueues them to SQS.

**Why SQS**
- decouples planning from outbound delivery
- supports retries and worker scaling
- works well with LocalStack locally

**Acceptance criteria**
- due pending occurrences are enqueued
- non-due occurrences are ignored
- enqueue is idempotent across repeated planner runs
- queue payload contains enough data to perform delivery or fetch it safely

**Suggested tests**
- planner enqueues one due occurrence
- planner ignores future occurrence
- repeated planner execution does not duplicate work

---

### Feature 6. Worker sends outbound birthday message
**Purpose**
Consume queued work and call the RequestBin-like endpoint.

**Business rule**
The outbound message body must contain:
- `Hey, {full_name} it’s your birthday`

**Acceptance criteria**
- worker consumes queued message
- worker sends correct payload to outbound endpoint
- successful send marks occurrence as `sent`
- failures are retried safely without creating duplicates

**Suggested tests**
- worker sends correct message for one occurrence
- retried worker run does not send duplicate when already marked sent

---

## Recovery features

### Feature 7. Catch up missed deliveries after downtime
**Purpose**
Ensure due unsent birthday messages are still delivered after the service was unavailable.

**Business rule**
The planner must scan a configurable lookback window and enqueue any logical occurrences that are due but not yet sent.

**Recommended default**
- look back at least 24 hours
- make the window configurable

**Acceptance criteria**
- if the service was down for a day, missed due occurrences are recovered
- recovery does not produce duplicates
- already sent occurrences are not sent again

**Suggested tests**
- simulate planner downtime for one day and verify catch-up
- repeated recovery scan remains idempotent

---

## Reliability features

### Feature 8. Prevent duplicate sends
**Purpose**
Guarantee at-most-once logical delivery for each birthday occurrence.

**Protection layers**
1. durable occurrence record with unique constraint
2. idempotent enqueueing
3. atomic worker claim or send transition
4. retry-safe consumer logic

**Acceptance criteria**
- concurrent workers do not send duplicates
- repeated SQS delivery does not cause duplicate outbound calls once marked sent
- recovery flow remains safe under concurrent execution

**Suggested tests**
- concurrent planner instances
- concurrent worker attempts
- message redelivery scenario

---

## Scalability features

### Feature 9. Handle thousands of birthdays per day
**Purpose**
Keep the system efficient as volume grows.

**Expected design characteristics**
- indexed DB queries for due work
- planner works in batches
- workers scale horizontally
- API remains lightweight
- no per-user scheduler jobs

**Acceptance criteria**
- due-selection query uses indexed columns
- planner can process pages or batches
- worker count can increase independently of the API

**Suggested tests**
- batch planner logic unit test
- integration test with many queued items

---

## Extensibility features

### Feature 10. Occasion-agnostic design
**Purpose**
Make it easy to add future occasions such as anniversaries.

**Design rule**
Birthday logic should reuse generic scheduling and delivery mechanisms where possible.
Only occasion-specific rules should vary.

**Examples of future extensions**
- wedding anniversary
- work anniversary
- subscription renewal reminder
- onboarding milestone messages

**Acceptance criteria**
- notification pipeline is not hardcoded only to birthdays
- occasion type is modeled explicitly
- adding a new occasion should mainly require new rule calculation and message formatting

---

## Recommended architecture

### Components
1. **API service**
   - owns `POST /user` and `DELETE /user`
2. **Planner**
   - periodically finds due or missed pending occurrences
   - enqueues them to SQS
3. **Worker**
   - consumes SQS
   - sends outbound HTTP request
   - updates delivery state
4. **Database**
   - stores users and durable occurrence records
5. **Outbound adapter**
   - encapsulates RequestBin call

### Why this architecture
- easy to reason about
- easy to test
- resilient to restarts
- scalable under queue-based load
- easy to extend with new occasion types

---

## LocalStack usage guidance

### Expected local AWS resources
- one SQS queue for delivery jobs
- optionally one dead-letter queue

### Local developer workflow
1. start LocalStack
2. create SQS queue
3. start database
4. run migrations
5. start API
6. start planner
7. start worker
8. inspect outbound requests in RequestBin-like endpoint

### Acceptance criteria for local setup
- service can run locally end-to-end
- SQS queue works via LocalStack
- no real AWS account is required for local development

---

## Data model guidance

### User
Fields:
- `id`
- `first_name`
- `last_name`
- `birthday`
- `timezone`
- `created_at`
- `deleted_at` or hard delete strategy

### Notification occurrence or delivery job
Fields:
- `id`
- `user_id`
- `occasion_type`
- `local_occurrence_date`
- `local_due_time`
- `due_at_utc`
- `status`
- `idempotency_key`
- `enqueued_at`
- `sent_at`
- `last_error`
- timestamps

### Delivery attempt
Optional but useful fields:
- `id`
- `occurrence_id`
- `attempt_number`
- `started_at`
- `finished_at`
- `result`
- `error`

---

## Open design choices to make explicit in implementation
These should be documented in code or README:
- whether users are hard-deleted or soft-deleted
- how Feb 29 birthdays are handled in non-leap years
- exact polling cadence for the planner
- whether occurrences are pre-generated or generated on demand during planning
- exact SQS retry and DLQ settings

Recommended simple choice for the exercise:
- generate occurrences on demand during planning, backed by idempotent DB records

---

## Suggested implementation order
1. scaffold project and test setup
2. implement user API and validation
3. implement DB schema and repositories
4. implement timezone and due-time calculation
5. implement durable occurrence model with unique constraint
6. implement planner to find and enqueue due work
7. implement worker and outbound delivery
8. implement recovery lookback logic
9. add concurrency protections and retry handling
10. add docs and operational scripts

---

## Definition of success
The system is successful when:
- a Melbourne user gets the birthday message at 9:00 AM Melbourne time
- a New York user gets the birthday message at 9:00 AM New York time
- missed sends after downtime are caught up
- no duplicate birthday messages are sent
- the design is still clean when a new occasion type is introduced later
