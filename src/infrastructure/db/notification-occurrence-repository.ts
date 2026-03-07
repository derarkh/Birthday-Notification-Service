import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { buildOccurrenceIdempotencyKey } from '../../domain/idempotency.js';
import type {
  ClaimedDeliveryOccurrence,
  ClaimDueOccurrencesInput,
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

interface DeliveryClaimRow extends NotificationOccurrenceRow {
  first_name: string;
  last_name: string;
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

  public async claimDueForEnqueue(input: ClaimDueOccurrencesInput): Promise<NotificationOccurrence[]> {
    const lookbackFrom = new Date(input.now.getTime() - input.lookbackHours * 60 * 60 * 1000);
    const normalizedBatchSize = Math.max(1, input.batchSize);

    const result = await this.pool.query<NotificationOccurrenceRow>(
      `
      WITH candidates AS (
        SELECT n.id
        FROM notification_occurrences n
        INNER JOIN users u
          ON u.id = n.user_id
        WHERE n.status IN ('pending', 'failed')
          AND n.due_at_utc <= $1
          AND n.due_at_utc >= $2
          AND u.deleted_at IS NULL
        ORDER BY n.due_at_utc ASC, n.id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $3
      )
      UPDATE notification_occurrences n
      SET status = 'enqueued',
          enqueued_at = $1,
          updated_at = $1,
          last_error = NULL
      FROM candidates
      WHERE n.id = candidates.id
      RETURNING
        n.id,
        n.user_id,
        n.occasion_type,
        n.local_occurrence_date::text AS local_occurrence_date,
        n.due_at_utc,
        n.status,
        n.idempotency_key,
        n.enqueued_at,
        n.sent_at,
        n.last_error,
        n.created_at,
        n.updated_at
      `,
      [input.now, lookbackFrom, normalizedBatchSize]
    );

    return result.rows.map(mapRow);
  }

  public async claimForDelivery(
    occurrenceId: string,
    now: Date
  ): Promise<ClaimedDeliveryOccurrence | null> {
    const result = await this.pool.query<DeliveryClaimRow>(
      `
      UPDATE notification_occurrences n
      SET status = 'processing',
          updated_at = $2
      FROM users u
      WHERE n.id = $1
        AND n.user_id = u.id
        AND u.deleted_at IS NULL
        AND n.status = 'enqueued'
        AND n.sent_at IS NULL
      RETURNING
        n.id,
        n.user_id,
        n.occasion_type,
        n.local_occurrence_date::text AS local_occurrence_date,
        n.due_at_utc,
        n.status,
        n.idempotency_key,
        n.enqueued_at,
        n.sent_at,
        n.last_error,
        n.created_at,
        n.updated_at,
        u.first_name,
        u.last_name
      `,
      [occurrenceId, now]
    );

    const row = result.rows[0] ?? null;
    if (!row) {
      return null;
    }

    return {
      occurrence: mapRow(row),
      firstName: row.first_name,
      lastName: row.last_name
    };
  }

  public async markSent(occurrenceId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE notification_occurrences
      SET status = 'sent',
          sent_at = $2,
          updated_at = $2,
          last_error = NULL
      WHERE id = $1
        AND status = 'processing'
        AND sent_at IS NULL
      `,
      [occurrenceId, now]
    );

    return result.rowCount > 0;
  }

  public async markDeliveryFailed(occurrenceId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE notification_occurrences
      SET status = 'failed',
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1
        AND status = 'processing'
      `,
      [occurrenceId, errorMessage.slice(0, 2000)]
    );
  }

  public async markEnqueueFailed(occurrenceId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE notification_occurrences
      SET status = 'failed',
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1
      `,
      [occurrenceId, errorMessage.slice(0, 2000)]
    );
  }
}
