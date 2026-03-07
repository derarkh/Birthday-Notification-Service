import 'dotenv/config';

import { spawnSync } from 'node:child_process';

const direction = process.argv[2];

if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: node scripts/db/migrate.mjs <up|down>');
  process.exit(1);
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
  console.error('DATABASE_URL is missing. Set it in your shell or in .env before running migrations.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    './node_modules/node-pg-migrate/bin/node-pg-migrate.js',
    '-m',
    'src/infrastructure/db/migrations',
    '--database-url-var',
    'DATABASE_URL',
    direction
  ],
  {
    stdio: 'inherit',
    env: process.env
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
