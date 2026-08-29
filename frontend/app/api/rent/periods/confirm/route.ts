import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from '@/lib/db/mongo';
import { confirmPeriod, getDraft } from '@/lib/db/rentPeriods';

/**
 * POST /api/rent/periods/confirm  { draftId, periodId, txHash }
 *
 * Called once `depositRent` confirms and the contract-assigned period id is
 * known. Until this runs the claim set exists but is unreachable, because
 * investors look it up by (propertyId, periodId).
 *
 * Only an unconfirmed draft is matched, so replaying it is harmless.
 */
export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'MONGODB_URI is not configured' }, { status: 503 });
  }

  try {
    const body = await req.json() as {
      draftId?: string;
      periodId?: number | string;
      txHash?: string;
    };

    const draftId = body.draftId;
    const periodId = Number(body.periodId);

    if (!draftId) {
      return NextResponse.json({ error: 'draftId is required' }, { status: 400 });
    }
    if (!Number.isInteger(periodId) || periodId <= 0) {
      return NextResponse.json({ error: 'periodId must be a positive integer' }, { status: 400 });
    }

    const confirmed = await confirmPeriod(draftId, periodId, body.txHash ?? null);

    if (!confirmed) {
      // Either the draft does not exist or it was already confirmed. Report which,
      // so a retry after a dropped response is not mistaken for a lost claim set.
      const existing = await getDraft(draftId);
      if (!existing) {
        return NextResponse.json({ error: `No draft ${draftId}` }, { status: 404 });
      }
      return NextResponse.json({ confirmed: false, periodId: existing.periodId, alreadyConfirmed: true });
    }

    return NextResponse.json({ confirmed: true, periodId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
