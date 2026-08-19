import { NextRequest, NextResponse } from 'next/server';

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
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  try {
    const jwt = getJWT();

    // ── File upload ────────────────────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      const name = formData.get('name')?.toString() ?? 'upload';

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
      return NextResponse.json({
        ipfsUri: `ipfs://${data.IpfsHash}`,
        cid:     data.IpfsHash,
      });
    }

    // ── JSON pin ──────────────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await req.json() as { json: unknown; name?: string };

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
      return NextResponse.json({
        ipfsUri: `ipfs://${data.IpfsHash}`,
        cid:     data.IpfsHash,
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
