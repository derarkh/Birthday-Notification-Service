import { DateTime } from 'luxon';

import type { NotificationOccurrence, NotificationOccurrenceRepository } from '../../domain/notification.js';
import type { UserRepository } from '../../domain/user.js';
import { calculateBirthdayDueAtUtc } from '../../domain/scheduling/birthday-scheduling.js';
import type { Logger } from '../../infrastructure/logging/index.js';

export interface DeliveryQueuePublisher {
  publishOccurrence(occurrence: NotificationOccurrence): Promise<void>;
}

export interface PlannerRunSummary {
  claimed: number;
  enqueued: number;
  failed: number;
}

interface PlannerServiceOptions {
  lookbackHours: number;
  batchSize: number;
  userPageSize: number;
}

export class PlannerService {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly occurrenceRepository: NotificationOccurrenceRepository,
    private readonly queuePublisher: DeliveryQueuePublisher,
    private readonly options: PlannerServiceOptions,
    private readonly logger?: Logger
  ) {}

  public async runOnce(now: Date = new Date()): Promise<PlannerRunSummary> {
    await this.generateOccurrencesFromUsers(now);

    const claimed = await this.occurrenceRepository.claimDueForEnqueue({
      now,
      lookbackHours: this.options.lookbackHours,
      batchSize: this.options.batchSize
    });

    let enqueued = 0;
    let failed = 0;

    for (const occurrence of claimed) {
      try {
        await this.queuePublisher.publishOccurrence(occurrence);
        enqueued += 1;
        this.logger?.info(
          {
            event: 'occurrence_enqueued',
            occurrenceId: occurrence.id,
            userId: occurrence.userId,
            idempotencyKey: occurrence.idempotencyKey,
            dueAtUtc: occurrence.dueAtUtc.toISOString(),
            status: 'enqueued'
          },
          'Occurrence enqueued'
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown enqueue error';
        await this.occurrenceRepository.markEnqueueFailed(occurrence.id, message);
        this.logger?.error(
          {
            event: 'occurrence_enqueue_failed',
            occurrenceId: occurrence.id,
            userId: occurrence.userId,
            idempotencyKey: occurrence.idempotencyKey,
            status: 'failed',
            error: message
          },
          'Failed to enqueue occurrence'
        );
      }
    }

    return {
      claimed: claimed.length,
      enqueued,
      failed
    };
  }

  private async generateOccurrencesFromUsers(now: Date): Promise<void> {
    const lookbackFrom = new Date(now.getTime() - this.options.lookbackHours * 60 * 60 * 1000);
    let cursor: string | null = null;

    while (true) {
      const users = await this.userRepository.listActiveForPlanning({
        afterId: cursor,
        limit: this.options.userPageSize
      });

      if (users.length === 0) {
        return;
      }

      for (const user of users) {
        const localLookbackYear = DateTime.fromJSDate(lookbackFrom, { zone: user.timezone }).year;
        const localNowYear = DateTime.fromJSDate(now, { zone: user.timezone }).year;
        const candidateYears = new Set([localLookbackYear, localNowYear]);

        for (const year of candidateYears) {
          const dueAtUtc = calculateBirthdayDueAtUtc({
            birthday: user.birthday,
            timezone: user.timezone,
            occurrenceYear: year
          });

          if (dueAtUtc < lookbackFrom || dueAtUtc > now) {
            continue;
          }

          const localOccurrenceDate = DateTime.fromJSDate(dueAtUtc, { zone: user.timezone }).toFormat(
            'yyyy-MM-dd'
          );

          await this.occurrenceRepository.createOrGet({
            userId: user.id,
            occasionType: 'birthday',
            localOccurrenceDate,
            dueAtUtc
          });
          this.logger?.debug(
            {
              event: 'occurrence_upserted',
              userId: user.id,
              localOccurrenceDate,
              dueAtUtc: dueAtUtc.toISOString()
            },
            'Occurrence upserted during generation'
          );
        }
      }

      cursor = users[users.length - 1]?.id ?? null;
    }
  }
}
