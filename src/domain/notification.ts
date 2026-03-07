export type OccasionType = 'birthday';

export type NotificationOccurrenceStatus = 'pending' | 'enqueued' | 'sent' | 'failed';

export interface NotificationOccurrence {
  id: string;
  userId: string;
  occasionType: OccasionType;
  localOccurrenceDate: string;
  dueAtUtc: Date;
  status: NotificationOccurrenceStatus;
  idempotencyKey: string;
  enqueuedAt: Date | null;
  sentAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrGetOccurrenceInput {
  userId: string;
  occasionType: OccasionType;
  localOccurrenceDate: string;
  dueAtUtc: Date;
}

export interface NotificationOccurrenceRepository {
  createOrGet(input: CreateOrGetOccurrenceInput): Promise<NotificationOccurrence>;
  findByLogicalKey(
    userId: string,
    occasionType: OccasionType,
    localOccurrenceDate: string
  ): Promise<NotificationOccurrence | null>;
}
