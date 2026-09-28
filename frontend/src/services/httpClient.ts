import axios, { AxiosError } from 'axios';
import { ERROR_CODES, type ApiFailure, type ApiSuccess } from '@bbms/shared';
import { API_BASE_URL } from '@/constants/app';
import { ApiClientError } from './apiError';

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

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

httpClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiClientError(error)),
);

/** Unwraps the `{ success, data }` envelope so feature code works with plain data. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await httpClient.get<ApiSuccess<T>>(url, { params });
  return response.data.data;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const response = await httpClient.post<ApiSuccess<T>>(url, body);
  return response.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const response = await httpClient.patch<ApiSuccess<T>>(url, body);
  return response.data.data;
}
