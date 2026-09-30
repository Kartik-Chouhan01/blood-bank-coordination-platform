import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { withMeta } from '../utils/routeMeta.js';

interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Parsed, type-coerced query string. Express 5 makes req.query read-only, so it lives here. */
    validatedQuery?: unknown;
  }
}

/**
 * Validates and normalises the request against zod schemas. Unknown body keys are stripped by
 * zod's default object behaviour, which also blocks mass-assignment of fields like `role`.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return withMeta(
    (req, _res, next) => {
      const problems: { field: string; message: string }[] = [];

      for (const part of ['params', 'query', 'body'] as const) {
        const schema = schemas[part];
        if (!schema) continue;

        const result = schema.safeParse(req[part] ?? {});
        if (!result.success) {
          for (const issue of result.error.issues) {
            problems.push({
              field: [part, ...issue.path.map(String)].join('.'),
              message: issue.message,
            });
          }
          continue;
        }

        if (part === 'body') req.body = result.data;
        else if (part === 'query') req.validatedQuery = result.data;
        else req.params = result.data as typeof req.params;
      }

      if (problems.length) return next(AppError.validation(problems));
      next();
    },
    { schemas },
  );
}
