import { MongoClient, type Db } from 'mongodb';

/**
 * Shared Atlas connection.
 *
 * The client is cached on `globalThis` because Next.js hot-reloads modules in
 * development: without the cache every edit opens a fresh pool and Atlas starts
 * refusing connections after a few dozen reloads.
 */
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const DEFAULT_DB = 'RealEstate';

function uri(): string {
  const value = process.env.MONGODB_URI;
  if (!value) {
    throw new Error(
      'MONGODB_URI is not set. Add the Atlas connection string to frontend/.env.local.',
    );
  }
  return value;
}

export function isConfigured(): boolean {
  return !!process.env.MONGODB_URI;
}

function clientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri(), {
      // Fail fast instead of hanging for 30s when the Atlas IP allowlist blocks us —
      // by far the most common cause of "it just spins" in local development.
      serverSelectionTimeoutMS: 8_000,
    }).connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || DEFAULT_DB);
}
