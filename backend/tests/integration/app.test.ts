import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { validate } from '../../src/middleware/validate.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';

const app = createApp();

describe('API error envelope', () => {
  it('returns a consistent 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ success: false, errorCode: 'ROUTE_NOT_FOUND' });
    expect(res.body.requestId).toEqual(res.headers['x-request-id']);
  });

  it('rejects malformed JSON with 400 instead of crashing', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.body.errorCode).toBe('BAD_REQUEST');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows configured origins and refuses others', async () => {
    const allowed = await request(app).get('/api/nope').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(app).get('/api/nope').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('validate middleware + error handler', () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.post(
    '/items',
    validate({ body: z.object({ quantity: z.number().int().positive() }) }),
    (req, res) => res.json({ received: req.body }),
  );
  testApp.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  testApp.get('/forbidden', () => {
    throw AppError.forbidden();
  });
  testApp.use(errorHandler);

  it('returns field-level validation details', async () => {
    const res = await request(testApp).post('/items').send({ quantity: -2 }).expect(400);
    expect(res.body.errorCode).toBe('VALIDATION_FAILED');
    expect(res.body.details[0].field).toBe('body.quantity');
  });

  it('strips unknown fields (mass-assignment guard)', async () => {
    const res = await request(testApp)
      .post('/items')
      .send({ quantity: 2, role: 'ADMIN' })
      .expect(200);
    expect(res.body.received).toEqual({ quantity: 2 });
  });

  it('never leaks internal error details', async () => {
    const res = await request(testApp).get('/boom').expect(500);
    expect(res.body.errorCode).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.body.stack).toBeUndefined();
  });

  it('passes through expected AppErrors with their status', async () => {
    const res = await request(testApp).get('/forbidden').expect(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });
});
