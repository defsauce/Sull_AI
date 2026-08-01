import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LoggerContext {
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly level?: LogLevel;
}

export type Logger = PinoLogger;

export function createLogger(context: LoggerContext): Logger {
  const options: LoggerOptions = {
    level: context.level ?? (context.environment === 'production' ? 'info' : 'debug'),
    base: {
      service: context.service,
      version: context.version,
      environment: context.environment,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'secret',
        'token',
        'apiKey',
        'creditCard',
        '*.password',
        '*.secret',
        '*.token',
        '*.apiKey',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  return pino(options);
}

export function childLogger(
  logger: Logger,
  bindings: Record<string, string | number | boolean | undefined>,
): Logger {
  return logger.child(bindings);
}
