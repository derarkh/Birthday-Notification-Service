import type { NotificationOccurrence } from '../../domain/notification.js';
import type { DeliveryQueueConsumer, DeliveryQueueMessage } from '../../app/worker/worker-service.js';

type SqsClient = {
  send(command: unknown): Promise<unknown>;
};

type SqsClientConstructor = new (config: {
  region: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}) => SqsClient;

type SendMessageCommandConstructor = new (input: {
  QueueUrl: string;
  MessageBody: string;
}) => unknown;

type ReceiveMessageCommandConstructor = new (input: {
  QueueUrl: string;
  MaxNumberOfMessages: number;
  WaitTimeSeconds: number;
}) => unknown;

type DeleteMessageCommandConstructor = new (input: {
  QueueUrl: string;
  ReceiptHandle: string;
}) => unknown;

interface SqsModule {
  SQSClient: SqsClientConstructor;
  SendMessageCommand: SendMessageCommandConstructor;
  ReceiveMessageCommand: ReceiveMessageCommandConstructor;
  DeleteMessageCommand: DeleteMessageCommandConstructor;
}

export interface SqsDeliveryQueueConfig {
  queueUrl: string;
  region: string;
  endpointUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface DeliveryQueuePayload {
  occurrenceId: string;
  userId: string;
  occasionType: string;
  localOccurrenceDate: string;
  dueAtUtc: string;
  idempotencyKey: string;
}

async function loadSqsModule(): Promise<SqsModule> {
  try {
    return (await import('@aws-sdk/client-sqs')) as SqsModule;
  } catch {
    throw new Error('Missing @aws-sdk/client-sqs dependency. Run: npm install @aws-sdk/client-sqs');
  }
}

export class SqsDeliveryQueuePublisher {
  private readonly config: SqsDeliveryQueueConfig;

  private sqsClientPromise: Promise<SqsClient> | null = null;

  public constructor(config: SqsDeliveryQueueConfig) {
    this.config = config;
  }

  public async publishOccurrence(occurrence: NotificationOccurrence): Promise<void> {
    const payload: DeliveryQueuePayload = {
      occurrenceId: occurrence.id,
      userId: occurrence.userId,
      occasionType: occurrence.occasionType,
      localOccurrenceDate: occurrence.localOccurrenceDate,
      dueAtUtc: occurrence.dueAtUtc.toISOString(),
      idempotencyKey: occurrence.idempotencyKey
    };

    const [client, sqsModule] = await Promise.all([this.getClient(), loadSqsModule()]);

    await client.send(
      new sqsModule.SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: JSON.stringify(payload)
      })
    );
  }

  private async getClient(): Promise<SqsClient> {
    if (!this.sqsClientPromise) {
      this.sqsClientPromise = (async () => {
        const sqsModule = await loadSqsModule();
        const useExplicitLocalCredentials = Boolean(this.config.endpointUrl);
        const clientConfig: {
          region: string;
          endpoint?: string;
          credentials?: {
            accessKeyId: string;
            secretAccessKey: string;
          };
        } = {
          region: this.config.region,
          ...(this.config.endpointUrl ? { endpoint: this.config.endpointUrl } : {}),
          ...(useExplicitLocalCredentials
            ? {
                credentials: {
                  accessKeyId: this.config.accessKeyId ?? 'test',
                  secretAccessKey: this.config.secretAccessKey ?? 'test'
                }
              }
            : {})
        };

        return new sqsModule.SQSClient(clientConfig);
      })();
    }

    return this.sqsClientPromise;
  }
}

export class SqsDeliveryQueueConsumer implements DeliveryQueueConsumer {
  private readonly config: SqsDeliveryQueueConfig;

  private readonly maxNumberOfMessages: number;

  private readonly waitTimeSeconds: number;

  private sqsClientPromise: Promise<SqsClient> | null = null;

  public constructor(
    config: SqsDeliveryQueueConfig,
    options?: { maxNumberOfMessages?: number; waitTimeSeconds?: number }
  ) {
    this.config = config;
    this.maxNumberOfMessages = options?.maxNumberOfMessages ?? 10;
    this.waitTimeSeconds = options?.waitTimeSeconds ?? 10;
  }

  public async receiveMessages(): Promise<DeliveryQueueMessage[]> {
    const [client, sqsModule] = await Promise.all([this.getClient(), loadSqsModule()]);
    const response = (await client.send(
      new sqsModule.ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: this.maxNumberOfMessages,
        WaitTimeSeconds: this.waitTimeSeconds
      })
    )) as {
      Messages?: Array<{ Body?: string; ReceiptHandle?: string }>;
    };

    const messages = response.Messages ?? [];
    return messages
      .filter((message) => Boolean(message.Body) && Boolean(message.ReceiptHandle))
      .map((message) => ({
        body: message.Body as string,
        receiptHandle: message.ReceiptHandle as string
      }));
  }

  public async acknowledgeMessage(receiptHandle: string): Promise<void> {
    const [client, sqsModule] = await Promise.all([this.getClient(), loadSqsModule()]);
    await client.send(
      new sqsModule.DeleteMessageCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: receiptHandle
      })
    );
  }

  private async getClient(): Promise<SqsClient> {
    if (!this.sqsClientPromise) {
      this.sqsClientPromise = (async () => {
        const sqsModule = await loadSqsModule();
        const useExplicitLocalCredentials = Boolean(this.config.endpointUrl);
        const clientConfig: {
          region: string;
          endpoint?: string;
          credentials?: {
            accessKeyId: string;
            secretAccessKey: string;
          };
        } = {
          region: this.config.region,
          ...(this.config.endpointUrl ? { endpoint: this.config.endpointUrl } : {}),
          ...(useExplicitLocalCredentials
            ? {
                credentials: {
                  accessKeyId: this.config.accessKeyId ?? 'test',
                  secretAccessKey: this.config.secretAccessKey ?? 'test'
                }
              }
            : {})
        };

        return new sqsModule.SQSClient(clientConfig);
      })();
    }

    return this.sqsClientPromise;
  }
}
