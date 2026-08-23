import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from '@/lib/db/mongo';
import { claimDraft } from '@/lib/db/propertyMedia';

/**
 * POST /api/media/claim  { draftId, propertyId }
 *
 * Called once `registerProperty` confirms and the on-chain id is known. Files
 * pinned during the wizard were recorded against a draft id because no property
 * id existed yet; this links them.
 *
 * Only rows still awaiting a property are touched, so replaying it is harmless
 * and it can never re-point media that already belongs to another listing.
 */
export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'MONGODB_URI is not configured' }, { status: 503 });
  }

  try {
    const body = await req.json() as { draftId?: string; propertyId?: number | string };
    const draftId = body.draftId;
    const propertyId = Number(body.propertyId);

    if (!draftId) {
      return NextResponse.json({ error: 'draftId is required' }, { status: 400 });
    }
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return NextResponse.json({ error: 'propertyId must be a positive integer' }, { status: 400 });
    }

    const linked = await claimDraft(draftId, propertyId);
    return NextResponse.json({ linked });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
