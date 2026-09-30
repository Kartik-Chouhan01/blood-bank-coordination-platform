import { z } from 'zod';
import { APP_NAME, ERROR_CODES, ROLE_LABELS, type Role } from '@bbms/shared';
import { REFRESH_COOKIE } from '../modules/auth/authCookies.js';
import { listRoutes, type RouteInfo } from '../utils/routeTable.js';

type JsonSchema = Record<string, unknown>;

/** Input-side JSON Schema (what a client sends); transforms are described as their input type. */
const toSchema = (schema: z.ZodType): JsonSchema => {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
  delete json.$schema;
  return json;
};

const humanize = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** `/requests/:id/review` → `/requests/{id}/review` */
const openApiPath = (path: string) => path.replace(/:([A-Za-z]+)/g, '{$1}');

function parameters(route: RouteInfo) {
  const out: JsonSchema[] = [];
  for (const where of ['path', 'query'] as const) {
    const schema = route.meta.schemas?.[where === 'path' ? 'params' : 'query'];
    const names =
      where === 'path' ? [...route.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]!) : [];
    const json = schema ? toSchema(schema) : null;
    const props = (json?.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((json?.required as string[] | undefined) ?? []);
    const keys =
      where === 'path' ? [...new Set([...names, ...Object.keys(props)])] : Object.keys(props);
    for (const name of keys) {
      out.push({
        name,
        in: where,
        required:
          where === 'path' ? true : required.has(name) && props[name]?.default === undefined,
        schema: props[name] ?? { type: 'string' },
      });
    }
  }
  return out;
}

function describeAccess(route: RouteInfo) {
  if (!route.requiresAuth) return 'Public — no sign-in required.';
  const roles = route.meta.roles;
  const who =
    roles && roles.length < 4
      ? `Roles: ${roles.map((r: Role) => ROLE_LABELS[r]).join(', ')}.`
      : 'Any signed-in user.';
  return [who, route.meta.access].filter(Boolean).join(' ');
}

function operation(route: RouteInfo, operationIds: Set<string>) {
  let operationId = `${route.mount}.${route.handler.name || route.method}`;
  for (let i = 2; operationIds.has(operationId); i += 1) operationId = `${operationId}${i}`;
  operationIds.add(operationId);

  const body = route.meta.schemas?.body;
  const responses: Record<string, unknown> = {
    '2XX': { $ref: '#/components/responses/Success' },
    ...(body || route.meta.schemas?.query || route.meta.schemas?.params
      ? { '400': { $ref: '#/components/responses/Error' } }
      : {}),
    ...(route.requiresAuth && {
      '401': { $ref: '#/components/responses/Error' },
      '403': { $ref: '#/components/responses/Error' },
    }),
    '429': { $ref: '#/components/responses/Error' },
  };
  return {
    tags: [route.mount],
    operationId,
    summary: humanize(route.handler.name || route.method),
    description: describeAccess(route),
    security: route.requiresAuth ? [{ bearerAuth: [] }] : [],
    parameters: parameters(route),
    ...(body && {
      requestBody: {
        required: true,
        content: { 'application/json': { schema: toSchema(body) } },
      },
    }),
    responses,
  };
}

/**
 * OpenAPI 3.1 description generated from the running route table: paths, methods, request
 * schemas (the same zod schemas that validate requests) and access rules (the same middleware
 * that enforces them). Response bodies are described by the shared envelope; their exact types
 * are the `@bbms/shared` API interfaces.
 */
export function buildOpenApiDocument(version: string) {
  const operationIds = new Set<string>();
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of listRoutes()) {
    const path = openApiPath(route.path);
    paths[path] ??= {};
    paths[path][route.method] = operation(route, operationIds);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${APP_NAME} API`,
      version,
      description:
        'Blood bank management and emergency blood coordination. Every response uses the envelope ' +
        '`{ success, data, meta? }` or `{ success: false, message, errorCode, details?, requestId? }`. ' +
        'Response `data` types are the interfaces exported by `@bbms/shared`. This document is ' +
        'generated from the route table (`npm run docs:openapi -w @bbms/backend`).',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Access token from /auth/login, /auth/register/* or /auth/refresh (15 minutes).',
        },
        refreshCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: REFRESH_COOKIE,
          description:
            'httpOnly refresh cookie, sent only to /api/auth; used by /auth/refresh and /auth/logout.',
        },
      },
      schemas: {
        Success: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { const: true },
            data: {},
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          required: ['success', 'message', 'errorCode'],
          properties: {
            success: { const: false },
            message: { type: 'string' },
            errorCode: { enum: Object.values(ERROR_CODES) },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: { field: { type: 'string' }, message: { type: 'string' } },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
      responses: {
        Success: {
          description: 'Success',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } },
        },
        Error: {
          description: 'Failure (see errorCode)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    paths,
  };
}
