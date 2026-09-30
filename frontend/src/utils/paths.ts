/**
 * Only same-app paths are followed (after sign-in, or from a notification): "/x", never
 * "//host", "https://…" or "javascript:", so a crafted value can never send someone off-site.
 */
export const isInternalPath = (path: unknown): path is string =>
  typeof path === 'string' &&
  path.startsWith('/') &&
  !path.startsWith('//') &&
  !path.includes('\\');
