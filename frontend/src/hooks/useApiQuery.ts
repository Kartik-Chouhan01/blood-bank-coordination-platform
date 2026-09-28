import { useCallback, useEffect, useState } from 'react';
import { toApiClientError } from '@/services/httpClient';
import type { ApiClientError } from '@/services/apiError';

interface SettledResult<T> {
  key: string;
  data: T | undefined;
  error: ApiClientError | undefined;
}

/**
 * Minimal data-fetching hook with loading/error state and manual refetch.
 * `deps` (serialisable values such as ids, filters, page numbers) control when the fetch re-runs.
 * Loading is derived by comparing the settled result's key with the current one, so a stale
 * response can never be shown for new parameters.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<SettledResult<T>>();
  const key = `${JSON.stringify(deps)}#${reloadCount}`;

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => !cancelled && setResult({ key, data, error: undefined }))
      .catch(
        (err: unknown) =>
          !cancelled && setResult({ key, data: undefined, error: toApiClientError(err) }),
      );
    return () => {
      cancelled = true;
    };
    // `key` captures deps and reloads; the fetcher identity is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);
  /** Replaces the data with a fresh server response (e.g. returned by a mutation) without refetching. */
  const setData = useCallback((data: T) => setResult({ key, data, error: undefined }), [key]);
  const isLoading = result?.key !== key;

  return {
    data: isLoading ? undefined : result?.data,
    error: isLoading ? undefined : result?.error,
    isLoading,
    refetch,
    setData,
  };
}
