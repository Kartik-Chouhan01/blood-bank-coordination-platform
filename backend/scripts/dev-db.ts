/**
 * Zero-install local MongoDB for development: a single-node replica set (so transactions work)
 * with data persisted in backend/.data/db. Use MongoDB Atlas or a native install instead if preferred.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.DEV_DB_PORT ?? 27017);
const dbPath = resolve(import.meta.dirname, '../.data/db');
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: PORT, dbPath }],
});

console.log(`\nLocal MongoDB replica set running.
  URI:  mongodb://127.0.0.1:${PORT}/bbms?replicaSet=rs0
  Data: ${dbPath}
Press Ctrl+C to stop (data is kept).\n`);

const stop = async () => {
  await replSet.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
