import 'dotenv/config';

import { WorkerService } from './worker-service.js';
import { loadConfig } from '../../infrastructure/config/env.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PostgresNotificationOccurrenceRepository } from '../../infrastructure/db/notification-occurrence-repository.js';
import { SqsDeliveryQueueConsumer } from '../../infrastructure/aws/sqs-delivery-queue.js';
import { HttpOutboundBirthdayClient } from '../../infrastructure/http/outbound-birthday-client.js';

export async function startWorker(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);
  const queueConsumer = new SqsDeliveryQueueConsumer(
    {
      queueUrl: config.sqsBirthdayQueueUrl,
      region: config.awsRegion,
      ...(config.awsEndpointUrl ? { endpointUrl: config.awsEndpointUrl } : {}),
      ...(config.awsAccessKeyId ? { accessKeyId: config.awsAccessKeyId } : {}),
      ...(config.awsSecretAccessKey ? { secretAccessKey: config.awsSecretAccessKey } : {})
    },
    {
      waitTimeSeconds: config.workerSqsWaitTimeSeconds,
      maxNumberOfMessages: config.workerSqsMaxMessages
    }
  );
  const outboundClient = new HttpOutboundBirthdayClient({
    baseUrl: config.outboundBaseUrl
  });
  const workerService = new WorkerService(queueConsumer, occurrenceRepository, outboundClient);

  const runOnce = async (): Promise<void> => {
    try {
      const summary = await workerService.runOnce();
      console.log(
        `[worker] received=${summary.received} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`
      );
    } catch (error) {
      console.error('[worker] run failed', error);
    }
  };

  await runOnce();
  const intervalMs = config.workerPollIntervalSeconds * 1000;
  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startWorker();
}
