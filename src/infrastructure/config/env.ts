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
  sqsBirthdayDlqName: string;
  sqsMaxReceiveCount: number;
  sqsVisibilityTimeoutSeconds: number;
  sqsMessageRetentionSeconds: number;
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
  const sqsBirthdayDlqName = process.env.SQS_BIRTHDAY_DLQ_NAME ?? 'birthday-delivery-dlq';
  const sqsMaxReceiveCount = Number(process.env.SQS_MAX_RECEIVE_COUNT ?? 5);
  const sqsVisibilityTimeoutSeconds = Number(process.env.SQS_VISIBILITY_TIMEOUT_SECONDS ?? 30);
  const sqsMessageRetentionSeconds = Number(process.env.SQS_MESSAGE_RETENTION_SECONDS ?? 1209600);
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
  if (!sqsBirthdayDlqName) {
    throw new Error('SQS_BIRTHDAY_DLQ_NAME is required');
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
  if (!Number.isInteger(sqsMaxReceiveCount) || sqsMaxReceiveCount <= 0) {
    throw new Error('SQS_MAX_RECEIVE_COUNT must be a positive integer');
  }
  if (!Number.isInteger(sqsVisibilityTimeoutSeconds) || sqsVisibilityTimeoutSeconds <= 0) {
    throw new Error('SQS_VISIBILITY_TIMEOUT_SECONDS must be a positive integer');
  }
  if (!Number.isInteger(sqsMessageRetentionSeconds) || sqsMessageRetentionSeconds <= 0) {
    throw new Error('SQS_MESSAGE_RETENTION_SECONDS must be a positive integer');
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
    sqsBirthdayDlqName,
    sqsMaxReceiveCount,
    sqsVisibilityTimeoutSeconds,
    sqsMessageRetentionSeconds,
    awsAccessKeyId,
    awsSecretAccessKey,
    outboundBaseUrl,
    workerPollIntervalSeconds,
    workerSqsWaitTimeSeconds,
    workerSqsMaxMessages
  };
}
