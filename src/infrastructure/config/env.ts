export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  plannerLookbackHours: number;
  plannerBatchSize: number;
  plannerUserPageSize: number;
  plannerPollIntervalSeconds: number;
  awsRegion: string;
  awsEndpointUrl: string | null;
  sqsBirthdayQueueUrl: string;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  outboundBaseUrl: string;
  workerPollIntervalSeconds: number;
  workerSqsWaitTimeSeconds: number;
  workerSqsMaxMessages: number;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const databaseUrl = process.env.DATABASE_URL;
  const plannerLookbackHours = Number(process.env.PLANNER_LOOKBACK_HOURS ?? 48);
  const plannerBatchSize = Number(process.env.PLANNER_BATCH_SIZE ?? 500);
  const plannerUserPageSize = Number(process.env.PLANNER_USER_PAGE_SIZE ?? 1000);
  const plannerPollIntervalSeconds = Number(process.env.PLANNER_POLL_INTERVAL_SECONDS ?? 60);
  const awsRegion = process.env.AWS_REGION ?? 'ap-southeast-2';
  const awsEndpointUrl = process.env.AWS_ENDPOINT_URL ?? null;
  const sqsBirthdayQueueUrl = process.env.SQS_BIRTHDAY_QUEUE_URL;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID ?? null;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? null;
  const outboundBaseUrl = process.env.OUTBOUND_BASE_URL;
  const workerPollIntervalSeconds = Number(process.env.WORKER_POLL_INTERVAL_SECONDS ?? 5);
  const workerSqsWaitTimeSeconds = Number(process.env.WORKER_SQS_WAIT_TIME_SECONDS ?? 10);
  const workerSqsMaxMessages = Number(process.env.WORKER_SQS_MAX_MESSAGES ?? 10);

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!sqsBirthdayQueueUrl) {
    throw new Error('SQS_BIRTHDAY_QUEUE_URL is required');
  }
  if (!outboundBaseUrl) {
    throw new Error('OUTBOUND_BASE_URL is required');
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }
  if (!Number.isInteger(plannerLookbackHours) || plannerLookbackHours <= 0) {
    throw new Error('PLANNER_LOOKBACK_HOURS must be a positive integer');
  }
  if (!Number.isInteger(plannerBatchSize) || plannerBatchSize <= 0) {
    throw new Error('PLANNER_BATCH_SIZE must be a positive integer');
  }
  if (!Number.isInteger(plannerUserPageSize) || plannerUserPageSize <= 0) {
    throw new Error('PLANNER_USER_PAGE_SIZE must be a positive integer');
  }
  if (!Number.isInteger(plannerPollIntervalSeconds) || plannerPollIntervalSeconds <= 0) {
    throw new Error('PLANNER_POLL_INTERVAL_SECONDS must be a positive integer');
  }
  if (!Number.isInteger(workerPollIntervalSeconds) || workerPollIntervalSeconds <= 0) {
    throw new Error('WORKER_POLL_INTERVAL_SECONDS must be a positive integer');
  }
  if (!Number.isInteger(workerSqsWaitTimeSeconds) || workerSqsWaitTimeSeconds <= 0) {
    throw new Error('WORKER_SQS_WAIT_TIME_SECONDS must be a positive integer');
  }
  if (!Number.isInteger(workerSqsMaxMessages) || workerSqsMaxMessages <= 0) {
    throw new Error('WORKER_SQS_MAX_MESSAGES must be a positive integer');
  }

  return {
    port,
    host,
    databaseUrl,
    plannerLookbackHours,
    plannerBatchSize,
    plannerUserPageSize,
    plannerPollIntervalSeconds,
    awsRegion,
    awsEndpointUrl,
    sqsBirthdayQueueUrl,
    awsAccessKeyId,
    awsSecretAccessKey,
    outboundBaseUrl,
    workerPollIntervalSeconds,
    workerSqsWaitTimeSeconds,
    workerSqsMaxMessages
  };
}
