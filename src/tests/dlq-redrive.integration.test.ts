import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

const runIntegration = process.env.RUN_INTEGRATION === 'true';
const runAwsIntegration = process.env.RUN_AWS_INTEGRATION === 'true';

const testSuite = describe.runIf(runIntegration && runAwsIntegration);

testSuite('DLQ redrive integration', () => {
  it('provisions queue redrive attributes with a DLQ target', async () => {
    const region = process.env.AWS_REGION ?? 'ap-southeast-2';
    const endpointUrl = process.env.AWS_ENDPOINT_URL;

    if (!endpointUrl) {
      throw new Error('AWS_ENDPOINT_URL is required for DLQ integration test');
    }

    const sqsModule = (await import('@aws-sdk/client-sqs')) as {
      SQSClient: new (config: {
        region: string;
        endpoint: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
      }) => {
        send(command: unknown): Promise<{
          QueueUrl?: string;
          Attributes?: Record<string, string>;
        }>;
      };
      CreateQueueCommand: new (input: {
        QueueName: string;
        Attributes?: Record<string, string>;
      }) => unknown;
      GetQueueAttributesCommand: new (input: {
        QueueUrl: string;
        AttributeNames: string[];
      }) => unknown;
    };

    const client = new sqsModule.SQSClient({
      region,
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
      }
    });

    const suffix = randomUUID();
    const dlqName = `birthday-delivery-dlq-${suffix}`;
    const mainQueueName = `birthday-delivery-queue-${suffix}`;
    const maxReceiveCount = process.env.SQS_MAX_RECEIVE_COUNT ?? '5';
    const visibilityTimeout = process.env.SQS_VISIBILITY_TIMEOUT_SECONDS ?? '30';
    const messageRetention = process.env.SQS_MESSAGE_RETENTION_SECONDS ?? '1209600';

    const dlqCreated = await client.send(
      new sqsModule.CreateQueueCommand({
        QueueName: dlqName
      })
    );
    const dlqUrl = dlqCreated.QueueUrl;
    expect(dlqUrl).toBeTruthy();

    const dlqAttrs = await client.send(
      new sqsModule.GetQueueAttributesCommand({
        QueueUrl: dlqUrl as string,
        AttributeNames: ['QueueArn']
      })
    );
    const dlqArn = dlqAttrs.Attributes?.QueueArn;
    expect(dlqArn).toBeTruthy();

    const mainCreated = await client.send(
      new sqsModule.CreateQueueCommand({
        QueueName: mainQueueName,
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount
          }),
          VisibilityTimeout: visibilityTimeout,
          MessageRetentionPeriod: messageRetention
        }
      })
    );
    const mainQueueUrl = mainCreated.QueueUrl;
    expect(mainQueueUrl).toBeTruthy();

    const mainAttrs = await client.send(
      new sqsModule.GetQueueAttributesCommand({
        QueueUrl: mainQueueUrl as string,
        AttributeNames: ['RedrivePolicy', 'VisibilityTimeout', 'MessageRetentionPeriod']
      })
    );

    expect(mainAttrs.Attributes?.VisibilityTimeout).toBe(visibilityTimeout);
    expect(mainAttrs.Attributes?.MessageRetentionPeriod).toBe(messageRetention);

    const redrive = JSON.parse(mainAttrs.Attributes?.RedrivePolicy ?? '{}') as {
      deadLetterTargetArn?: string;
      maxReceiveCount?: string;
    };
    expect(redrive.deadLetterTargetArn).toBe(dlqArn);
    expect(redrive.maxReceiveCount).toBe(maxReceiveCount);
  });
});

