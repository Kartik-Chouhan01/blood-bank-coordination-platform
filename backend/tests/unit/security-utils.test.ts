import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { truncateIp } from '../../src/utils/ip.js';
import { escapeRegex } from '../../src/utils/pagination.js';
import { rejectOperatorKeys } from '../../src/middleware/rejectOperatorKeys.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('truncateIp', () => {
  it.each([
    ['203.0.113.77', '203.0.113.0'],
    ['::ffff:198.51.100.9', '198.51.100.0'],
    ['2001:db8:85a3:8d3:1319:8a2e:370:7348', '2001:db8:85a3::'],
    ['not-an-ip', undefined],
    [undefined, undefined],
  ])('%s → %s', (input, expected) => {
    expect(truncateIp(input)).toBe(expected);
  });
});

describe('escapeRegex', () => {
  it('neutralises regex metacharacters', () => {
    expect(new RegExp(escapeRegex('a.*b')).test('aXXb')).toBe(false);
    expect(new RegExp(escapeRegex('a.*b')).test('a.*b')).toBe(true);
  });
});

describe('rejectOperatorKeys', () => {
  const app = express();
  app.use(express.json());
  app.use(rejectOperatorKeys);
  app.all('/', (req, res) => res.json({ query: req.query }));
  app.use(errorHandler);

  it('rejects $-operators nested anywhere in the body', async () => {
    await request(app)
      .post('/')
      .send({ filter: { deep: { $where: 'sleep(1000)' } } })
      .expect(400);
  });

  it('rejects dotted keys (path traversal into sub-documents)', async () => {
    await request(app).post('/').send({ 'profile.role': 'ADMIN' }).expect(400);
  });

  it('rejects $-prefixed query keys', async () => {
    await request(app).get('/?$where=1').expect(400);
  });

  it('relies on Express 5 never building nested objects from bracket syntax', async () => {
    // If this ever changes (e.g. someone enables the "extended" parser), the guard above must
    // be revisited: `email[$ne]=x` would otherwise become { email: { $ne: 'x' } }.
    const res = await request(app).get('/?email[$ne]=x').expect(200);
    expect(res.body.query).toEqual({ 'email[$ne]': 'x' });
  });

  it('lets normal payloads through, including $ inside values', async () => {
    await request(app)
      .post('/')
      .send({ note: 'costs $5', list: [{ a: 1 }] })
      .expect(200);
  });
});
