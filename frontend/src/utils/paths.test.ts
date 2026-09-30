import { describe, expect, it } from 'vitest';
import { isInternalPath } from './paths';

describe('isInternalPath', () => {
  it.each(['/admin', '/hospital/requests/abc?x=1', '/'])('accepts %s', (path) => {
    expect(isInternalPath(path)).toBe(true);
  });

  it.each([
    '//evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/\\evil.example',
    '',
    null,
    42,
  ])('rejects %s', (path) => {
    expect(isInternalPath(path)).toBe(false);
  });
});
