import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { PropertyRegistryABI, PriceOracleABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';
import type { Property } from '../types';

// ─── Property count ───────────────────────────────────────────────────────────

export function usePropertyCount() {
  const { addresses } = useContracts();
  return useReadContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'totalProperties',
  });
}

// ─── Single property ──────────────────────────────────────────────────────────

export function useProperty(id: bigint) {
  const { addresses } = useContracts();
  return useReadContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'getProperty',
    args: [id],
    query: { enabled: id > 0n },
  });
}

// ─── Batch properties 1..count ────────────────────────────────────────────────

export function useProperties(count: number) {
  const { addresses } = useContracts();

  const contracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        functionName: 'getProperty' as const,
        args: [BigInt(i + 1)] as const,
      })),
    [count, addresses.propertyRegistry],
  );

  const result = useReadContracts({
    contracts,
    query: { enabled: count > 0 },
  });

  const properties = useMemo<Property[]>(
    () =>
      (result.data ?? [])
        .filter((item) => item.status === 'success' && item.result != null)
        .map((item) => item.result as Property),
    [result.data],
  );

  return { ...result, properties };
}

// ─── Price oracle ─────────────────────────────────────────────────────────────

export function usePropertyPrice(id: bigint) {
  const { addresses } = useContracts();
  return useReadContract({
    address: addresses.priceOracle,
    abi: PriceOracleABI,
    functionName: 'getPrice',
    args: [id],
    query: { enabled: id > 0n },
  });
}
