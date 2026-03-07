export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  return {
    port,
    host,
    databaseUrl
  };
}
