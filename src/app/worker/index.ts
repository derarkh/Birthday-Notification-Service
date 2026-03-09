import 'dotenv/config';

import { WorkerService } from './worker-service.js';
import { loadConfig } from '../../infrastructure/config/env.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PostgresNotificationOccurrenceRepository } from '../../infrastructure/db/notification-occurrence-repository.js';
import { SqsDeliveryQueueConsumer } from '../../infrastructure/aws/sqs-delivery-queue.js';
import { HttpOutboundBirthdayClient } from '../../infrastructure/http/outbound-birthday-client.js';
import { createLogger } from '../../infrastructure/logging/index.js';

export async function startWorker(): Promise<void> {
  const logger = createLogger('worker');
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
  const workerServiceWithLogger = new WorkerService(
    queueConsumer,
    occurrenceRepository,
    outboundClient,
    logger.child({ component: 'worker-service' })
  );

  const runOnce = async (): Promise<void> => {
    try {
      const summary = await workerServiceWithLogger.runOnce();
      logger.info({ event: 'worker_run_summary', ...summary }, 'Worker run completed');
    } catch (error) {
      logger.error(
        { event: 'worker_run_failed', error: error instanceof Error ? error.message : 'Unknown worker error' },
        'Worker run failed'
      );
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
    logger.info({ event: 'worker_shutdown' }, 'Worker shutdown complete');
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
