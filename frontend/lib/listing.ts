/**
 * Shared pieces of the "list a property" flow: pinning to IPFS, shaping the
 * metadata document, and deriving the on-chain legal hash.
 *
 * Both the self-serve wizard (`/list-property`) and the admin quick-register
 * modal go through here, so a listing looks identical whoever created it.
 */

import { decodeEventLog, keccak256, toBytes } from 'viem';
import { PropertyRegistryABI } from './contracts/abis';

export type PinResult = { uri: string; cid: string; recorded?: boolean };

/** What a pinned file is, for the off-chain media index. */
export type PinKind = 'image' | 'document' | 'metadata';

/**
 * Off-chain bookkeeping attached to a pin.
 *
 * A listing's files are pinned before `registerProperty` returns an id, so they
 * are grouped under a client-generated `draftId` and linked to the real property
 * id by `claimDraftMedia()` once the transaction confirms.
 */
export type PinContext = {
  kind?: PinKind;
  draftId?: string;
  uploadedBy?: string;
  propertyId?: number;
  chainId?: number;
};

/** Opaque id grouping every file pinned for one in-progress listing. */
export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Pinata caps a free-tier request well above this; the limit is about UX, not the API. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_DOC_BYTES = 20 * 1024 * 1024;

export async function pinFile(
  file: File,
  name: string,
  ctx: PinContext = {},
): Promise<PinResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('name', name);
  form.append('kind', ctx.kind ?? 'image');
  if (ctx.draftId)    form.append('draftId', ctx.draftId);
  if (ctx.uploadedBy) form.append('uploadedBy', ctx.uploadedBy);
  if (ctx.propertyId !== undefined) form.append('propertyId', String(ctx.propertyId));
  if (ctx.chainId !== undefined)    form.append('chainId', String(ctx.chainId));

  const res = await fetch('/api/pin', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Upload failed for ${file.name}`);
  return { uri: data.ipfsUri as string, cid: data.cid as string, recorded: data.recorded };
}

export async function pinJson(
  json: unknown,
  name: string,
  ctx: PinContext = {},
): Promise<PinResult> {
  const res = await fetch('/api/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json, name, kind: ctx.kind ?? 'metadata', ...ctx }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Metadata upload failed');
  return { uri: data.ipfsUri as string, cid: data.cid as string, recorded: data.recorded };
}

/**
 * Links everything pinned under `draftId` to the confirmed property id.
 *
 * Best-effort by design: the listing is already on chain and its metadata URI
 * already points at IPFS, so a failure here costs a gallery row, not the
 * listing. Surfacing it as an error would imply the registration failed.
 */
export async function claimDraftMedia(draftId: string, propertyId: number): Promise<number> {
  try {
    const res = await fetch('/api/media/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, propertyId }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return (data.linked as number) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * The metadata document written to IPFS and pointed at by `metadataURI`.
 *
 * `image` (singular) is the NFT-metadata standard key and stays the FIRST image,
 * so wallets, marketplaces and every existing reader keep working unchanged.
 * `images` carries the full gallery. `location` is mirrored into `attributes` so
 * generic NFT viewers show it too.
 */
export function buildMetadata(input: {
  name: string;
  description: string;
  location: string;
  imageUris: string[];
  documentUris: string[];
}) {
  const images = input.imageUris.filter(Boolean);
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    location: input.location.trim(),
    image: images[0] ?? '',
    images,
    documents: input.documentUris,
    attributes: [{ trait_type: 'location', value: input.location.trim() }],
  };
}

/**
 * `legalHash` is meant to commit to the executed legal pack. When the lister
 * uploads documents we hash the primary document's actual bytes, so anyone can
 * re-download it and verify the hash. With no documents there is nothing to
 * commit to, so we fall back to hashing the metadata URI — a placeholder that
 * at least changes whenever the listing content changes.
 */
export async function legalHashFor(
  primaryDocument: File | null,
  metadataUri: string,
): Promise<`0x${string}`> {
  if (!primaryDocument) return keccak256(toBytes(metadataUri));
  const bytes = new Uint8Array(await primaryDocument.arrayBuffer());
  return keccak256(bytes);
}

/** Blank form shape shared by the create and edit paths. */
export type ListingDraft = {
  name: string;
  description: string;
  location: string;
  totalSupply: string;
  pricePerToken: string;
  spvAddress: string;
  jurisdiction: string;
};

export const EMPTY_DRAFT: ListingDraft = {
  name: '',
  description: '',
  location: '',
  totalSupply: '',
  pricePerToken: '',
  spvAddress: '',
  jurisdiction: '840',
};

/**
 * Reads the new property id out of a `registerProperty` receipt.
 *
 * The id is assigned by the registry's counter, so it is only knowable after the
 * fact — and a receipt can carry logs from unrelated contracts, hence the
 * per-log try/catch rather than assuming a position.
 */
export function propertyIdFromReceipt(
  logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[] }[],
): bigint | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: PropertyRegistryABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === 'PropertyRegistered') {
        return (decoded.args as { propertyId: bigint }).propertyId;
      }
    } catch {
      // Not one of ours — the receipt can carry logs from other contracts.
    }
  }
  return null;
}
