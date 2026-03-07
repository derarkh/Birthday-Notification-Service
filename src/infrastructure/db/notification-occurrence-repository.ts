import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { buildOccurrenceIdempotencyKey } from '../../domain/idempotency.js';
import type {
  CreateOrGetOccurrenceInput,
  NotificationOccurrence,
  NotificationOccurrenceRepository,
  OccasionType
} from '../../domain/notification.js';

interface NotificationOccurrenceRow {
  id: string;
  user_id: string;
  occasion_type: OccasionType;
  local_occurrence_date: string;
  due_at_utc: Date;
  status: NotificationOccurrence['status'];
  idempotency_key: string;
  enqueued_at: Date | null;
  sent_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: NotificationOccurrenceRow): NotificationOccurrence {
  return {
    id: row.id,
    userId: row.user_id,
    occasionType: row.occasion_type,
    localOccurrenceDate: row.local_occurrence_date,
    dueAtUtc: row.due_at_utc,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    enqueuedAt: row.enqueued_at,
    sentAt: row.sent_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class PostgresNotificationOccurrenceRepository implements NotificationOccurrenceRepository {
  public constructor(private readonly pool: Pool) {}

  public async createOrGet(input: CreateOrGetOccurrenceInput): Promise<NotificationOccurrence> {
    const id = randomUUID();
    const idempotencyKey = buildOccurrenceIdempotencyKey(
      input.userId,
      input.occasionType,
      input.localOccurrenceDate
    );

    const result = await this.pool.query<NotificationOccurrenceRow>(
      `
      INSERT INTO notification_occurrences (
        id,
        user_id,
        occasion_type,
        local_occurrence_date,
        due_at_utc,
        status,
        idempotency_key
      )
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      ON CONFLICT (user_id, occasion_type, local_occurrence_date)
      DO UPDATE SET updated_at = NOW()
      RETURNING
        id,
        user_id,
        occasion_type,
        local_occurrence_date::text AS local_occurrence_date,
        due_at_utc,
        status,
        idempotency_key,
        enqueued_at,
        sent_at,
        last_error,
        created_at,
        updated_at
      `,
      [
        id,
        input.userId,
        input.occasionType,
        input.localOccurrenceDate,
        input.dueAtUtc,
        idempotencyKey
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create or fetch notification occurrence');
    }

    return mapRow(row);
  }

  public async findByLogicalKey(
    userId: string,
    occasionType: OccasionType,
    localOccurrenceDate: string
  ): Promise<NotificationOccurrence | null> {
    const result = await this.pool.query<NotificationOccurrenceRow>(
      `
      SELECT
        id,
        user_id,
        occasion_type,
        local_occurrence_date::text AS local_occurrence_date,
        due_at_utc,
        status,
        idempotency_key,
        enqueued_at,
        sent_at,
        last_error,
        created_at,
        updated_at
      FROM notification_occurrences
      WHERE user_id = $1
        AND occasion_type = $2
        AND local_occurrence_date = $3
      `,
      [userId, occasionType, localOccurrenceDate]
    );

    const row = result.rows[0] ?? null;
    return row ? mapRow(row) : null;
  }
}
