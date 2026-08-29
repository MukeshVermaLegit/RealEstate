import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from '@/lib/db/mongo';
import { createDraftPeriod, listPeriods } from '@/lib/db/rentPeriods';
import { CONTRACT_ADDRESSES, type SupportedChainId } from '@/lib/contracts/addresses';
import { allocate } from '@/lib/merkle/allocate';
import { buildTree } from '@/lib/merkle/tree';
import { serverClient } from '@/lib/server/chain';
import { buildSnapshot } from '@/lib/server/snapshot';

const SUPPORTED: SupportedChainId[] = [11155111, 31337];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * GET /api/rent/periods?chainId=11155111&propertyId=1
 *
 * Every period recorded for a property, drafts included, newest first. Claim
 * tables are stripped — they can be large and the admin view only needs totals.
 */
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'MONGODB_URI is not configured', periods: [] }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const chainId = Number(params.get('chainId'));
  const propertyId = Number(params.get('propertyId'));

  if (!SUPPORTED.includes(chainId as SupportedChainId)) return badRequest('Unsupported chainId');
  if (!Number.isInteger(propertyId) || propertyId <= 0) return badRequest('propertyId must be a positive integer');

  try {
    const periods = await listPeriods(chainId, propertyId);
    return NextResponse.json({
      periods: periods.map(({ claims, ...rest }) => ({
        ...rest,
        claimCount: Object.keys(claims).length,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * POST /api/rent/periods  { chainId, propertyId, totalRent, snapshotBlock }
 *
 * Builds the Merkle tree for a rent period and stores it as a DRAFT.
 *
 * This has to run before `depositRent`, because the root is one of that call's
 * arguments — but the period id is only assigned inside that transaction. So the
 * draft is keyed by `draftId` and POST /api/rent/periods/confirm attaches the id
 * once the receipt lands.
 *
 * Nothing here is trusted by the chain: the contract independently caps every
 * claim at the holder's snapshot entitlement, so a wrong tree can under-pay but
 * never over-pay.
 */
export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'MONGODB_URI is not configured' }, { status: 503 });
  }

  try {
    const body = await req.json() as {
      chainId?: number;
      propertyId?: number | string;
      totalRent?: string;
      snapshotBlock?: string | number;
    };

    const chainId = Number(body.chainId);
    const propertyId = Number(body.propertyId);

    if (!SUPPORTED.includes(chainId as SupportedChainId)) return badRequest('Unsupported chainId');
    if (!Number.isInteger(propertyId) || propertyId <= 0) return badRequest('propertyId must be a positive integer');

    let totalRent: bigint;
    let snapshotBlock: bigint;
    try {
      totalRent = BigInt(body.totalRent ?? '0');
      snapshotBlock = BigInt(body.snapshotBlock ?? '0');
    } catch {
      return badRequest('totalRent and snapshotBlock must be integer strings');
    }
    if (totalRent <= 0n) return badRequest('totalRent must be positive');
    if (snapshotBlock <= 0n) return badRequest('snapshotBlock must be positive');

    const client = serverClient(chainId);

    // depositRent demands a block strictly in the past; catch it here rather than
    // letting the admin approve USDC and then hit an opaque revert.
    const head = await client.getBlockNumber();
    if (snapshotBlock >= head) {
      return badRequest(`snapshotBlock must be in the past (current head is ${head})`);
    }

    const snapshot = await buildSnapshot(client, chainId as SupportedChainId, BigInt(propertyId), snapshotBlock);

    // Contracts that custody tokens hold votes at the snapshot but have no way to
    // call claimRent, so giving them a leaf would strand that rent. Their share is
    // deliberately left unallocated — see allocate() on why it cannot be shared out.
    const addresses = CONTRACT_ADDRESSES[chainId as SupportedChainId];
    const excluded = new Set<string>([addresses.marketplace, addresses.rentDistributor]);

    const result = allocate(snapshot.holders, totalRent, snapshot.pastTotalSupply, excluded);

    if (result.allocations.length === 0) {
      return badRequest(
        'No eligible holders at that snapshot — the whole supply is held by excluded contracts',
      );
    }

    const tree = buildTree(result.allocations);

    const claims: Record<string, { amount: string; proof: string[] }> = {};
    result.allocations.forEach((a, i) => {
      claims[a.investor.toLowerCase()] = { amount: a.amount, proof: tree.proofFor(i) };
    });

    const draftId = randomUUID();

    await createDraftPeriod({
      draftId,
      chainId,
      propertyId,
      merkleRoot: tree.root,
      totalRent: totalRent.toString(),
      allocated: result.allocated.toString(),
      unallocated: result.unallocated.toString(),
      snapshotBlock: snapshotBlock.toString(),
      pastTotalSupply: snapshot.pastTotalSupply.toString(),
      excludedVotes: result.excludedVotes.toString(),
      excludedAddresses: [...excluded],
      claims,
    });

    return NextResponse.json({
      draftId,
      merkleRoot: tree.root,
      tokenAddress: snapshot.tokenAddress,
      snapshotBlock: snapshotBlock.toString(),
      pastTotalSupply: snapshot.pastTotalSupply.toString(),
      totalRent: totalRent.toString(),
      allocated: result.allocated.toString(),
      unallocated: result.unallocated.toString(),
      excludedVotes: result.excludedVotes.toString(),
      holderCount: result.allocations.length,
      allocations: result.allocations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
