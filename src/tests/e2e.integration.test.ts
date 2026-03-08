import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app/api/app.js';
import { PlannerService, type DeliveryQueuePublisher } from '../app/planner/planner-service.js';
import {
  WorkerService,
  type DeliveryQueueConsumer,
  type DeliveryQueueMessage,
  type OutboundBirthdayClient
} from '../app/worker/worker-service.js';
import { PostgresNotificationOccurrenceRepository } from '../infrastructure/db/notification-occurrence-repository.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PostgresUserRepository } from '../infrastructure/db/user-repository.js';

const dbUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/birthday_service';
const runIntegration = process.env.RUN_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration);

class InMemoryDeliveryQueue implements DeliveryQueuePublisher, DeliveryQueueConsumer {
  private readonly messages: DeliveryQueueMessage[] = [];

  private receiptCounter = 0;

  public async publishOccurrence(occurrence: { id: string }): Promise<void> {
    this.receiptCounter += 1;
    this.messages.push({
      receiptHandle: `r-${this.receiptCounter}`,
      body: JSON.stringify({ occurrenceId: occurrence.id })
    });
  }

  public async receiveMessages(): Promise<DeliveryQueueMessage[]> {
    return [...this.messages];
  }

  public async acknowledgeMessage(receiptHandle: string): Promise<void> {
    const index = this.messages.findIndex((message) => message.receiptHandle === receiptHandle);
    if (index >= 0) {
      this.messages.splice(index, 1);
    }
  }

  public size(): number {
    return this.messages.length;
  }
}

testSuite('end-to-end birthday flow', () => {
  const pool = createPool(dbUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);
  const app = buildApp({ userRepository });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE notification_occurrences, users CASCADE');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates user, plans due occurrence, sends one message, marks sent', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Derar',
        lastName: 'Alkhateeb',
        birthday: '1985-12-15',
        timezone: 'Australia/Melbourne'
      }
    });
    expect(createResponse.statusCode).toBe(201);

    const queue = new InMemoryDeliveryQueue();
    const planner = new PlannerService(userRepository, occurrenceRepository, queue, {
      lookbackHours: 48,
      batchSize: 200,
      userPageSize: 500
    });

    const now = new Date('2026-12-15T01:00:00.000Z');
    const plannerSummary = await planner.runOnce(now);

    expect(plannerSummary).toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(queue.size()).toBe(1);

    const outboundMessages: string[] = [];
    const outboundClient: OutboundBirthdayClient = {
      sendBirthdayMessage: async (message) => {
        outboundMessages.push(message);
      }
    };

    const worker = new WorkerService(queue, occurrenceRepository, outboundClient);
    const workerSummary = await worker.runOnce(now);

    expect(workerSummary).toEqual({ received: 1, sent: 1, skipped: 0, failed: 0 });
    expect(outboundMessages).toEqual(['Hey, Derar Alkhateeb it\u2019s your birthday']);
    expect(queue.size()).toBe(0);

    const statusResult = await pool.query(
      `
      SELECT status, sent_at IS NOT NULL AS has_sent_at
      FROM notification_occurrences
      `
    );

    expect(statusResult.rows).toEqual([{ status: 'sent', has_sent_at: true }]);
  });

  it('recovers missed send after downtime with lookback window', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Downtime',
        lastName: 'Case',
        birthday: '1985-12-14',
        timezone: 'Australia/Melbourne'
      }
    });
    expect(createResponse.statusCode).toBe(201);

    const queue = new InMemoryDeliveryQueue();
    const planner = new PlannerService(userRepository, occurrenceRepository, queue, {
      lookbackHours: 48,
      batchSize: 200,
      userPageSize: 500
    });

    const now = new Date('2026-12-15T10:00:00.000Z');
    const plannerSummary = await planner.runOnce(now);

    expect(plannerSummary).toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(queue.size()).toBe(1);

    const outboundMessages: string[] = [];
    const outboundClient: OutboundBirthdayClient = {
      sendBirthdayMessage: async (message) => {
        outboundMessages.push(message);
      }
    };

    const worker = new WorkerService(queue, occurrenceRepository, outboundClient);
    const workerSummary = await worker.runOnce(now);

    expect(workerSummary).toEqual({ received: 1, sent: 1, skipped: 0, failed: 0 });
    expect(outboundMessages).toEqual(['Hey, Downtime Case it\u2019s your birthday']);

    const secondPlannerSummary = await planner.runOnce(now);
    expect(secondPlannerSummary).toEqual({ claimed: 0, enqueued: 0, failed: 0 });

    const secondWorkerSummary = await worker.runOnce(now);
    expect(secondWorkerSummary).toEqual({ received: 0, sent: 0, skipped: 0, failed: 0 });
    expect(outboundMessages).toHaveLength(1);
  });

  it('deleted users do not receive future sends', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Deleted',
        lastName: 'User',
        birthday: '1985-12-15',
        timezone: 'Australia/Melbourne'
      }
    });
    expect(createResponse.statusCode).toBe(201);

    const created = createResponse.json() as { id: string };

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/user',
      payload: {
        id: created.id
      }
    });
    expect(deleteResponse.statusCode).toBe(204);

    const queue = new InMemoryDeliveryQueue();
    const planner = new PlannerService(userRepository, occurrenceRepository, queue, {
      lookbackHours: 48,
      batchSize: 200,
      userPageSize: 500
    });

    const now = new Date('2026-12-15T01:00:00.000Z');
    const plannerSummary = await planner.runOnce(now);

    expect(plannerSummary).toEqual({ claimed: 0, enqueued: 0, failed: 0 });
    expect(queue.size()).toBe(0);

    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM notification_occurrences');
    expect(countResult.rows[0]?.total).toBe(0);
  });
});
