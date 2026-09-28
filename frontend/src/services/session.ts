import axios from 'axios';
import { ERROR_CODES, type ApiSuccess, type AuthSessionResponse } from '@bbms/shared';
import { API_BASE_URL } from '@/constants/app';
import { toApiClientError } from './apiError';

/**
 * The access token lives only in memory (never localStorage), so injected scripts cannot lift a
 * long-lived credential. The httpOnly refresh cookie restores it after a page reload.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSessionResponse> | null = null;
const expiryListeners = new Set<() => void>();

/** Bare client for auth calls: no auth header and no refresh-on-401 interceptor (avoids loops). */
export const sessionClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
});

export const getAccessToken = () => accessToken;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onSessionExpired(listener: () => void) {
  expiryListeners.add(listener);
  return () => void expiryListeners.delete(listener);
}

export function notifySessionExpired() {
  accessToken = null;
  expiryListeners.forEach((listener) => listener());
}

async function requestRefresh(): Promise<AuthSessionResponse> {
  try {
    const res = await sessionClient.post<ApiSuccess<AuthSessionResponse>>('/auth/refresh');
    return res.data.data;
  } catch (err) {
    const error = toApiClientError(err);
    // Another tab rotated the cookie a moment ago; the browser now holds the new one.
    if (error.errorCode === ERROR_CODES.SESSION_ROTATED) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const res = await sessionClient.post<ApiSuccess<AuthSessionResponse>>('/auth/refresh');
      return res.data.data;
    }
    throw error;
  }
}

/** Single-flight: concurrent callers share one refresh request instead of racing each other. */
export function refreshSession(): Promise<AuthSessionResponse> {
  refreshInFlight ??= requestRefresh()
    .then((session) => {
      accessToken = session.accessToken;
      return session;
    })
    .catch((err: unknown) => {
      accessToken = null;
      throw toApiClientError(err);
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}
