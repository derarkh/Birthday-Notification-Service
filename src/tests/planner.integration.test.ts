import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PlannerService, type DeliveryQueuePublisher } from '../app/planner/planner-service.js';
import { PostgresNotificationOccurrenceRepository } from '../infrastructure/db/notification-occurrence-repository.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PostgresUserRepository } from '../infrastructure/db/user-repository.js';

const dbUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/birthday_service';
const runIntegration = process.env.RUN_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration);

testSuite('planner integration', () => {
  const pool = createPool(dbUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE user_change_events, notification_occurrences, users CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enqueues due and missed occurrences once, ignores future and out-of-window items', async () => {
    const dueUser = await userRepository.create({
      firstName: 'Due',
      lastName: 'User',
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne'
    });
    const missedUser = await userRepository.create({
      firstName: 'Missed',
      lastName: 'User',
      birthday: '1985-12-14',
      timezone: 'Australia/Melbourne'
    });
    await userRepository.create({
      firstName: 'Future',
      lastName: 'User',
      birthday: '1985-12-20',
      timezone: 'Australia/Melbourne'
    });
    await userRepository.create({
      firstName: 'Out',
      lastName: 'Window',
      birthday: '1985-12-10',
      timezone: 'Australia/Melbourne'
    });

    const now = new Date('2026-12-15T15:00:00.000Z');
    const lookbackFrom = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const publishedIds: string[] = [];

    const queuePublisher: DeliveryQueuePublisher = {
      publishOccurrence: async (occurrence) => {
        publishedIds.push(occurrence.id);
      }
    };

    await occurrenceRepository.createOrGet({
      userId: dueUser.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-15',
      dueAtUtc: new Date('2026-12-14T22:00:00.000Z')
    });
    await occurrenceRepository.createOrGet({
      userId: missedUser.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-14',
      dueAtUtc: new Date('2026-12-13T22:00:00.000Z')
    });
    await occurrenceRepository.createOrGet({
      userId: dueUser.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-20',
      dueAtUtc: new Date('2026-12-19T22:00:00.000Z')
    });
    await occurrenceRepository.createOrGet({
      userId: missedUser.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-10',
      dueAtUtc: new Date(lookbackFrom.getTime() - 1000)
    });

    const planner = new PlannerService(occurrenceRepository, queuePublisher, {
      lookbackHours: 48,
      batchSize: 20
    });

    const firstRun = await planner.runOnce(now);
    expect(firstRun).toEqual({ claimed: 2, enqueued: 2, failed: 0 });

    const secondRun = await planner.runOnce(now);
    expect(secondRun).toEqual({ claimed: 0, enqueued: 0, failed: 0 });

    expect(publishedIds).toHaveLength(2);
    const dueOccurrence = await occurrenceRepository.findByLogicalKey(dueUser.id, 'birthday', '2026-12-15');
    const missedOccurrence = await occurrenceRepository.findByLogicalKey(missedUser.id, 'birthday', '2026-12-14');
    expect(dueOccurrence).not.toBeNull();
    expect(missedOccurrence).not.toBeNull();
    expect(new Set(publishedIds)).toEqual(new Set([dueOccurrence?.id, missedOccurrence?.id]));

    const statusRows = await pool.query(
      `
      SELECT local_occurrence_date::text AS local_occurrence_date, status
      FROM notification_occurrences
      ORDER BY local_occurrence_date ASC
      `
    );

    expect(statusRows.rows).toEqual([
      { local_occurrence_date: '2026-12-10', status: 'pending' },
      { local_occurrence_date: '2026-12-14', status: 'enqueued' },
      { local_occurrence_date: '2026-12-15', status: 'enqueued' },
      { local_occurrence_date: '2026-12-20', status: 'pending' }
    ]);
  });
});
