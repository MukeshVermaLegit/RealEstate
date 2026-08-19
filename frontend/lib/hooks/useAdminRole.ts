'use client';

import { useAccount, useReadContract } from 'wagmi';
import { zeroAddress } from 'viem';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PropertyRegistryABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';

/** bytes32(0) — the OpenZeppelin DEFAULT_ADMIN_ROLE constant */
const DEFAULT_ADMIN_ROLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * Returns whether the connected wallet holds DEFAULT_ADMIN_ROLE on
 * PropertyRegistry.  Used to gate the /admin route.
 */
export function useAdminRole(): { isAdmin: boolean; isLoading: boolean } {
  const { address } = useAccount();
  const { addresses } = useContracts();

  const { data, isLoading } = useReadContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'hasRole',
    args: [DEFAULT_ADMIN_ROLE, address ?? zeroAddress],
    query: { enabled: !!address },
  });

  return { isAdmin: data ?? false, isLoading };
}

/**
 * Convenience hook: redirects to `redirectTo` (default: '/') if the
 * connected wallet is not an admin once the role check completes.
 */
export function useRequireAdmin(redirectTo = '/') {
  const { isAdmin, isLoading } = useAdminRole();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace(redirectTo);
    }
  }, [isAdmin, isLoading, redirectTo, router]);

  return { isAdmin, isLoading };
}
