import type { HealthStatus } from '@bbms/shared';
import { env } from '../../config/env.js';
import { pingDatabase } from '../../config/db.js';

export async function getHealthStatus(): Promise<HealthStatus> {
  const databaseUp = await pingDatabase();
  return {
    status: databaseUp ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: env.APP_VERSION,
    checks: { database: databaseUp ? 'up' : 'down' },
  };
}
