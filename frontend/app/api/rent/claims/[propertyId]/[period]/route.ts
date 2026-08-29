import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from '@/lib/db/mongo';
import { getPeriod } from '@/lib/db/rentPeriods';

/**
 * GET /api/rent/claims/{propertyId}/{periodId}.json?chainId=11155111
 *
 * The Merkle claim set for one rent period, in the shape lib/merkle/fetchClaims
 * expects. The `.json` suffix is kept so the same URL scheme can be served from a
 * static host (S3, IPFS) later without touching the client.
 *
 * A 404 means "no such period" and is how the client stops probing — so an
 * unconfirmed draft must read as absent, not as an empty claim set.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { propertyId: string; period: string } },
) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'MONGODB_URI is not configured' }, { status: 503 });
  }

  const propertyId = Number(params.propertyId);
  const periodId = Number(params.period.replace(/\.json$/, ''));
  const chainId = Number(req.nextUrl.searchParams.get('chainId') ?? 11155111);

  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
  }
  if (!Number.isInteger(periodId) || periodId <= 0) {
    return NextResponse.json({ error: 'Invalid periodId' }, { status: 400 });
  }

  try {
    const period = await getPeriod(chainId, propertyId, periodId);
    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    return NextResponse.json({
      propertyId,
      periodId,
      merkleRoot: period.merkleRoot,
      totalRent: period.totalRent,
      claims: period.claims,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
