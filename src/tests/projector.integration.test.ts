import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ProjectorService } from '../app/projector/projector-service.js';
import { PostgresNotificationOccurrenceRepository } from '../infrastructure/db/notification-occurrence-repository.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PostgresUserChangeEventRepository } from '../infrastructure/db/user-change-event-repository.js';
import { PostgresUserRepository } from '../infrastructure/db/user-repository.js';

const dbUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/birthday_service';
const runIntegration = process.env.RUN_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration);

testSuite('projector integration', () => {
  const pool = createPool(dbUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);
  const userChangeEventRepository = new PostgresUserChangeEventRepository(pool);

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE user_change_events, notification_occurrences, users CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('processes created events and upserts due occurrences', async () => {
    const createdUser = await userRepository.create({
      firstName: 'Projector',
      lastName: 'Create',
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne'
    });

    const projector = new ProjectorService(
      userRepository,
      occurrenceRepository,
      userChangeEventRepository,
      { lookbackHours: 48, batchSize: 50 }
    );

    const now = new Date('2026-12-15T01:00:00.000Z');
    const summary = await projector.runOnce(now);
    expect(summary.claimed).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);

    const occurrence = await occurrenceRepository.findByLogicalKey(
      createdUser.id,
      'birthday',
      '2026-12-15'
    );
    expect(occurrence).not.toBeNull();
  });

  it('processes deleted events without creating occurrences', async () => {
    const createdUser = await userRepository.create({
      firstName: 'Projector',
      lastName: 'Delete',
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne'
    });
    await userRepository.softDeleteById(createdUser.id);

    const projector = new ProjectorService(
      userRepository,
      occurrenceRepository,
      userChangeEventRepository,
      { lookbackHours: 48, batchSize: 50 }
    );

    const summary = await projector.runOnce(new Date('2026-12-15T01:00:00.000Z'));
    expect(summary.claimed).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);

    const count = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notification_occurrences
      WHERE user_id = $1
      `,
      [createdUser.id]
    );
    expect(count.rows[0]?.total).toBe(0);
  });
});

