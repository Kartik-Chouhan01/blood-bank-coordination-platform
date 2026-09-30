import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseEnv } from '../../src/config/env.js';

const base = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

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

  it('validates the time zone and the public stock thresholds', () => {
    expect(parseEnv(base).APP_TIME_ZONE).toBe('Asia/Kolkata');
    expect(() => parseEnv({ ...base, APP_TIME_ZONE: 'Mars/Olympus' })).toThrow(/APP_TIME_ZONE/);
    expect(() =>
      parseEnv({ ...base, PUBLIC_STOCK_LOW_BELOW: '10', PUBLIC_STOCK_GOOD_FROM: '10' }),
    ).toThrow(/PUBLIC_STOCK_GOOD_FROM/);
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('refuses a wildcard CORS origin in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(
      /wildcard/,
    );
  });

  it('refuses a placeholder JWT secret in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-'.repeat(4) }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe('mail transport', () => {
  it('requires an SMTP URL for the smtp transport', () => {
    expect(() => parseEnv({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
    expect(() => parseEnv({ ...base, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'http://x' })).toThrow(
      /SMTP_URL/,
    );
    expect(
      parseEnv({ ...base, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtps://u:p@smtp.example.org:465' })
        .MAIL_TRANSPORT,
    ).toBe('smtp');
  });
});
