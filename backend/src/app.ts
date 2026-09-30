import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiDocsEnabled, env } from './config/env.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createRateLimiter } from './middleware/rateLimits.js';
import { rejectOperatorKeys } from './middleware/rejectOperatorKeys.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Non-browser clients (curl, server-to-server, health checks) send no Origin header.
        callback(null, !origin || env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(rejectOperatorKeys);

  if (apiDocsEnabled) {
    // Built once, on first request; the route table does not change at runtime.
    let document: object | undefined;
    app.get('/api/docs/openapi.json', (_req, res) => {
      document ??= buildOpenApiDocument(env.APP_VERSION);
      res.json(document);
    });
  }

  app.use(
    '/api',
    createRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }),
    apiRouter,
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
