import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { WorkerService, type DeliveryQueueConsumer, type OutboundBirthdayClient } from '../app/worker/worker-service.js';
import { PostgresNotificationOccurrenceRepository } from '../infrastructure/db/notification-occurrence-repository.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PostgresUserRepository } from '../infrastructure/db/user-repository.js';

const dbUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/birthday_service';
const runIntegration = process.env.RUN_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration);

testSuite('worker integration', () => {
  const pool = createPool(dbUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE user_change_events, notification_occurrences, users CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sends one outbound message and marks sent atomically', async () => {
    const user = await userRepository.create({
      firstName: 'Derar',
      lastName: 'Alkhateeb',
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne'
    });

    const occurrence = await occurrenceRepository.createOrGet({
      userId: user.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-15',
      dueAtUtc: new Date('2026-12-14T22:00:00.000Z')
    });

    await pool.query("UPDATE notification_occurrences SET status = 'enqueued' WHERE id = $1", [
      occurrence.id
    ]);

    const queueMessages = [
      { receiptHandle: 'r1', body: JSON.stringify({ occurrenceId: occurrence.id }) },
      { receiptHandle: 'r2', body: JSON.stringify({ occurrenceId: occurrence.id }) }
    ];

    const queueConsumer: DeliveryQueueConsumer = {
      receiveMessages: async () => queueMessages,
      acknowledgeMessage: async () => {}
    };

    const sentMessages: string[] = [];
    const outboundClient: OutboundBirthdayClient = {
      sendBirthdayMessage: async (message) => {
        sentMessages.push(message);
      }
    };

    const worker = new WorkerService(queueConsumer, occurrenceRepository, outboundClient);
    const summary = await worker.runOnce(new Date('2026-12-15T01:00:00.000Z'));

    expect(summary).toEqual({ received: 2, sent: 1, skipped: 1, failed: 0 });
    expect(sentMessages).toEqual(['Hey, Derar Alkhateeb it\u2019s your birthday']);

    const statusResult = await pool.query(
      'SELECT status, sent_at IS NOT NULL AS has_sent_at FROM notification_occurrences WHERE id = $1',
      [occurrence.id]
    );

    expect(statusResult.rows[0]).toEqual({ status: 'sent', has_sent_at: true });
  });
});
