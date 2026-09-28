import { existsSync } from 'node:fs';
import { z } from 'zod';
import { COMPONENT_TYPES, DEFAULT_SHELF_LIFE_DAYS, type ComponentType } from '@bbms/shared';

const commaSeparatedList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/** "PRBC=42,PLATELETS=5" → overrides merged onto the defaults. */
const shelfLifeSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const result: Record<ComponentType, number> = { ...DEFAULT_SHELF_LIFE_DAYS };
    for (const pair of (value ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)) {
      const [key, days] = pair.split('=').map((p) => p.trim());
      const parsed = Number(days);
      if (
        !(COMPONENT_TYPES as readonly string[]).includes(key ?? '') ||
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > 3650
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `invalid entry "${pair}" (expected COMPONENT=days)`,
        });
        return z.NEVER;
      }
      result[key as ComponentType] = parsed;
    }
    return result;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CORS_ORIGINS: commaSeparatedList.default(['http://localhost:5173']),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  /** Stricter per-IP limit for login, registration and password-reset endpoints. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  APP_VERSION: z.string().default(process.env.npm_package_version ?? '0.1.0'),

  /** Public URL of the web app, used to build links in emails. */
  APP_URL: z.url().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  /**
   * `strict` works when the web app and API share a site (same domain, or a proxy/rewrite).
   * Use `none` only for cross-site deployments; the refresh endpoint also checks the Origin header.
   */
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  /**
   * Administrative policy: minimum days after a recorded donation before the system may contact a
   * donor about donating again. Not a medical rule — blood-bank staff set it to local regulations.
   */
  DONOR_CONTACT_INTERVAL_DAYS: z.coerce.number().int().min(1).max(365).default(90),

  /** Shelf life per component; defaults are reference values — set to local regulations. */
  SHELF_LIFE_DAYS: shelfLifeSchema,
  /** Units expiring within this many days are flagged as "expiring soon". */
  EXPIRY_WARNING_DAYS: z.coerce.number().int().min(1).max(60).default(3),
  EXPIRY_SWEEP_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
  /** Background jobs (expiry sweep). Disabled in tests; tests call jobs directly. */
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  if (result.data.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (result.data.CORS_ORIGINS.includes('*')) {
      problems.push('CORS_ORIGINS: wildcard origin is not allowed in production');
    }
    if (/change-me|example|secret/i.test(result.data.JWT_ACCESS_SECRET)) {
      problems.push('JWT_ACCESS_SECRET: replace the placeholder with a random value');
    }
    if (result.data.BCRYPT_ROUNDS < 10) {
      problems.push('BCRYPT_ROUNDS: must be at least 10 in production');
    }
    if (problems.length) throw new InvalidEnvironmentError(problems);
  }
  return result.data;
}

// Real environment variables always win over the .env file; tests configure env via vitest.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

export const env = parseEnv(process.env);
export const isProduction = env.NODE_ENV === 'production';
