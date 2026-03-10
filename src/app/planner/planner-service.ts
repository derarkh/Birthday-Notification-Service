import type { NotificationOccurrence, NotificationOccurrenceRepository } from '../../domain/notification.js';
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
}

export class PlannerService {
  public constructor(
    private readonly occurrenceRepository: NotificationOccurrenceRepository,
    private readonly queuePublisher: DeliveryQueuePublisher,
    private readonly options: PlannerServiceOptions,
    private readonly logger?: Logger
  ) {}

  public async runOnce(now: Date = new Date()): Promise<PlannerRunSummary> {
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
}
