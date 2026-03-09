import { formatBirthdayMessage } from '../../domain/message.js';
import type { ClaimedDeliveryOccurrence } from '../../domain/notification.js';
import type { Logger } from '../../infrastructure/logging/index.js';

export interface DeliveryQueueMessage {
  receiptHandle: string;
  body: string;
}

export interface DeliveryQueueConsumer {
  receiveMessages(): Promise<DeliveryQueueMessage[]>;
  acknowledgeMessage(receiptHandle: string): Promise<void>;
}

export interface OutboundBirthdayClient {
  sendBirthdayMessage(message: string): Promise<void>;
}

export interface WorkerOccurrenceRepository {
  claimForDelivery(occurrenceId: string, now: Date): Promise<ClaimedDeliveryOccurrence | null>;
  markSent(occurrenceId: string, now: Date): Promise<boolean>;
  markDeliveryFailed(occurrenceId: string, errorMessage: string): Promise<void>;
}

export interface WorkerRunSummary {
  received: number;
  sent: number;
  skipped: number;
  failed: number;
}

function parseOccurrenceId(body: string): string | null {
  try {
    const payload = JSON.parse(body) as { occurrenceId?: unknown };
    if (typeof payload.occurrenceId !== 'string' || payload.occurrenceId.length === 0) {
      return null;
    }
    return payload.occurrenceId;
  } catch {
    return null;
  }
}

export class WorkerService {
  public constructor(
    private readonly queueConsumer: DeliveryQueueConsumer,
    private readonly occurrenceRepository: WorkerOccurrenceRepository,
    private readonly outboundClient: OutboundBirthdayClient,
    private readonly logger?: Logger
  ) {}

  public async runOnce(now: Date = new Date()): Promise<WorkerRunSummary> {
    const messages = await this.queueConsumer.receiveMessages();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const message of messages) {
      let claimedOccurrence: ClaimedDeliveryOccurrence | null = null;

      try {
        const occurrenceId = parseOccurrenceId(message.body);
        if (!occurrenceId) {
          skipped += 1;
          this.logger?.warn(
            {
              event: 'worker_skip_invalid_payload',
              status: 'skipped',
              receiptHandle: message.receiptHandle
            },
            'Skipping message with invalid payload'
          );
          continue;
        }

        claimedOccurrence = await this.occurrenceRepository.claimForDelivery(occurrenceId, now);
        if (!claimedOccurrence) {
          skipped += 1;
          this.logger?.info(
            {
              event: 'worker_skip_not_claimed',
              occurrenceId,
              status: 'skipped',
              receiptHandle: message.receiptHandle
            },
            'Skipping message because occurrence was not claimable'
          );
          continue;
        }

        const fullName = `${claimedOccurrence.firstName} ${claimedOccurrence.lastName}`;
        const outboundMessage = formatBirthdayMessage(fullName);

        await this.outboundClient.sendBirthdayMessage(outboundMessage);

        const markedSent = await this.occurrenceRepository.markSent(claimedOccurrence.occurrence.id, now);
        if (!markedSent) {
          throw new Error('Failed to mark occurrence as sent');
        }

        sent += 1;
        this.logger?.info(
          {
            event: 'delivery_sent',
            occurrenceId: claimedOccurrence.occurrence.id,
            userId: claimedOccurrence.occurrence.userId,
            idempotencyKey: claimedOccurrence.occurrence.idempotencyKey,
            status: 'sent',
            sentAt: now.toISOString()
          },
          'Delivery sent successfully'
        );
      } catch (error) {
        failed += 1;

        if (claimedOccurrence) {
          const messageText = error instanceof Error ? error.message : 'Unknown worker error';
          await this.occurrenceRepository.markDeliveryFailed(
            claimedOccurrence.occurrence.id,
            messageText
          );
          this.logger?.error(
            {
              event: 'delivery_failed',
              occurrenceId: claimedOccurrence.occurrence.id,
              userId: claimedOccurrence.occurrence.userId,
              idempotencyKey: claimedOccurrence.occurrence.idempotencyKey,
              status: 'failed',
              error: messageText
            },
            'Delivery failed'
          );
        } else {
          this.logger?.error(
            {
              event: 'worker_failed_before_claim',
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown worker error',
              receiptHandle: message.receiptHandle
            },
            'Worker failed before claiming occurrence'
          );
        }
      } finally {
        await this.queueConsumer.acknowledgeMessage(message.receiptHandle);
        this.logger?.debug(
          {
            event: 'worker_acknowledged_message',
            receiptHandle: message.receiptHandle
          },
          'Acknowledged queue message'
        );
      }
    }

    return {
      received: messages.length,
      sent,
      skipped,
      failed
    };
  }
}
