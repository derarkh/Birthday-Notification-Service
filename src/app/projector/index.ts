import 'dotenv/config';

import { loadConfig } from '../../infrastructure/config/env.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PostgresNotificationOccurrenceRepository } from '../../infrastructure/db/notification-occurrence-repository.js';
import { PostgresUserRepository } from '../../infrastructure/db/user-repository.js';
import { PostgresUserChangeEventRepository } from '../../infrastructure/db/user-change-event-repository.js';
import { createLogger } from '../../infrastructure/logging/index.js';
import { ProjectorService } from './projector-service.js';

export async function startProjector(): Promise<void> {
  const logger = createLogger('projector');
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const userRepository = new PostgresUserRepository(pool);
  const occurrenceRepository = new PostgresNotificationOccurrenceRepository(pool);
  const userChangeEventRepository = new PostgresUserChangeEventRepository(pool);

  const projectorService = new ProjectorService(
    userRepository,
    occurrenceRepository,
    userChangeEventRepository,
    {
      lookbackHours: config.plannerLookbackHours,
      batchSize: config.projectorBatchSize
    },
    logger.child({ component: 'projector-service' })
  );

  const runOnce = async (): Promise<void> => {
    try {
      const summary = await projectorService.runOnce();
      logger.info({ event: 'projector_run_summary', ...summary }, 'Projector run completed');
    } catch (error) {
      logger.error(
        { event: 'projector_run_failed', error: error instanceof Error ? error.message : 'Unknown projector error' },
        'Projector run failed'
      );
    }
  };

  await runOnce();
  const intervalMs = config.projectorPollIntervalSeconds * 1000;
  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await pool.end();
    logger.info({ event: 'projector_shutdown' }, 'Projector shutdown complete');
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
  void startProjector();
}

