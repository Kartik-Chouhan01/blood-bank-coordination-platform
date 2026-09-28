import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ERROR_CODES, type ApiFailure, type ApiSuccess, type PaginationMeta } from '@bbms/shared';
import { API_BASE_URL } from '@/constants/app';
import { toApiClientError } from './apiError';
import { getAccessToken, notifySessionExpired, refreshSession } from './session';

export { toApiClientError } from './apiError';

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

const REFRESHABLE_CODES: string[] = [
  ERROR_CODES.TOKEN_EXPIRED,
  ERROR_CODES.SESSION_EXPIRED,
  ERROR_CODES.INVALID_TOKEN,
  ERROR_CODES.UNAUTHENTICATED,
];
/** Credential endpoints report their own 401s; retrying them after a refresh makes no sense. */
const NO_RETRY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiFailure>) => {
    const original = error.config as RetriableConfig | undefined;
    const shouldRefresh =
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !NO_RETRY_PATHS.some((path) => original.url?.startsWith(path)) &&
      REFRESHABLE_CODES.includes(error.response.data?.errorCode ?? '');

    if (shouldRefresh) {
      original._retried = true;
      try {
        await refreshSession();
        return await httpClient(original);
      } catch (retryError) {
        const normalised = toApiClientError(retryError);
        if (normalised.isUnauthenticated) notifySessionExpired();
        throw normalised;
      }
    }
    throw toApiClientError(error);
  },
);

/** Unwraps the `{ success, data }` envelope so feature code works with plain data. */
export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const response = await httpClient.get<ApiSuccess<T>>(url, { params });
  return response.data.data;
}

export interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

export async function apiGetPage<T>(url: string, params?: object): Promise<Page<T>> {
  const response = await httpClient.get<ApiSuccess<T[]>>(url, { params });
  return { items: response.data.data, meta: response.data.meta! };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const response = await httpClient.post<ApiSuccess<T>>(url, body);
  return response.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const response = await httpClient.patch<ApiSuccess<T>>(url, body);
  return response.data.data;
}
