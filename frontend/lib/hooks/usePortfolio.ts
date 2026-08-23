import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { PropertyTokenABI } from '../contracts/abis';
import { usePropertyCount, useProperties } from './useProperties';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type Holding = {
  propertyId:    bigint;
  tokenAddress:  `0x${string}`;
  balance:       bigint;
  /** Token wei, so it is directly comparable with `balance`. */
  totalSupply:   bigint;
  pricePerToken: bigint;
  lockupExpiry:  bigint;
  metadataURI:   string;
  symbol:        string;
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

  // Three calls per property: balanceOf + lockupExpiry + symbol
  const CALLS_PER_PROPERTY = 3;
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
      {
        address:      p.tokenAddress,
        abi:          PropertyTokenABI,
        functionName: 'symbol' as const,
      },
    ]);
  }, [validProps, address]);

  const tokenEnabled = contracts.length > 0;

  const { data: tokenData, isPending: tokenPending } = useReadContracts({
    contracts,
    query: { enabled: tokenEnabled },
  });

  const holdings = useMemo<Holding[]>(() => {
    if (!tokenData || validProps.length === 0) return [];

    return validProps.reduce<Holding[]>((acc, prop, i) => {
      const base         = i * CALLS_PER_PROPERTY;
      const balance      = (tokenData[base]?.result     as bigint | undefined) ?? 0n;
      const lockupExpiry = (tokenData[base + 1]?.result as bigint | undefined) ?? 0n;
      const symbol       = (tokenData[base + 2]?.result as string | undefined) ?? '';

      if (balance === 0n) return acc; // Filter out zero-balance properties

      acc.push({
        propertyId:    prop.propertyId,
        tokenAddress:  prop.tokenAddress,
        balance,
        // The registry counts supply in WHOLE tokens while balances are wei, so
        // scale here — otherwise every "% of supply" is out by a factor of 1e18.
        totalSupply:   prop.totalSupply * 10n ** 18n,
        pricePerToken: prop.pricePerToken,
        lockupExpiry,
        metadataURI:   prop.metadataURI,
        symbol,
      });
      return acc;
    }, []);
  }, [tokenData, validProps]);

  return {
    holdings,
    // `tokenPending` is true while the query is disabled, which is the case for
    // a wallet holding nothing — report settled instead of loading forever.
    isLoading: countPending || propertiesPending || (tokenEnabled && tokenPending),
  };
}
