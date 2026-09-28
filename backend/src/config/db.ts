import mongoose from 'mongoose';
import { logger } from './logger.js';

// Ignore filter fields that are not in the schema. NoSQL-operator injection is blocked earlier,
// at the HTTP boundary (middleware/rejectOperatorKeys) plus zod's strict primitive types.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  const connection = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: connection.connection.name }, 'MongoDB connected');

  if (!(await supportsTransactions())) {
    logger.warn(
      'MongoDB is not running as a replica set: multi-document transactions are unavailable. ' +
        'Blood-unit allocation requires them. Use `npm run dev:db` or MongoDB Atlas.',
    );
  }
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function pingDatabase(timeoutMs = 2_000): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!isDatabaseConnected() || !db) return false;
  try {
    await Promise.race([
      db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function supportsTransactions(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return false;
  const hello = await db.admin().command({ hello: 1 });
  // A replica-set member reports setName; a mongos router reports msg === 'isdbgrid'.
  return Boolean(hello.setName) || hello.msg === 'isdbgrid';
}
