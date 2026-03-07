import 'dotenv/config';

import { buildApp } from './app.js';
import { loadConfig } from '../../infrastructure/config/env.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PostgresUserRepository } from '../../infrastructure/db/user-repository.js';

async function startServer(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const userRepository = new PostgresUserRepository(pool);
  const app = buildApp({ userRepository });

  app.addHook('onClose', async () => {
    await pool.end();
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}

export { startServer };
