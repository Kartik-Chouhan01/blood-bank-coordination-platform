import { AxiosError } from 'axios';
import { ERROR_CODES, type ApiFailure, type ErrorCode, type FieldError } from '@bbms/shared';

/** The only error shape UI code needs to handle, whatever went wrong underneath. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly errorCode: ErrorCode,
    public readonly status: number | null,
    public readonly details: FieldError[] = [],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get isNetworkError() {
    return this.errorCode === ERROR_CODES.NETWORK_ERROR;
  }

  get isUnauthenticated() {
    return this.status === 401;
  }

  /** Maps server field errors (e.g. "body.address.city") to form field names ("address.city"). */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.details.map(({ field, message }) => [
        field.replace(/^(body|query|params)\./, ''),
        message,
      ]),
    );
  }
}

export function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (error instanceof AxiosError) {
    const body = error.response?.data as Partial<ApiFailure> | undefined;
    if (error.response && body?.errorCode) {
      return new ApiClientError(
        body.message ?? 'Request failed',
        body.errorCode,
        error.response.status,
        body.details,
        body.requestId,
      );
    }
    if (error.response) {
      return new ApiClientError(
        error.response.status >= 500
          ? 'The server encountered a problem. Please try again shortly.'
          : 'The request could not be completed.',
        error.response.status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST,
        error.response.status,
      );
    }
    return new ApiClientError(
      'Unable to reach the server. Check your connection and try again.',
      ERROR_CODES.NETWORK_ERROR,
      null,
    );
  }

  return new ApiClientError('Something went wrong.', ERROR_CODES.INTERNAL_ERROR, null);
}
