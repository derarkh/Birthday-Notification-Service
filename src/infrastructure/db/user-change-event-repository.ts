import type { Pool } from 'pg';

import type {
  UserChangeEvent,
  UserChangeEventRepository,
  UserChangeEventType
} from '../../domain/user-change-event.js';

interface UserChangeEventRow {
  id: string;
  user_id: string;
  event_type: UserChangeEventType;
  created_at: Date;
  claimed_at: Date | null;
  processed_at: Date | null;
  error: string | null;
}

function mapRow(row: UserChangeEventRow): UserChangeEvent {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    processedAt: row.processed_at,
    error: row.error
  };
}

export class PostgresUserChangeEventRepository implements UserChangeEventRepository {
  public constructor(private readonly pool: Pool) {}

  public async claimPendingBatch(now: Date, limit: number): Promise<UserChangeEvent[]> {
    const normalizedLimit = Math.max(1, limit);
    const result = await this.pool.query<UserChangeEventRow>(
      `
      WITH candidates AS (
        SELECT id
        FROM user_change_events
        WHERE processed_at IS NULL
          AND claimed_at IS NULL
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE user_change_events e
      SET claimed_at = $1
      FROM candidates
      WHERE e.id = candidates.id
      RETURNING
        e.id,
        e.user_id,
        e.event_type,
        e.created_at,
        e.claimed_at,
        e.processed_at,
        e.error
      `,
      [now, normalizedLimit]
    );

    return result.rows.map(mapRow);
  }

  public async markProcessed(eventId: string, now: Date): Promise<void> {
    await this.pool.query(
      `
      UPDATE user_change_events
      SET processed_at = $2,
          claimed_at = NULL,
          error = NULL
      WHERE id = $1
      `,
      [eventId, now]
    );
  }

  public async markFailed(eventId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE user_change_events
      SET claimed_at = NULL,
          error = $2
      WHERE id = $1
      `,
      [eventId, errorMessage.slice(0, 2000)]
    );
  }
}

