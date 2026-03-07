import { describe, expect, it } from 'vitest';

import { WorkerService, type DeliveryQueueConsumer, type OutboundBirthdayClient, type WorkerOccurrenceRepository } from '../app/worker/worker-service.js';
import type { ClaimedDeliveryOccurrence, NotificationOccurrence } from '../domain/notification.js';

function buildOccurrence(id: string): NotificationOccurrence {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    userId: 'user-1',
    occasionType: 'birthday',
    localOccurrenceDate: '2026-01-01',
    dueAtUtc: now,
    status: 'processing',
    idempotencyKey: `birthday:user-1:2026-01-01:${id}`,
    enqueuedAt: now,
    sentAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };
}

describe('worker service', () => {
  it('sends birthday message and marks occurrence sent', async () => {
    const acknowledged: string[] = [];
    const sentMessages: string[] = [];

    const queueConsumer: DeliveryQueueConsumer = {
      receiveMessages: async () => [
        { receiptHandle: 'r1', body: JSON.stringify({ occurrenceId: 'occ-1' }) }
      ],
      acknowledgeMessage: async (receiptHandle) => {
        acknowledged.push(receiptHandle);
      }
    };

    const repository: WorkerOccurrenceRepository = {
      claimForDelivery: async () => ({
        occurrence: buildOccurrence('occ-1'),
        firstName: 'Derar',
        lastName: 'Alkhateeb'
      }),
      markSent: async () => true,
      markDeliveryFailed: async () => {}
    };

    const outboundClient: OutboundBirthdayClient = {
      sendBirthdayMessage: async (message) => {
        sentMessages.push(message);
      }
    };

    const worker = new WorkerService(queueConsumer, repository, outboundClient);
    const summary = await worker.runOnce(new Date('2026-01-01T10:00:00.000Z'));

    expect(summary).toEqual({ received: 1, sent: 1, skipped: 0, failed: 0 });
    expect(sentMessages).toEqual(['Hey, Derar Alkhateeb it\u2019s your birthday']);
    expect(acknowledged).toEqual(['r1']);
  });

  it('does not duplicate outbound send for redelivered already-sent occurrence', async () => {
    const sentMessages: string[] = [];
    const claims: Array<ClaimedDeliveryOccurrence | null> = [
      {
        occurrence: buildOccurrence('occ-1'),
        firstName: 'Derar',
        lastName: 'Alkhateeb'
      },
      null
    ];

    const queueConsumer: DeliveryQueueConsumer = {
      receiveMessages: async () => [
        { receiptHandle: 'r1', body: JSON.stringify({ occurrenceId: 'occ-1' }) },
        { receiptHandle: 'r2', body: JSON.stringify({ occurrenceId: 'occ-1' }) }
      ],
      acknowledgeMessage: async () => {}
    };

    const repository: WorkerOccurrenceRepository = {
      claimForDelivery: async () => claims.shift() ?? null,
      markSent: async () => true,
      markDeliveryFailed: async () => {}
    };

    const outboundClient: OutboundBirthdayClient = {
      sendBirthdayMessage: async (message) => {
        sentMessages.push(message);
      }
    };

    const worker = new WorkerService(queueConsumer, repository, outboundClient);
    const summary = await worker.runOnce(new Date('2026-01-01T10:00:00.000Z'));

    expect(summary).toEqual({ received: 2, sent: 1, skipped: 1, failed: 0 });
    expect(sentMessages).toHaveLength(1);
  });

  it('marks delivery failed when outbound send fails', async () => {
    const failedIds: string[] = [];

    const queueConsumer: DeliveryQueueConsumer = {
      receiveMessages: async () => [
        { receiptHandle: 'r1', body: JSON.stringify({ occurrenceId: 'occ-1' }) }
      ],
      acknowledgeMessage: async () => {}
    };

    const repository: WorkerOccurrenceRepository = {
      claimForDelivery: async () => ({
        occurrence: buildOccurrence('occ-1'),
        firstName: 'Derar',
        lastName: 'Alkhateeb'
      }),
      markSent: async () => true,
      markDeliveryFailed: async (occurrenceId) => {
        failedIds.push(occurrenceId);
      }
    };

    const outboundClient: OutboundBirthdayClient = {
      sendBirthdayMessage: async () => {
        throw new Error('requestbin unavailable');
      }
    };

    const worker = new WorkerService(queueConsumer, repository, outboundClient);
    const summary = await worker.runOnce(new Date('2026-01-01T10:00:00.000Z'));

    expect(summary).toEqual({ received: 1, sent: 0, skipped: 0, failed: 1 });
    expect(failedIds).toEqual(['occ-1']);
  });
});
