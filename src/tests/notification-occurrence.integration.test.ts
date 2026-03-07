import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildOccurrenceIdempotencyKey } from '../domain/idempotency.js';
import { PostgresNotificationOccurrenceRepository } from '../infrastructure/db/notification-occurrence-repository.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PostgresUserRepository } from '../infrastructure/db/user-repository.js';

const dbUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/birthday_service';
const runIntegration = process.env.RUN_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration);

testSuite('notification occurrence integration', () => {
  const pool = createPool(dbUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE notification_occurrences, users CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates one logical occurrence for duplicate createOrGet calls', async () => {
    const user = await userRepository.create({
      firstName: 'Derar',
      lastName: 'Alkhateeb',
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne'
    });

    const dueAtUtc = new Date('2026-12-14T22:00:00.000Z');

    const first = await occurrenceRepository.createOrGet({
      userId: user.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-15',
      dueAtUtc
    });

    const second = await occurrenceRepository.createOrGet({
      userId: user.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-15',
      dueAtUtc
    });

    expect(second.id).toBe(first.id);

    const count = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notification_occurrences
      WHERE user_id = $1
        AND occasion_type = 'birthday'
        AND local_occurrence_date = '2026-12-15'
      `,
      [user.id]
    );

    expect(count.rows[0]?.total).toBe(1);
  });

  it('stores deterministic idempotency key per logical send', async () => {
    const user = await userRepository.create({
      firstName: 'Derar',
      lastName: 'Alkhateeb',
      birthday: '1985-12-15',
      timezone: 'America/New_York'
    });

    const occurrence = await occurrenceRepository.createOrGet({
      userId: user.id,
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-15',
      dueAtUtc: new Date('2026-12-15T14:00:00.000Z')
    });

    expect(occurrence.idempotencyKey).toBe(
      buildOccurrenceIdempotencyKey(user.id, 'birthday', '2026-12-15')
    );

    const loaded = await occurrenceRepository.findByLogicalKey(user.id, 'birthday', '2026-12-15');
    expect(loaded?.id).toBe(occurrence.id);
  });
});
