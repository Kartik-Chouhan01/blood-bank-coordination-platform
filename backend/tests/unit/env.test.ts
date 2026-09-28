import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseEnv } from '../../src/config/env.js';

const base = { MONGODB_URI: 'mongodb://localhost/test' };

describe('parseEnv', () => {
  it('applies defaults and parses lists and numbers', () => {
    const env = parseEnv({ ...base, PORT: '8080', CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast when required values are missing', () => {
    expect(() => parseEnv({})).toThrow(InvalidEnvironmentError);
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('refuses a wildcard CORS origin in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(
      /wildcard/,
    );
  });
});
