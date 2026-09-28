import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from './httpClient';
import {
  getAccessToken,
  onSessionExpired,
  refreshSession,
  sessionClient,
  setAccessToken,
} from './session';

const session = (token: string) => ({
  success: true,
  data: { accessToken: token, expiresIn: 900, user: { id: 'u1' } },
});

function respond(
  status: number,
  data: unknown,
  config: Parameters<AxiosAdapter>[0],
): AxiosResponse {
  return {
    status,
    data,
    statusText: '',
    headers: {},
    config: { ...config, headers: new AxiosHeaders() },
  };
}

/** Rejects the way axios does for a non-2xx response. */
function fail(status: number, data: unknown, config: Parameters<AxiosAdapter>[0]) {
  return Promise.reject(
    new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      config,
      null,
      respond(status, data, config),
    ),
  );
}

beforeEach(() => setAccessToken(null));
afterEach(() => {
  sessionClient.defaults.adapter = undefined;
  httpClient.defaults.adapter = undefined;
});

describe('refreshSession', () => {
  it('shares one network request between concurrent callers', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => respond(200, session('fresh'), config));
    sessionClient.defaults.adapter = adapter;

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(getAccessToken()).toBe('fresh');
  });

  it('retries once when another tab rotated the session', async () => {
    const adapter = vi
      .fn<AxiosAdapter>()
      .mockImplementationOnce((config) =>
        fail(401, { success: false, errorCode: 'SESSION_ROTATED', message: 'retry' }, config),
      )
      .mockImplementationOnce(async (config) => respond(200, session('second'), config));
    sessionClient.defaults.adapter = adapter;

    await refreshSession();
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBe('second');
  });
});

describe('httpClient 401 handling', () => {
  it('refreshes an expired access token and replays the request', async () => {
    setAccessToken('stale');
    sessionClient.defaults.adapter = async (config) => respond(200, session('fresh'), config);
    const seenTokens: string[] = [];
    httpClient.defaults.adapter = async (config) => {
      const auth = String(config.headers?.Authorization ?? '');
      seenTokens.push(auth);
      return auth === 'Bearer fresh'
        ? respond(200, { success: true, data: 'ok' }, config)
        : fail(401, { success: false, errorCode: 'TOKEN_EXPIRED', message: 'expired' }, config);
    };

    const res = await httpClient.get('/users');
    expect(res.data.data).toBe('ok');
    expect(seenTokens).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('announces session expiry when the refresh also fails', async () => {
    setAccessToken('stale');
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    sessionClient.defaults.adapter = (config) =>
      fail(401, { success: false, errorCode: 'SESSION_EXPIRED', message: 'gone' }, config);
    httpClient.defaults.adapter = (config) =>
      fail(401, { success: false, errorCode: 'TOKEN_EXPIRED', message: 'expired' }, config);

    await expect(httpClient.get('/users')).rejects.toMatchObject({ errorCode: 'SESSION_EXPIRED' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not try to refresh on a failed login', async () => {
    const refreshAdapter = vi.fn<AxiosAdapter>();
    sessionClient.defaults.adapter = refreshAdapter;
    httpClient.defaults.adapter = (config) =>
      fail(401, { success: false, errorCode: 'INVALID_CREDENTIALS', message: 'nope' }, config);

    await expect(httpClient.post('/auth/login', {})).rejects.toMatchObject({
      errorCode: 'INVALID_CREDENTIALS',
    });
    expect(refreshAdapter).not.toHaveBeenCalled();
  });
});
