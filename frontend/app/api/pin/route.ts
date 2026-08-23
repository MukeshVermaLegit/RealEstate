import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from '@/lib/db/mongo';
import { recordPin, type MediaKind } from '@/lib/db/propertyMedia';

const PINATA_BASE = 'https://api.pinata.cloud';

function getJWT(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error('PINATA_JWT environment variable is not set');
  return jwt;
}

/**
 * POST /api/pin
 *
 * Accepts two content types:
 *
 * 1. multipart/form-data  — pin a file (image, PDF, etc.)
 *    Field: "file"  (File / Blob)
 *    Field: "name"  (optional display name)
 *    Returns: { ipfsUri: "ipfs://<CID>", cid: "<CID>" }
 *
 * 2. application/json     — pin a JSON object
 *    Body: { json: {...}, name?: string }
 *    Returns: { ipfsUri: "ipfs://<CID>", cid: "<CID>" }
 */
const MEDIA_KINDS: MediaKind[] = ['image', 'document', 'metadata'];

function asKind(value: unknown, fallback: MediaKind): MediaKind {
  return MEDIA_KINDS.includes(value as MediaKind) ? (value as MediaKind) : fallback;
}

function asInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Index a pin in MongoDB, best-effort.
 *
 * Deliberately never throws: by the time this runs the bytes are already on IPFS
 * and paid for. Failing the request over a bookkeeping error would tell the
 * client the upload failed and get the same file pinned again. The response
 * carries `recorded` so the caller can tell the difference.
 */
async function tryRecord(args: {
  cid: string;
  ipfsUri: string;
  kind: MediaKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  propertyId: number | null;
  draftId: string | null;
  chainId: number | null;
}): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    await recordPin(args);
    return true;
  } catch (err) {
    console.error('[pin] failed to index media in MongoDB:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  try {
    const jwt = getJWT();

    // ── File upload ────────────────────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      const name = formData.get('name')?.toString() ?? 'upload';
      const kind = asKind(formData.get('kind')?.toString(), 'image');
      const draftId = formData.get('draftId')?.toString() || null;
      const uploadedBy = formData.get('uploadedBy')?.toString()?.toLowerCase() || null;
      const propertyId = asInt(formData.get('propertyId')?.toString());
      const chainId = asInt(formData.get('chainId')?.toString());

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
      }

      const pinForm = new FormData();
      pinForm.append('file', file, file.name);
      pinForm.append(
        'pinataMetadata',
        JSON.stringify({ name }),
      );
      pinForm.append(
        'pinataOptions',
        JSON.stringify({ cidVersion: 1 }),
      );

      const res = await fetch(`${PINATA_BASE}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: pinForm,
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Pinata error: ${res.status} ${text}` },
          { status: res.status },
        );
      }

      const data = await res.json() as { IpfsHash: string };
      const recorded = await tryRecord({
        cid:         data.IpfsHash,
        ipfsUri:     `ipfs://${data.IpfsHash}`,
        kind,
        fileName:    file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes:   file.size,
        uploadedBy,
        propertyId,
        draftId,
        chainId,
      });

      return NextResponse.json({
        ipfsUri: `ipfs://${data.IpfsHash}`,
        cid:     data.IpfsHash,
        recorded,
      });
    }

    // ── JSON pin ──────────────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await req.json() as {
        json: unknown;
        name?: string;
        kind?: string;
        draftId?: string;
        uploadedBy?: string;
        propertyId?: number | string;
        chainId?: number | string;
      };

      if (!body.json) {
        return NextResponse.json({ error: 'Missing "json" field' }, { status: 400 });
      }

      const res = await fetch(`${PINATA_BASE}/pinning/pinJSONToIPFS`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pinataContent:  body.json,
          pinataMetadata: { name: body.name ?? 'metadata.json' },
          pinataOptions:  { cidVersion: 1 },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Pinata error: ${res.status} ${text}` },
          { status: res.status },
        );
      }

      const data = await res.json() as { IpfsHash: string };
      const serialised = JSON.stringify(body.json);
      const recorded = await tryRecord({
        cid:         data.IpfsHash,
        ipfsUri:     `ipfs://${data.IpfsHash}`,
        kind:        asKind(body.kind, 'metadata'),
        fileName:    body.name ?? 'metadata.json',
        contentType: 'application/json',
        sizeBytes:   serialised.length,
        uploadedBy:  body.uploadedBy?.toLowerCase() ?? null,
        propertyId:  asInt(body.propertyId),
        draftId:     body.draftId ?? null,
        chainId:     asInt(body.chainId),
      });

      return NextResponse.json({
        ipfsUri: `ipfs://${data.IpfsHash}`,
        cid:     data.IpfsHash,
        recorded,
      });
    }

    return NextResponse.json(
      { error: 'Unsupported content-type. Use multipart/form-data or application/json' },
      { status: 415 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
