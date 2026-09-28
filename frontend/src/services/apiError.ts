import { ERROR_CODES, type ErrorCode, type FieldError } from '@bbms/shared';

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

  /** Maps server field errors (e.g. "body.email") to form field names ("email"). */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.details.map(({ field, message }) => [
        field.replace(/^(body|query|params)\./, ''),
        message,
      ]),
    );
  }
}
