import { describe, expect, it } from 'vitest';

import type { NotificationOccurrence, NotificationOccurrenceRepository } from '../domain/notification.js';
import { PlannerService, type DeliveryQueuePublisher } from '../app/planner/planner-service.js';
import type { UserRepository } from '../domain/user.js';

function buildOccurrence(id: string): NotificationOccurrence {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    userId: 'u-1',
    occasionType: 'birthday',
    localOccurrenceDate: '2026-01-01',
    dueAtUtc: now,
    status: 'enqueued',
    idempotencyKey: `birthday:u-1:2026-01-01:${id}`,
    enqueuedAt: now,
    sentAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };
}

describe('planner service', () => {
  it('marks occurrence as failed when queue publish fails', async () => {
    const claimed = [buildOccurrence('a'), buildOccurrence('b')];
    const failedOccurrenceIds: string[] = [];

    const repository: NotificationOccurrenceRepository = {
      createOrGet: async () => {
        throw new Error('not used in this test');
      },
      findByLogicalKey: async () => {
        throw new Error('not used in this test');
      },
      claimDueForEnqueue: async () => claimed,
      markEnqueueFailed: async (occurrenceId: string) => {
        failedOccurrenceIds.push(occurrenceId);
      }
    };
    const userRepository: UserRepository = {
      create: async () => {
        throw new Error('not used in this test');
      },
      softDeleteById: async () => {
        throw new Error('not used in this test');
      },
      listActiveForPlanning: async () => []
    };

    const queuePublisher: DeliveryQueuePublisher = {
      publishOccurrence: async (occurrence) => {
        if (occurrence.id === 'b') {
          throw new Error('queue offline');
        }
      }
    };

    const planner = new PlannerService(userRepository, repository, queuePublisher, {
      lookbackHours: 48,
      batchSize: 100,
      userPageSize: 100
    });

    const summary = await planner.runOnce(new Date('2026-01-01T10:00:00.000Z'));

    expect(summary).toEqual({ claimed: 2, enqueued: 1, failed: 1 });
    expect(failedOccurrenceIds).toEqual(['b']);
  });
});
