export type OccasionType = 'birthday';

export type NotificationOccurrenceStatus = 'pending' | 'enqueued' | 'processing' | 'sent' | 'failed';

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

export interface ClaimDueOccurrencesInput {
  now: Date;
  lookbackHours: number;
  batchSize: number;
}

export interface ClaimedDeliveryOccurrence {
  occurrence: NotificationOccurrence;
  firstName: string;
  lastName: string;
}

export interface NotificationOccurrenceRepository {
  createOrGet(input: CreateOrGetOccurrenceInput): Promise<NotificationOccurrence>;
  findByLogicalKey(
    userId: string,
    occasionType: OccasionType,
    localOccurrenceDate: string
  ): Promise<NotificationOccurrence | null>;
  claimDueForEnqueue(input: ClaimDueOccurrencesInput): Promise<NotificationOccurrence[]>;
  claimForDelivery(occurrenceId: string, now: Date): Promise<ClaimedDeliveryOccurrence | null>;
  markSent(occurrenceId: string, now: Date): Promise<boolean>;
  markDeliveryFailed(occurrenceId: string, errorMessage: string): Promise<void>;
  markEnqueueFailed(occurrenceId: string, errorMessage: string): Promise<void>;
}
