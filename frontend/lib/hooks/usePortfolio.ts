import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { PropertyTokenABI } from '../contracts/abis';
import { usePropertyCount, useProperties } from './useProperties';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type Holding = {
  propertyId:    bigint;
  tokenAddress:  `0x${string}`;
  balance:       bigint;
  totalSupply:   bigint;
  pricePerToken: bigint;
  lockupExpiry:  bigint;
  metadataURI:   string;
};

export function useHoldings(address: `0x${string}` | undefined): {
  holdings:  Holding[];
  isLoading: boolean;
} {
  const { data: countData, isPending: countPending } = usePropertyCount();
  const count = Number(countData ?? 0n);
  const { properties, isPending: propertiesPending } = useProperties(count);

  // Only properties that have a token deployed
  const validProps = useMemo(
    () => properties.filter((p) => p.tokenAddress !== ZERO_ADDRESS),
    [properties],
  );

  // Two calls per property: balanceOf + lockupExpiry
  const contracts = useMemo(() => {
    if (!address || validProps.length === 0) return [];
    return validProps.flatMap((p) => [
      {
        address:      p.tokenAddress,
        abi:          PropertyTokenABI,
        functionName: 'balanceOf' as const,
        args:         [address] as const,
      },
      {
        address:      p.tokenAddress,
        abi:          PropertyTokenABI,
        functionName: 'lockupExpiry' as const,
        args:         [address] as const,
      },
    ]);
  }, [validProps, address]);

  const { data: tokenData, isPending: tokenPending } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const holdings = useMemo<Holding[]>(() => {
    if (!tokenData || validProps.length === 0) return [];

    return validProps.reduce<Holding[]>((acc, prop, i) => {
      const balance      = (tokenData[i * 2]?.result     as bigint | undefined) ?? 0n;
      const lockupExpiry = (tokenData[i * 2 + 1]?.result as bigint | undefined) ?? 0n;

      if (balance === 0n) return acc; // Filter out zero-balance properties

      acc.push({
        propertyId:    prop.propertyId,
        tokenAddress:  prop.tokenAddress,
        balance,
        totalSupply:   prop.totalSupply,
        pricePerToken: prop.pricePerToken,
        lockupExpiry,
        metadataURI:   prop.metadataURI,
      });
      return acc;
    }, []);
  }, [tokenData, validProps]);

  return {
    holdings,
    isLoading: countPending || propertiesPending || tokenPending,
  };
}
