import { describe, expect, it } from 'vitest';

import { ProjectorService } from '../app/projector/projector-service.js';
import type { NotificationOccurrenceRepository } from '../domain/notification.js';
import type { UserChangeEventRepository } from '../domain/user-change-event.js';
import type { UserRepository } from '../domain/user.js';

describe('projector service', () => {
  it('projects across Dec/Jan boundary using lookback year + now year', async () => {
    const created: Array<{ localOccurrenceDate: string; dueAtUtc: Date }> = [];
    const markedProcessed: string[] = [];

    const userRepository: UserRepository = {
      create: async () => {
        throw new Error('not used');
      },
      updateById: async () => null,
      findById: async () => ({
        id: 'u-1',
        firstName: 'A',
        lastName: 'B',
        birthday: '1985-12-31',
        timezone: 'UTC',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null
      }),
      softDeleteById: async () => false,
      listActiveForPlanning: async () => []
    };

    const occurrenceRepository: NotificationOccurrenceRepository = {
      createOrGet: async (input) => {
        created.push({ localOccurrenceDate: input.localOccurrenceDate, dueAtUtc: input.dueAtUtc });
        return {
          id: 'occ-1',
          userId: input.userId,
          occasionType: input.occasionType,
          localOccurrenceDate: input.localOccurrenceDate,
          dueAtUtc: input.dueAtUtc,
          status: 'pending',
          idempotencyKey: 'idempotency',
          enqueuedAt: null,
          sentAt: null,
          lastError: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        };
      },
      findByLogicalKey: async () => null,
      claimDueForEnqueue: async () => [],
      claimForDelivery: async () => null,
      markSent: async () => false,
      markDeliveryFailed: async () => {},
      markEnqueueFailed: async () => {}
    };

    const eventRepository: UserChangeEventRepository = {
      claimPendingBatch: async () => [
        {
          id: 'evt-1',
          userId: 'u-1',
          eventType: 'updated',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          claimedAt: null,
          processedAt: null,
          error: null
        }
      ],
      markProcessed: async (eventId) => {
        markedProcessed.push(eventId);
      },
      markFailed: async () => {}
    };

    const projector = new ProjectorService(userRepository, occurrenceRepository, eventRepository, {
      lookbackHours: 48,
      batchSize: 100
    });

    const summary = await projector.runOnce(new Date('2026-01-01T01:00:00.000Z'));

    expect(summary).toEqual({ claimed: 1, processed: 1, failed: 0 });
    expect(markedProcessed).toEqual(['evt-1']);
    expect(created).toHaveLength(1);
    expect(created[0]?.localOccurrenceDate).toBe('2025-12-31');
  });

  it('marks deleted-user events as processed without creating occurrences', async () => {
    let createdCount = 0;
    const markedProcessed: string[] = [];

    const userRepository: UserRepository = {
      create: async () => {
        throw new Error('not used');
      },
      updateById: async () => null,
      findById: async () => ({
        id: 'u-1',
        firstName: 'A',
        lastName: 'B',
        birthday: '1985-12-31',
        timezone: 'UTC',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: new Date('2026-01-01T00:00:00.000Z')
      }),
      softDeleteById: async () => false,
      listActiveForPlanning: async () => []
    };

    const occurrenceRepository: NotificationOccurrenceRepository = {
      createOrGet: async () => {
        createdCount += 1;
        throw new Error('should not be called');
      },
      findByLogicalKey: async () => null,
      claimDueForEnqueue: async () => [],
      claimForDelivery: async () => null,
      markSent: async () => false,
      markDeliveryFailed: async () => {},
      markEnqueueFailed: async () => {}
    };

    const eventRepository: UserChangeEventRepository = {
      claimPendingBatch: async () => [
        {
          id: 'evt-1',
          userId: 'u-1',
          eventType: 'deleted',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          claimedAt: null,
          processedAt: null,
          error: null
        }
      ],
      markProcessed: async (eventId) => {
        markedProcessed.push(eventId);
      },
      markFailed: async () => {}
    };

    const projector = new ProjectorService(userRepository, occurrenceRepository, eventRepository, {
      lookbackHours: 48,
      batchSize: 100
    });

    const summary = await projector.runOnce(new Date('2026-01-01T01:00:00.000Z'));

    expect(summary).toEqual({ claimed: 1, processed: 1, failed: 0 });
    expect(markedProcessed).toEqual(['evt-1']);
    expect(createdCount).toBe(0);
  });
});

