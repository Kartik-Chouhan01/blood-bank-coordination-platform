import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ERROR_CODES, type ApiFailure } from '@bbms/shared';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, ERROR_CODES.ROUTE_NOT_FOUND, `Route ${req.method} ${req.path} not found`));
};

/** Maps known library errors to AppErrors; returns null for anything unexpected. */
function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  // body-parser errors carry a `type` discriminator.
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON request body');
  if (type === 'entity.too.large') {
    return new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return AppError.validation(
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  }
  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${err.path}`);
  }
  if ((err as { code?: number } | null)?.code === 11000) {
    const fields = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    return AppError.conflict(
      `A record with this ${fields.join(', ') || 'value'} already exists`,
      ERROR_CODES.DUPLICATE_RESOURCE,
    );
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  const requestId = typeof req.id === 'string' ? req.id : undefined;

  if (appError) {
    if (appError.statusCode >= 500) req.log?.error({ err }, appError.message);
    const body: ApiFailure = {
      success: false,
      message: appError.message,
      errorCode: appError.errorCode,
      ...(appError.details?.length && { details: appError.details }),
      ...(requestId && { requestId }),
    };
    res.status(appError.statusCode).json(body);
    return;
  }

  // Unexpected: log everything server-side, reveal nothing implementation-specific to the client.
  req.log?.error({ err }, 'Unhandled error');
  const body: ApiFailure = {
    success: false,
    message: 'An unexpected error occurred. Please try again later.',
    errorCode: ERROR_CODES.INTERNAL_ERROR,
    ...(requestId && { requestId }),
  };
  res.status(500).json(body);
};
