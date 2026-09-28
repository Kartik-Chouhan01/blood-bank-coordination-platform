import { ERROR_CODES, type ErrorCode, type FieldError } from '@bbms/shared';

/**
 * An expected, client-facing failure. Its message is safe to show to the user.
 * Anything thrown that is NOT an AppError is treated as an internal error and never leaked.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: FieldError[]) {
    return new AppError(400, ERROR_CODES.BAD_REQUEST, message, details);
  }

  static validation(details: FieldError[], message = 'Request validation failed') {
    return new AppError(400, ERROR_CODES.VALIDATION_FAILED, message, details);
  }

  static unauthenticated(message = 'Authentication required') {
    return new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(resource = 'Resource') {
    return new AppError(404, ERROR_CODES.NOT_FOUND, `${resource} not found`);
  }

  static conflict(message: string, errorCode: ErrorCode = ERROR_CODES.CONFLICT) {
    return new AppError(409, errorCode, message);
  }
}
