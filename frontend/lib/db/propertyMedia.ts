import type { Collection } from 'mongodb';
import { getDb } from './mongo';

/** What a pinned file is, from the listing flow's point of view. */
export type MediaKind = 'image' | 'document' | 'metadata';

export type PropertyMedia = {
  /** Pinata's IPFS hash. Unique — the same bytes pin to the same CID. */
  cid: string;
  ipfsUri: string;
  kind: MediaKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Lower-cased wallet that uploaded it, when the client supplied one. */
  uploadedBy: string | null;
  /**
   * On-chain property id, or null while the listing is still a draft.
   *
   * Files are pinned BEFORE `registerProperty` returns an id, so there is always
   * a window where a CID exists with nothing to attach it to. `draftId` bridges
   * that window and `claimDraft()` closes it once the transaction confirms.
   */
  propertyId: number | null;
  draftId: string | null;
  chainId: number | null;
  /** Display order within a property's gallery. */
  position: number;
  pinnedAt: Date;
};

const COLLECTION = 'propertyMedia';

let indexesReady: Promise<void> | null = null;

async function collection(): Promise<Collection<PropertyMedia>> {
  const db = await getDb();
  const col = db.collection<PropertyMedia>(COLLECTION);

  // Created once per process, not per request.
  if (!indexesReady) {
    indexesReady = Promise.all([
      // Re-pinning identical bytes yields the same CID, so uniqueness here makes
      // recordPin idempotent rather than duplicating rows.
      col.createIndex({ cid: 1 }, { unique: true }),
      col.createIndex({ propertyId: 1, kind: 1, position: 1 }),
      col.createIndex({ draftId: 1 }),
      col.createIndex({ uploadedBy: 1, pinnedAt: -1 }),
    ]).then(() => undefined);
  }
  await indexesReady;

  return col;
}

/** Records a successful pin. Safe to call twice with the same CID. */
export async function recordPin(
  media: Omit<PropertyMedia, 'pinnedAt' | 'position'> & { position?: number },
): Promise<void> {
  const col = await collection();

  // Append to the end of whatever gallery this belongs to, unless told otherwise.
  let position = media.position;
  if (position === undefined) {
    const scope = media.propertyId !== null
      ? { propertyId: media.propertyId, kind: media.kind }
      : { draftId: media.draftId, kind: media.kind };
    position = await col.countDocuments(scope);
  }

  await col.updateOne(
    { cid: media.cid },
    {
      $set: {
        ipfsUri:     media.ipfsUri,
        kind:        media.kind,
        fileName:    media.fileName,
        contentType: media.contentType,
        sizeBytes:   media.sizeBytes,
        uploadedBy:  media.uploadedBy,
        propertyId:  media.propertyId,
        draftId:     media.draftId,
        chainId:     media.chainId,
      },
      $setOnInsert: { cid: media.cid, position, pinnedAt: new Date() },
    },
    { upsert: true },
  );
}

/**
 * Attaches every file pinned under `draftId` to a now-known property id.
 * Returns how many records were linked.
 */
export async function claimDraft(draftId: string, propertyId: number): Promise<number> {
  const col = await collection();
  const result = await col.updateMany(
    { draftId, propertyId: null },
    { $set: { propertyId } },
  );
  return result.modifiedCount;
}

export async function listForProperty(
  propertyId: number,
  kind?: MediaKind,
): Promise<PropertyMedia[]> {
  const col = await collection();
  return col
    .find(kind ? { propertyId, kind } : { propertyId })
    .sort({ kind: 1, position: 1 })
    .toArray();
}

export async function listForDraft(draftId: string): Promise<PropertyMedia[]> {
  const col = await collection();
  return col.find({ draftId }).sort({ position: 1 }).toArray();
}
