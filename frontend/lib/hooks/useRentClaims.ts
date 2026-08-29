import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWriteContract, usePublicClient } from 'wagmi';
import { RentDistributorABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';
import {
  fetchAllUnclaimedForAddress,
  type ClaimItem,
} from '../merkle/fetchClaims';

export type { ClaimItem };

// ─── useRentClaims ────────────────────────────────────────────────────────────

/**
 * Fetches all unclaimed rent items for `address` across the given `propertyIds`.
 * Uses @tanstack/react-query so results are cached and can be invalidated after
 * a successful claim.
 */
export function useRentClaims(
  address:     `0x${string}` | undefined,
  propertyIds: bigint[],
): {
  claims:         ClaimItem[];
  totalClaimable: bigint;
  isLoading:      boolean;
  refetch:        () => void;
} {
  const { addresses, chainId } = useContracts();
  const publicClient   = usePublicClient();

  const enabled = !!address && propertyIds.length > 0 && !!publicClient;

  const { data, isPending, refetch } = useQuery({
    // Include stable string versions of propertyIds so the key updates correctly
    queryKey: ['rent-claims', address, chainId, propertyIds.map(String)],
    queryFn:  () =>
      fetchAllUnclaimedForAddress(
        propertyIds,
        address!,
        publicClient!,
        addresses.rentDistributor,
        chainId,
      ),
    enabled,
    staleTime: 30_000,
  });

  const claims         = data ?? [];
  const totalClaimable = claims.reduce((sum, c) => sum + c.amount, 0n);

  // Disabled queries stay `pending`; a holder with no properties is not loading.
  return { claims, totalClaimable, isLoading: enabled && isPending, refetch };
}

// ─── useClaimRent ─────────────────────────────────────────────────────────────

/**
 * Returns helpers to execute single or batch rent claims, and to invalidate the
 * cached claims list after a successful transaction.
 */
export function useClaimRent() {
  const { addresses }        = useContracts();
  const { writeContractAsync } = useWriteContract();
  const queryClient          = useQueryClient();

  const claimSingle = useCallback(
    (item: ClaimItem) =>
      writeContractAsync({
        address:      addresses.rentDistributor,
        abi:          RentDistributorABI,
        functionName: 'claimRent',
        args:         [item.propertyId, item.periodId, item.amount, item.proof],
      }),
    [addresses.rentDistributor, writeContractAsync],
  );

  const claimMultiple = useCallback(
    (items: ClaimItem[]) =>
      writeContractAsync({
        address:      addresses.rentDistributor,
        abi:          RentDistributorABI,
        functionName: 'claimMultiple',
        args: [
          items.map((i) => i.propertyId),
          items.map((i) => i.periodId),
          items.map((i) => i.amount),
          items.map((i) => i.proof),
        ],
      }),
    [addresses.rentDistributor, writeContractAsync],
  );

  /** Invalidates the rent-claims query so the UI re-fetches after a claim. */
  const invalidateClaims = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['rent-claims'] }),
    [queryClient],
  );

  return { claimSingle, claimMultiple, invalidateClaims };
}
