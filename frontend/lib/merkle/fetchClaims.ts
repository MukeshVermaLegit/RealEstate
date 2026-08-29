import type { PublicClient } from 'viem';
import { RentDistributorABI } from '../contracts/abis';

/** Maximum number of periods to probe per property before stopping. */
const MAX_PERIODS_PER_PROPERTY = 20;

/** This app serves its own claim sets; see app/api/rent/claims. */
const DEFAULT_MERKLE_API = '/api/rent/claims';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodClaimsJSON = {
  propertyId: number;
  periodId:   number;
  merkleRoot: string;
  totalRent:  string;
  /** Key is investor address (any casing). */
  claims: Record<string, { amount: string; proof: string[] }>;
};

export type ClaimItem = {
  propertyId: bigint;
  periodId:   bigint;
  amount:     bigint;
  proof:      `0x${string}`[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the off-chain Merkle claim JSON for a single (propertyId, periodId).
 * Returns null when the period does not exist (HTTP 404).
 * Throws for other non-OK responses.
 */
export async function fetchPeriodClaims(
  propertyId: bigint,
  periodId:   number,
  chainId?:   number,
): Promise<PeriodClaimsJSON | null> {
  // Defaults to this app's own route. Point NEXT_PUBLIC_MERKLE_API_URL at a static
  // host instead if the claim sets are ever published outside the app — the URL
  // scheme is the same either way.
  const base = process.env.NEXT_PUBLIC_MERKLE_API_URL || DEFAULT_MERKLE_API;
  const query = chainId ? `?chainId=${chainId}` : '';

  const res = await fetch(`${base}/${propertyId}/${periodId}.json${query}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Merkle API error ${res.status} for period ${periodId}`);

  return res.json() as Promise<PeriodClaimsJSON>;
}

/**
 * Find the claim entry for an investor address in a period JSON.
 * Comparison is case-insensitive to handle checksum differences.
 */
export function getUserClaim(
  periodData: PeriodClaimsJSON,
  address:    string,
): { amount: string; proof: string[] } | null {
  const lower = address.toLowerCase();
  for (const [addr, claim] of Object.entries(periodData.claims)) {
    if (addr.toLowerCase() === lower) return claim;
  }
  return null;
}

/**
 * Fetch all unclaimed rent allocations for `address` across the given properties.
 *
 * Strategy per property:
 * 1. Probe periods 1 → MAX_PERIODS_PER_PROPERTY (stop on 404 = no more periods).
 * 2. Skip periods where the user has no Merkle entry.
 * 3. Simulate `claimRent` on-chain — succeeds → unclaimed; reverts → already claimed.
 */
export async function fetchAllUnclaimedForAddress(
  propertyIds:            bigint[],
  address:                `0x${string}`,
  publicClient:           PublicClient,
  rentDistributorAddress: `0x${string}`,
  chainId?:               number,
): Promise<ClaimItem[]> {
  const unclaimed: ClaimItem[] = [];

  await Promise.all(
    propertyIds.map(async (propertyId) => {
      for (let pid = 1; pid <= MAX_PERIODS_PER_PROPERTY; pid++) {
        let periodData: PeriodClaimsJSON | null;

        try {
          periodData = await fetchPeriodClaims(propertyId, pid, chainId);
        } catch {
          break; // Unexpected API error — stop probing this property
        }

        if (periodData === null) break; // 404 → no more periods

        const userClaim = getUserClaim(periodData, address);
        if (!userClaim) continue; // User not in this period's Merkle tree

        // Simulate claimRent to check if it has already been claimed.
        // A successful simulation means the claim is still valid and uncollected.
        try {
          await publicClient.simulateContract({
            address:      rentDistributorAddress,
            abi:          RentDistributorABI,
            functionName: 'claimRent',
            args: [
              propertyId,
              BigInt(pid),
              BigInt(userClaim.amount),
              userClaim.proof as `0x${string}`[],
            ],
            account: address,
          });

          unclaimed.push({
            propertyId,
            periodId: BigInt(pid),
            amount:   BigInt(userClaim.amount),
            proof:    userClaim.proof as `0x${string}`[],
          });
        } catch {
          // Reverted → AlreadyClaimed or invalid proof — skip silently
        }
      }
    }),
  );

  return unclaimed;
}
