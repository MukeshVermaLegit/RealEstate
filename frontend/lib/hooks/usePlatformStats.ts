import { useMemo } from 'react';
import { usePropertyCount, useProperties } from './useProperties';
import { useActiveListings } from './useMarketplace';
import { PropertyStatus, type Property } from '../types';
import { countsTowardStats } from '../status';

export type PlatformStats = {
  /** Approved properties on-chain — unreviewed drafts are excluded. */
  totalProperties: number;
  /** Σ (totalSupply × pricePerToken) across every registered property, 18-dec USD. */
  tokenizedValue: bigint;
  /** Properties whose primary offering is currently open. */
  openOfferings: number;
  /** Properties that have finalised and moved to secondary trading. */
  tradingAssets: number;
  /** Distinct ISO 3166-1 numeric jurisdictions represented. */
  jurisdictions: number;
  /** Total fractional tokens issued across all properties. */
  totalTokens: bigint;
  /** Live secondary-market listings. */
  activeListings: number;
};

const EMPTY: PlatformStats = {
  totalProperties: 0,
  tokenizedValue: 0n,
  openOfferings: 0,
  tradingAssets: 0,
  jurisdictions: 0,
  totalTokens: 0n,
  activeListings: 0,
};

/**
 * Aggregate platform metrics, derived entirely from PropertyRegistry + Marketplace.
 * Nothing here is hard-coded — an empty registry yields zeros.
 */
export function usePlatformStats() {
  const { data: countData, isPending: countPending } = usePropertyCount();
  const count = Number(countData ?? 0n);

  const { properties: allProperties, isPending: propsPending } = useProperties(count);
  const { listings, isLoading: listingsLoading } = useActiveListings();

  // Registration is permissionless, so headline figures are built only from
  // admin-approved properties — an unreviewed draft must not move these numbers.
  const properties = useMemo(
    () => allProperties.filter((p) => countsTowardStats(p.status)),
    [allProperties],
  );

  const stats = useMemo<PlatformStats>(() => {
    if (properties.length === 0) {
      return { ...EMPTY, activeListings: listings.length };
    }

    let tokenizedValue = 0n;
    let totalTokens = 0n;
    let openOfferings = 0;
    let tradingAssets = 0;
    const jurisdictions = new Set<number>();

    for (const p of properties) {
      // totalSupply is a whole-token count; pricePerToken is 18-dec USD.
      tokenizedValue += p.totalSupply * p.pricePerToken;
      totalTokens += p.totalSupply;

      if (p.status === PropertyStatus.OfferingOpen) openOfferings += 1;
      if (p.status === PropertyStatus.Trading) tradingAssets += 1;
      if (p.jurisdiction) jurisdictions.add(p.jurisdiction);
    }

    return {
      totalProperties: properties.length,
      tokenizedValue,
      openOfferings,
      tradingAssets,
      jurisdictions: jurisdictions.size,
      totalTokens,
      activeListings: listings.length,
    };
  }, [properties, listings.length]);

  return {
    stats,
    properties,
    isLoading: countPending || propsPending,
    isListingsLoading: listingsLoading,
  };
}

/** Investable/tradable properties first, newest first, capped at `limit`. */
export function useFeaturedProperties(limit = 6) {
  const { properties, isLoading } = usePlatformStats();

  const featured = useMemo<Property[]>(() => {
    const rank = (p: Property) => {
      if (p.status === PropertyStatus.OfferingOpen) return 0;
      if (p.status === PropertyStatus.Trading) return 1;
      if (p.status === PropertyStatus.Approved) return 2;
      return 3;
    };
    return [...properties]
      .sort((a, b) => rank(a) - rank(b) || Number(b.createdAt - a.createdAt))
      .slice(0, limit);
  }, [properties, limit]);

  return { featured, isLoading };
}
