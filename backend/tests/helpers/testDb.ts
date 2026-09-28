import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';

/** Connects the test file to its own database on the shared replica set and wipes it between tests. */
export function useTestDatabase() {
  beforeAll(async () => {
    const uri = new URL(inject('mongoUri'));
    uri.pathname = `/test_${randomUUID().slice(0, 8)}`;
    await connectDatabase(uri.toString());
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await disconnectDatabase();
  });
}
