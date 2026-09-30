import type { Server } from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';
import { refreshSettings } from './modules/settings/settings.service.js';

/** Other instances pick up an administrator's settings change within this time. */
const SETTINGS_REFRESH_MS = 60_000;

async function start() {
  try {
    await connectDatabase(env.MONGODB_URI);
  } catch (err) {
    logger.fatal(
      { err },
      'Could not connect to MongoDB. Check MONGODB_URI in backend/.env, or start the local ' +
        'database with `npm run dev:db`.',
    );
    process.exit(1);
  }

  await refreshSettings();
  const settingsTimer = setInterval(() => {
    refreshSettings().catch((err: unknown) => logger.error({ err }, 'Could not refresh settings'));
  }, SETTINGS_REFRESH_MS);
  settingsTimer.unref();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  startJobs();
  registerShutdownHandlers(server);
}

function registerShutdownHandlers(server: Server) {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    stopJobs();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

void start();
