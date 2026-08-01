export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_FAILED'
  | 'INTERNAL'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'POLICY_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'TENANT_SUSPENDED';

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: ErrorCode;
  readonly instance?: string;
  readonly traceId?: string;
  readonly errors?: ReadonlyArray<{ field: string; message: string }>;
  readonly retryable: boolean;
}

export class SullError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly retryable: boolean;
  public readonly details: ReadonlyArray<{ field: string; message: string }>;
  public readonly causeError?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      details?: ReadonlyArray<{ field: string; message: string }>;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'SullError';
    this.code = code;
    this.status = options.status ?? statusForCode(code);
    this.retryable = options.retryable ?? isRetryable(code);
    this.details = options.details ?? [];
    this.causeError = options.cause;
  }

  toProblemDetails(traceId?: string, instance?: string): ProblemDetails {
    return {
      type: `https://errors.sull.ai/${this.code.toLowerCase()}`,
      title: this.code,
      status: this.status,
      detail: this.message,
      code: this.code,
      ...(instance !== undefined ? { instance } : {}),
      ...(traceId !== undefined ? { traceId } : {}),
      ...(this.details.length > 0 ? { errors: this.details } : {}),
      retryable: this.retryable,
    };
  }
}

export function statusForCode(code: ErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
    case 'POLICY_DENIED':
    case 'TENANT_SUSPENDED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    case 'VALIDATION':
      return 422;
    case 'RATE_LIMITED':
    case 'QUOTA_EXCEEDED':
      return 429;
    case 'TIMEOUT':
      return 504;
    case 'UNAVAILABLE':
    case 'DEPENDENCY_FAILED':
      return 503;
    case 'INTERNAL':
    default:
      return 500;
  }
}

export function isRetryable(code: ErrorCode): boolean {
  return (
    code === 'RATE_LIMITED' ||
    code === 'UNAVAILABLE' ||
    code === 'TIMEOUT' ||
    code === 'DEPENDENCY_FAILED'
  );
}

export function isSullError(error: unknown): error is SullError {
  return error instanceof SullError;
}

export function unauthorized(message = 'Authentication required'): SullError {
  return new SullError('UNAUTHORIZED', message);
}

export function forbidden(message = 'Access denied'): SullError {
  return new SullError('FORBIDDEN', message);
}

export function notFound(resource: string): SullError {
  return new SullError('NOT_FOUND', `${resource} not found`);
}

export function conflict(message: string): SullError {
  return new SullError('CONFLICT', message);
}

export function validation(
  message: string,
  details: ReadonlyArray<{ field: string; message: string }> = [],
): SullError {
  return new SullError('VALIDATION', message, { details });
}

export function policyDenied(message: string): SullError {
  return new SullError('POLICY_DENIED', message);
}

export function quotaExceeded(message: string): SullError {
  return new SullError('QUOTA_EXCEEDED', message);
}

export function internal(message = 'Internal server error', cause?: unknown): SullError {
  return new SullError('INTERNAL', message, { cause, retryable: false });
}

export function unavailable(message: string, cause?: unknown): SullError {
  return new SullError('UNAVAILABLE', message, { cause, retryable: true });
}

export function dependencyFailed(message: string, cause?: unknown): SullError {
  return new SullError('DEPENDENCY_FAILED', message, { cause, retryable: true });
}

export function timeout(message = 'Upstream timeout'): SullError {
  return new SullError('TIMEOUT', message, { retryable: true });
}
