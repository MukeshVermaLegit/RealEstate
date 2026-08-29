import type { Collection } from 'mongodb';
import { getDb } from './mongo';

/**
 * A rent period's Merkle claim set.
 *
 * The root has to be passed to `depositRent`, but the contract only assigns the
 * period id inside that same transaction — so a document is written BEFORE the
 * deposit (keyed by `draftId`, with `periodId: null`) and gets its id attached
 * once the receipt is in. That mirrors how the listing flow bridges pinned media
 * to a not-yet-existing property id.
 */
export type RentPeriodDoc = {
  draftId: string;
  chainId: number;
  propertyId: number;
  /** null until the deposit confirms. */
  periodId: number | null;

  merkleRoot: string;
  /** All amounts are payment-token wei as decimal strings. */
  totalRent: string;
  allocated: string;
  unallocated: string;
  snapshotBlock: string;
  pastTotalSupply: string;
  excludedVotes: string;
  /** Addresses deliberately left out of the tree (escrow contracts etc.). */
  excludedAddresses: string[];

  /** Lower-cased investor address => allocation + proof. */
  claims: Record<string, { amount: string; proof: string[] }>;

  txHash: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
};

const COLLECTION = 'rentPeriods';

let indexesReady: Promise<void> | null = null;

async function collection(): Promise<Collection<RentPeriodDoc>> {
  const db = await getDb();
  const col = db.collection<RentPeriodDoc>(COLLECTION);

  if (!indexesReady) {
    indexesReady = Promise.all([
      col.createIndex({ draftId: 1 }, { unique: true }),
      // Partial so the many unconfirmed drafts (periodId: null) don't collide.
      col.createIndex(
        { chainId: 1, propertyId: 1, periodId: 1 },
        { unique: true, partialFilterExpression: { periodId: { $type: 'int' } } },
      ),
      col.createIndex({ chainId: 1, propertyId: 1, createdAt: -1 }),
    ]).then(() => undefined);
  }
  await indexesReady;

  return col;
}

export async function createDraftPeriod(
  doc: Omit<RentPeriodDoc, 'createdAt' | 'confirmedAt' | 'periodId' | 'txHash'>,
): Promise<void> {
  const col = await collection();
  await col.insertOne({
    ...doc,
    periodId: null,
    txHash: null,
    createdAt: new Date(),
    confirmedAt: null,
  });
}

/**
 * Attach the on-chain period id once `depositRent` confirms.
 *
 * Only an unconfirmed draft is matched, so replaying the call is harmless and it
 * can never re-point a period that was already settled.
 */
export async function confirmPeriod(
  draftId: string,
  periodId: number,
  txHash: string | null,
): Promise<boolean> {
  const col = await collection();
  const res = await col.updateOne(
    { draftId, periodId: null },
    { $set: { periodId, txHash, confirmedAt: new Date() } },
  );
  return res.modifiedCount > 0;
}

export async function getPeriod(
  chainId: number,
  propertyId: number,
  periodId: number,
): Promise<RentPeriodDoc | null> {
  const col = await collection();
  return col.findOne({ chainId, propertyId, periodId });
}

export async function getDraft(draftId: string): Promise<RentPeriodDoc | null> {
  const col = await collection();
  return col.findOne({ draftId });
}

/** Every period recorded for a property, newest first. Drafts included. */
export async function listPeriods(
  chainId: number,
  propertyId: number,
): Promise<RentPeriodDoc[]> {
  const col = await collection();
  return col.find({ chainId, propertyId }).sort({ createdAt: -1 }).toArray();
}
