import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { Role } from '@bbms/shared';

/**
 * Metadata that middleware attaches to itself so tooling can describe a route without a second,
 * hand-maintained source of truth: the OpenAPI generator reads it, and the security test uses the
 * same route table. If the middleware changes, the documentation changes with it.
 */
export interface RouteMeta {
  schemas?: { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
  /** Roles that may call the route (intersection of every `authorize` on it). */
  roles?: readonly Role[];
  /** Short human description of an access rule that is not a plain permission. */
  access?: string;
}

const META = Symbol.for('bbms.routeMeta');

export function withMeta<T extends RequestHandler>(handler: T, meta: RouteMeta): T {
  Object.defineProperty(handler, META, { value: meta, enumerable: false });
  return handler;
}

export function metaOf(handler: unknown): RouteMeta | undefined {
  return (handler as { [META]?: RouteMeta } | null)?.[META];
}
