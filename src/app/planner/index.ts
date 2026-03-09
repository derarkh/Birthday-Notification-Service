import 'dotenv/config';

import { loadConfig } from '../../infrastructure/config/env.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PostgresNotificationOccurrenceRepository } from '../../infrastructure/db/notification-occurrence-repository.js';
import { PostgresUserRepository } from '../../infrastructure/db/user-repository.js';
import { SqsDeliveryQueuePublisher } from '../../infrastructure/aws/sqs-delivery-queue.js';
import { createLogger } from '../../infrastructure/logging/index.js';
import { PlannerService } from './planner-service.js';

export async function startPlanner(): Promise<void> {
  const logger = createLogger('planner');
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);
  const queuePublisher = new SqsDeliveryQueuePublisher({
    queueUrl: config.sqsBirthdayQueueUrl,
    region: config.awsRegion,
    ...(config.awsEndpointUrl ? { endpointUrl: config.awsEndpointUrl } : {}),
    ...(config.awsAccessKeyId ? { accessKeyId: config.awsAccessKeyId } : {}),
    ...(config.awsSecretAccessKey ? { secretAccessKey: config.awsSecretAccessKey } : {})
  });
  const plannerService = new PlannerService(userRepository, occurrenceRepository, queuePublisher, {
    lookbackHours: config.plannerLookbackHours,
    batchSize: config.plannerBatchSize,
    userPageSize: config.plannerUserPageSize
  }, logger.child({ component: 'planner-service' }));

  const runOnce = async (): Promise<void> => {
    try {
      const summary = await plannerService.runOnce();
      logger.info({ event: 'planner_run_summary', ...summary }, 'Planner run completed');
    } catch (error) {
      logger.error(
        { event: 'planner_run_failed', error: error instanceof Error ? error.message : 'Unknown planner error' },
        'Planner run failed'
      );
    }
  };

  await runOnce();
  const intervalMs = config.plannerPollIntervalSeconds * 1000;
  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await pool.end();
    logger.info({ event: 'planner_shutdown' }, 'Planner shutdown complete');
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
  void startPlanner();
}
