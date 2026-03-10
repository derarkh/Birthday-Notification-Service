import { DateTime } from 'luxon';

import type { NotificationOccurrenceRepository } from '../../domain/notification.js';
import type { UserChangeEventRepository } from '../../domain/user-change-event.js';
import type { UserRepository } from '../../domain/user.js';
import { calculateBirthdayDueAtUtc } from '../../domain/scheduling/birthday-scheduling.js';
import type { Logger } from '../../infrastructure/logging/index.js';

export interface ProjectorRunSummary {
  claimed: number;
  processed: number;
  failed: number;
}

interface ProjectorServiceOptions {
  lookbackHours: number;
  batchSize: number;
}

export class ProjectorService {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly occurrenceRepository: NotificationOccurrenceRepository,
    private readonly userChangeEventRepository: UserChangeEventRepository,
    private readonly options: ProjectorServiceOptions,
    private readonly logger?: Logger
  ) {}

  public async runOnce(now: Date = new Date()): Promise<ProjectorRunSummary> {
    const events = await this.userChangeEventRepository.claimPendingBatch(now, this.options.batchSize);
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const user = await this.userRepository.findById(event.userId);
        if (!user || user.deletedAt) {
          await this.userChangeEventRepository.markProcessed(event.id, now);
          processed += 1;
          this.logger?.info(
            {
              event: 'user_change_event_processed_deleted',
              userId: event.userId,
              eventType: event.eventType
            },
            'Processed user event for deleted/missing user'
          );
          continue;
        }

        const lookbackFrom = new Date(now.getTime() - this.options.lookbackHours * 60 * 60 * 1000);
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
        }

        await this.userChangeEventRepository.markProcessed(event.id, now);
        processed += 1;
        this.logger?.info(
          {
            event: 'user_change_event_processed',
            userId: event.userId,
            eventType: event.eventType
          },
          'Processed user change event'
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown projector error';
        await this.userChangeEventRepository.markFailed(event.id, message);
        this.logger?.error(
          {
            event: 'user_change_event_failed',
            userId: event.userId,
            eventType: event.eventType,
            error: message
          },
          'Failed to process user change event'
        );
      }
    }

    return {
      claimed: events.length,
      processed,
      failed
    };
  }
}

