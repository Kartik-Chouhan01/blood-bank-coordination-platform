import request from 'supertest';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { useTestDatabase } from '../helpers/testDb.js';

useTestDatabase();
const app = createApp();

describe('GET /api/health', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await request(app).get('/api/health').expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok', checks: { database: 'up' } },
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('confirms the test database supports transactions', async () => {
    const session = await mongoose.startSession();
    await expect(session.withTransaction(async () => {})).resolves.not.toThrow();
    await session.endSession();
  });
});
