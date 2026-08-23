#!/usr/bin/env node
/**
 * Verifies the Atlas connection and reports what the media index looks like.
 * Run from the frontend directory:  node scripts/check-mongo.mjs
 *
 * Reads MONGODB_URI / MONGODB_DB from .env.local so it checks exactly what the
 * app will use.
 */
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    console.log('No .env.local found — relying on the ambient environment.');
  }
}

loadEnvLocal();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('✗ MONGODB_URI is not set. Add it to frontend/.env.local.');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || 'RealEstate';
// Redact credentials before printing anything.
console.log(`URI:      ${uri.replace(/\/\/[^@]*@/, '//***:***@')}`);
console.log(`Database: ${dbName}`);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  console.log('✓ Connected and authenticated.');

  const names = (await db.listCollections().toArray()).map((c) => c.name);
  console.log(`Collections: ${names.length ? names.join(', ') : '(none yet)'}`);

  if (names.includes('propertyMedia')) {
    const col = db.collection('propertyMedia');
    const total = await col.countDocuments();
    const unclaimed = await col.countDocuments({ propertyId: null });
    console.log(`propertyMedia: ${total} document(s), ${unclaimed} not yet linked to a property`);
    const indexes = await col.indexes();
    console.log(`Indexes: ${indexes.map((i) => i.name).join(', ')}`);
  } else {
    console.log('propertyMedia does not exist yet — it is created on the first upload.');
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  if (/timed out|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
    console.error('\nMost likely the Atlas IP allowlist. Atlas → Network Access → add your');
    console.error('current IP (or 0.0.0.0/0 for local development only).');
  }
  if (/auth|Authentication/i.test(err.message)) {
    console.error('\nCheck the username/password in the URI. A password containing @ : / ? # &');
    console.error('or % must be percent-encoded.');
  }
  process.exitCode = 1;
} finally {
  await client.close();
}
