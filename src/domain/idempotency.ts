import type { OccasionType } from './notification.js';

export function buildOccurrenceIdempotencyKey(
  userId: string,
  occasionType: OccasionType,
  localOccurrenceDate: string
): string {
  return `${occasionType}:${userId}:${localOccurrenceDate}`;
}
