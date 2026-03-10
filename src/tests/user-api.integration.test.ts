import { beforeEach, afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app/api/app.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PostgresUserRepository } from '../infrastructure/db/user-repository.js';

const dbUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/birthday_service';
const runIntegration = process.env.RUN_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration);

testSuite('user API integration', () => {
  const pool = createPool(dbUrl);
  const repository = new PostgresUserRepository(pool);
  const app = buildApp({ userRepository: repository });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE user_change_events, notification_occurrences, users CASCADE');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates a user and persists canonical timezone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Derar',
        lastName: 'Alkhateeb',
        birthday: '1985-12-15',
        timezone: 'Australia/Melbourne'
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.firstName).toBe('Derar');
    expect(body.lastName).toBe('Alkhateeb');
    expect(body.birthday).toBe('1985-12-15');
    expect(body.timezone).toBe('Australia/Melbourne');

    const result = await pool.query(
      'SELECT first_name, last_name, birthday::text, timezone, deleted_at FROM users WHERE id = $1',
      [body.id]
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toEqual({
      first_name: 'Derar',
      last_name: 'Alkhateeb',
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne',
      deleted_at: null
    });
  });

  it('rejects invalid timezone input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Derar',
        lastName: 'Alkhateeb',
        birthday: '1985-12-15',
        timezone: 'Mars/Phobos'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'timezone must be a valid IANA timezone' });
  });

  it('rejects malformed birthday input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Derar',
        lastName: 'Alkhateeb',
        birthday: '1985-02-30',
        timezone: 'Australia/Melbourne'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'birthday must be a valid YYYY-MM-DD date' });
  });

  it('soft deletes an existing user', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'A',
        lastName: 'B',
        birthday: '2000-01-01',
        timezone: 'America/New_York'
      }
    });

    const createdBody = created.json();
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/user',
      payload: { id: createdBody.id }
    });

    expect(deleted.statusCode).toBe(204);

    const result = await pool.query('SELECT deleted_at IS NOT NULL AS is_deleted FROM users WHERE id = $1', [
      createdBody.id
    ]);

    expect(result.rows[0]?.is_deleted).toBe(true);
  });

  it('returns 404 when deleting a non-existent user', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/user',
      payload: { id: '6f2d61f0-ef4f-4f58-b4e9-58d9f8220162' }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'user not found' });
  });

  it('updates user birthday/timezone with PATCH /user', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Patch',
        lastName: 'User',
        birthday: '2000-01-01',
        timezone: 'UTC'
      }
    });
    const createdBody = created.json() as { id: string };

    const updated = await app.inject({
      method: 'PATCH',
      url: '/user',
      payload: {
        id: createdBody.id,
        birthday: '2000-02-02',
        timezone: 'Australia/Melbourne'
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: createdBody.id,
      firstName: 'Patch',
      lastName: 'User',
      birthday: '2000-02-02',
      timezone: 'Australia/Melbourne'
    });
  });

  it('rejects PATCH /user when no updatable fields are provided', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/user',
      payload: {
        id: '6f2d61f0-ef4f-4f58-b4e9-58d9f8220162'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'at least one field must be provided for update' });
  });

  it('emits user change events for create, update, and delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/user',
      payload: {
        firstName: 'Event',
        lastName: 'User',
        birthday: '2000-01-01',
        timezone: 'UTC'
      }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { id: string };

    const updated = await app.inject({
      method: 'PATCH',
      url: '/user',
      payload: {
        id: createdBody.id,
        firstName: 'EventUpdated'
      }
    });
    expect(updated.statusCode).toBe(200);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/user',
      payload: { id: createdBody.id }
    });
    expect(deleted.statusCode).toBe(204);

    const result = await pool.query(
      `
      SELECT event_type
      FROM user_change_events
      WHERE user_id = $1
      ORDER BY created_at ASC
      `,
      [createdBody.id]
    );

    expect(result.rows).toEqual([
      { event_type: 'created' },
      { event_type: 'updated' },
      { event_type: 'deleted' }
    ]);
  });
});
