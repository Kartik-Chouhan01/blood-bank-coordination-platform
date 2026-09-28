import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { toApiClientError } from './httpClient';

function axiosErrorWith(status: number, data: unknown) {
  const response = {
    status,
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
    statusText: '',
  } as AxiosResponse;
  return new AxiosError('failed', 'ERR', undefined, undefined, response);
}

describe('toApiClientError', () => {
  it('preserves the server error envelope', () => {
    const error = toApiClientError(
      axiosErrorWith(400, {
        success: false,
        message: 'Request validation failed',
        errorCode: 'VALIDATION_FAILED',
        details: [{ field: 'body.email', message: 'Invalid email' }],
        requestId: 'abc-12345',
      }),
    );
    expect(error.errorCode).toBe('VALIDATION_FAILED');
    expect(error.status).toBe(400);
    expect(error.requestId).toBe('abc-12345');
    expect(error.fieldErrors()).toEqual({ email: 'Invalid email' });
  });

  it('treats a missing response as a network error', () => {
    const error = toApiClientError(new AxiosError('Network Error'));
    expect(error.isNetworkError).toBe(true);
    expect(error.status).toBeNull();
  });

  it('gives a safe message for unexpected server responses', () => {
    const error = toApiClientError(axiosErrorWith(502, '<html>Bad gateway</html>'));
    expect(error.errorCode).toBe('INTERNAL_ERROR');
    expect(error.message).not.toContain('html');
  });
});
