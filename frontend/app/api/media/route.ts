import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from '@/lib/db/mongo';
import { listForDraft, listForProperty, type MediaKind } from '@/lib/db/propertyMedia';

/**
 * GET /api/media?propertyId=1[&kind=image]
 * GET /api/media?draftId=<uuid>
 *
 * The off-chain index of everything pinned for a listing. IPFS remains the
 * source of truth for the bytes; this is what makes them queryable without
 * fetching metadata JSON from a gateway first.
 */
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'MONGODB_URI is not configured', media: [] },
      { status: 503 },
    );
  }

  const params = req.nextUrl.searchParams;
  const propertyIdRaw = params.get('propertyId');
  const draftId = params.get('draftId');
  const kind = params.get('kind') as MediaKind | null;

  try {
    if (propertyIdRaw !== null) {
      const propertyId = Number(propertyIdRaw);
      if (!Number.isInteger(propertyId) || propertyId <= 0) {
        return NextResponse.json({ error: 'propertyId must be a positive integer' }, { status: 400 });
      }
      const media = await listForProperty(propertyId, kind ?? undefined);
      return NextResponse.json({ media });
    }

    if (draftId) {
      return NextResponse.json({ media: await listForDraft(draftId) });
    }

    return NextResponse.json({ error: 'Provide propertyId or draftId' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
