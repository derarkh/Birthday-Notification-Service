import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { NotificationOccurrence } from '../domain/notification.js';
import { SqsDeliveryQueuePublisher } from '../infrastructure/aws/sqs-delivery-queue.js';

const runIntegration = process.env.RUN_INTEGRATION === 'true';
const runAwsIntegration = process.env.RUN_AWS_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration && runAwsIntegration);

testSuite('SQS delivery queue integration', () => {
  it('publishes occurrence payload to LocalStack SQS', async () => {
    const queueUrl = process.env.SQS_BIRTHDAY_QUEUE_URL;
    const region = process.env.AWS_REGION ?? 'ap-southeast-2';
    const endpointUrl = process.env.AWS_ENDPOINT_URL;

    if (!queueUrl || !endpointUrl) {
      throw new Error('SQS_BIRTHDAY_QUEUE_URL and AWS_ENDPOINT_URL are required for this test');
    }

    const publisher = new SqsDeliveryQueuePublisher({
      queueUrl,
      region,
      endpointUrl,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
    });

    const marker = randomUUID();
    const occurrence: NotificationOccurrence = {
      id: randomUUID(),
      userId: randomUUID(),
      occasionType: 'birthday',
      localOccurrenceDate: '2026-12-15',
      dueAtUtc: new Date('2026-12-15T14:00:00.000Z'),
      status: 'enqueued',
      idempotencyKey: `birthday:${marker}:2026-12-15`,
      enqueuedAt: new Date(),
      sentAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await publisher.publishOccurrence(occurrence);

    const sqsModule = (await import('@aws-sdk/client-sqs')) as {
      SQSClient: new (config: {
        region: string;
        endpoint: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
      }) => {
        send(command: unknown): Promise<{
          Messages?: Array<{ Body?: string; ReceiptHandle?: string }>;
        }>;
      };
      ReceiveMessageCommand: new (input: {
        QueueUrl: string;
        MaxNumberOfMessages: number;
        WaitTimeSeconds: number;
      }) => unknown;
      DeleteMessageCommand: new (input: { QueueUrl: string; ReceiptHandle: string }) => unknown;
    };

    const client = new sqsModule.SQSClient({
      region,
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
      }
    });

    let foundMessageBody: string | null = null;

    for (let i = 0; i < 5; i += 1) {
      const response = await client.send(
        new sqsModule.ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1
        })
      );

      const messages = response.Messages ?? [];

      for (const message of messages) {
        if (message.Body && message.Body.includes(marker)) {
          foundMessageBody = message.Body;
        }

        if (message.ReceiptHandle) {
          await client.send(
            new sqsModule.DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle
            })
          );
        }
      }

      if (foundMessageBody) {
        break;
      }
    }

    expect(foundMessageBody).not.toBeNull();
  });
});
