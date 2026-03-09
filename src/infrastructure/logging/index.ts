import pino, { type Logger as PinoLogger } from 'pino';

export interface Logger {
  debug(fields: Record<string, unknown>, message: string): void;
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

function wrapPinoLogger(logger: PinoLogger): Logger {
  return {
    debug(fields, message) {
      logger.debug(fields, message);
    },
    info(fields, message) {
      logger.info(fields, message);
    },
    warn(fields, message) {
      logger.warn(fields, message);
    },
    error(fields, message) {
      logger.error(fields, message);
    },
    child(bindings) {
      return wrapPinoLogger(logger.child(bindings));
    }
  };
}

export function createLogger(name: string, base: Record<string, unknown> = {}): Logger {
  const root = pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info'
  });

  if (Object.keys(base).length === 0) {
    return wrapPinoLogger(root);
  }

  return wrapPinoLogger(root.child(base));
}
