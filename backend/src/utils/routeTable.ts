import type { RequestHandler, Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { API_MOUNTS } from '../routes.js';
import { metaOf, type RouteMeta } from './routeMeta.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteInfo {
  method: HttpMethod;
  /** Express path under /api, e.g. `/requests/:id/review`. */
  path: string;
  /** The mount it belongs to, e.g. `requests` (used as the OpenAPI tag). */
  mount: string;
  /** False when no `authenticate` runs before the handler. */
  requiresAuth: boolean;
  /** Metadata merged from every middleware on the route (router-level first). */
  meta: RouteMeta;
  /** The final handler (the controller). */
  handler: RequestHandler;
}

interface Layer {
  route?: { path: string; methods: Partial<Record<HttpMethod, boolean>>; stack: Layer[] };
  handle: RequestHandler;
}

/** Every route of every feature router, in mount order, with its effective middleware chain. */
export function listRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const [mountPath, router] of API_MOUNTS) {
    const routerLevel: RequestHandler[] = [];
    for (const layer of (router as Router).stack as unknown as Layer[]) {
      if (!layer.route) {
        routerLevel.push(layer.handle);
        continue;
      }
      const chain = [...routerLevel, ...layer.route.stack.map((l) => l.handle)];
      const meta: RouteMeta = {};
      for (const handler of chain) {
        const m = metaOf(handler);
        if (!m) continue;
        if (m.schemas) meta.schemas = { ...meta.schemas, ...m.schemas };
        if (m.roles)
          meta.roles = meta.roles ? meta.roles.filter((r) => m.roles!.includes(r)) : m.roles;
        if (m.access) meta.access = m.access;
      }
      for (const method of Object.keys(layer.route.methods) as HttpMethod[]) {
        routes.push({
          method,
          path: `${mountPath}${layer.route.path}`.replace(/\/$/, '') || mountPath,
          mount: mountPath.slice(1),
          requiresAuth: chain.includes(authenticate),
          meta,
          handler: chain.at(-1)!,
        });
      }
    }
  }
  return routes;
}
