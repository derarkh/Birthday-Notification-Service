export type UserChangeEventType = 'created' | 'updated' | 'deleted';

export interface UserChangeEvent {
  id: string;
  userId: string;
  eventType: UserChangeEventType;
  createdAt: Date;
  claimedAt: Date | null;
  processedAt: Date | null;
  error: string | null;
}

export interface UserChangeEventRepository {
  claimPendingBatch(now: Date, limit: number): Promise<UserChangeEvent[]>;
  markProcessed(eventId: string, now: Date): Promise<void>;
  markFailed(eventId: string, errorMessage: string): Promise<void>;
}

