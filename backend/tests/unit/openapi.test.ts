import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { buildOpenApiDocument } from '../../src/docs/openapi.js';
import { OPENAPI_PATH, serializeOpenApi } from '../../src/docs/openapiFile.js';
import { listRoutes } from '../../src/utils/routeTable.js';

type Operation = { security: unknown[]; operationId: string; requestBody?: unknown };

describe('OpenAPI document', () => {
  const document = buildOpenApiDocument('0.1.0');
  const operations = Object.values(document.paths).flatMap(
    (methods) => Object.values(methods) as Operation[],
  );

  it('documents every route, with unique operation ids', () => {
    expect(operations).toHaveLength(listRoutes().length);
    const ids = operations.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks exactly the unauthenticated routes as public', () => {
    const publicRoutes = listRoutes().filter((r) => !r.requiresAuth).length;
    expect(operations.filter((o) => o.security.length === 0)).toHaveLength(publicRoutes);
    expect(publicRoutes).toBeLessThan(15);
  });

  it('describes request bodies from the validation schemas', () => {
    const login = document.paths['/auth/login']!.post as { requestBody: { content: object } };
    expect(JSON.stringify(login.requestBody.content)).toMatch(/"email"/);
  });

  it('matches the committed docs/openapi.json (run `npm run docs:openapi -w @bbms/backend`)', () => {
    const committed = readFileSync(OPENAPI_PATH, 'utf8');
    expect(serializeOpenApi(buildOpenApiDocument(JSON.parse(committed).info.version))).toBe(
      committed,
    );
  });

  it('is served in non-production environments', async () => {
    const res = await request(createApp()).get('/api/docs/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
  });
});
