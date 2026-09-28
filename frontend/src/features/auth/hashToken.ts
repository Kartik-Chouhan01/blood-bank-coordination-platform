/**
 * Emailed links carry single-use tokens in the URL fragment (`#token=…`): fragments are never sent
 * to servers, proxies or analytics in Referer headers. Read it once, then strip it from the address bar.
 */
export function readHashToken(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get('token');
}

export function stripHashFromUrl() {
  if (window.location.hash) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }
}
