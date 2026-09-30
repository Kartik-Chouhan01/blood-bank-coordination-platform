import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { resetSettingsCache } from '../../src/modules/settings/settings.service.js';

/** Connects the test file to its own database on the shared replica set and wipes it between tests. */
export function useTestDatabase() {
  beforeAll(async () => {
    const uri = new URL(inject('mongoUri'));
    uri.pathname = `/test_${randomUUID().slice(0, 8)}`;
    await connectDatabase(uri.toString());
    // Build indexes up front so unique constraints are enforced from the first test.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  beforeEach(async () => {
    // Administrator overrides must not leak from one test into the next.
    resetSettingsCache();
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await disconnectDatabase();
  });
}
