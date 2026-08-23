'use client';

import { useMemo, useState } from 'react';
import { usePropertyCount, useProperties } from '@/lib/hooks/useProperties';
import { useIPFSMetadataMany } from '@/lib/hooks/useIPFSMetadata';
import { PropertyCard, PropertyCardSkeleton } from '@/components/PropertyCard';
import { PROPERTY_STATUS_LABEL, PropertyStatus, type Property } from '@/lib/types';
import { countryName } from '@/lib/constants/countries';
import { Button, EmptyState, Field, Input, Select } from '@/components/ui';
import { isPubliclyListed } from '@/lib/status';
import { formatNumber } from '@/lib/format';

const STATUS_OPTIONS = [
  { label: 'Any status',      value: '' },
  { label: 'Offering open',   value: String(PropertyStatus.OfferingOpen) },
  { label: 'Trading',         value: String(PropertyStatus.Trading) },
  { label: 'Approved',        value: String(PropertyStatus.Approved) },
  { label: 'Under review',    value: String(PropertyStatus.UnderReview) },
  { label: 'Offering closed', value: String(PropertyStatus.OfferingClosed) },
  { label: 'Paused',          value: String(PropertyStatus.Paused) },
] as const;

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'supply-desc';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Newest first',        value: 'newest' },
  { label: 'Price: low to high',  value: 'price-asc' },
  { label: 'Price: high to low',  value: 'price-desc' },
  { label: 'Largest supply',      value: 'supply-desc' },
];

export function PropertiesList() {
  const { data: countData, isPending: countLoading } = usePropertyCount();
  const count = countData ? Number(countData) : 0;

  const { properties: allProperties, isPending: propsLoading } = useProperties(count);

  // Drafts belong to their owner alone and delisted assets are gone; neither is
  // browsable here now that anyone can register a listing.
  const properties = useMemo(
    () => allProperties.filter((p) => isPubliclyListed(p.status)),
    [allProperties],
  );

  // Pre-fetch metadata at list level so search can match on name and location.
  // Shares react-query cache keys with the cards, so this costs no extra requests.
  const uris = useMemo(() => properties.map((p) => p.metadataURI), [properties]);
  const { byUri } = useIPFSMetadataMany(uris);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  const isLoading = countLoading || propsLoading;

  // Jurisdiction options come from what is actually registered, not a static list.
  const jurisdictionOptions = useMemo(() => {
    const codes = [...new Set(properties.map((p) => p.jurisdiction).filter(Boolean))];
    return codes
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [properties]);

  const filtered = useMemo<Property[]>(() => {
    const q = query.trim().toLowerCase();

    const result = properties.filter((p) => {
      if (status && p.status !== Number(status)) return false;
      if (jurisdiction && p.jurisdiction !== Number(jurisdiction)) return false;

      if (q) {
        const meta = byUri[p.metadataURI];
        const haystack = [
          meta?.name,
          meta?.location,
          `#${p.propertyId}`,
          p.jurisdiction ? countryName(p.jurisdiction) : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return a.pricePerToken < b.pricePerToken ? -1 : a.pricePerToken > b.pricePerToken ? 1 : 0;
        case 'price-desc':
          return b.pricePerToken < a.pricePerToken ? -1 : b.pricePerToken > a.pricePerToken ? 1 : 0;
        case 'supply-desc':
          return b.totalSupply < a.totalSupply ? -1 : b.totalSupply > a.totalSupply ? 1 : 0;
        default:
          return Number(b.createdAt - a.createdAt);
      }
    });

    return result;
  }, [properties, byUri, query, status, jurisdiction, sort]);

  const hasFilters = Boolean(query || status || jurisdiction);

  const reset = () => {
    setQuery('');
    setStatus('');
    setJurisdiction('');
  };

  return (
    <div>
      {/* Search + filters */}
      <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <Field label="Search" htmlFor="prop-search">
            <div className="relative">
              <svg
                viewBox="0 0 20 20"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden
              >
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13.5 13.5 3 3" strokeLinecap="round" />
              </svg>
              <Input
                id="prop-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, city, country or #id"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </Field>

          <Field label="Status" htmlFor="prop-status">
            <Select id="prop-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Jurisdiction" htmlFor="prop-juris">
            <Select
              id="prop-juris"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              disabled={jurisdictionOptions.length === 0}
            >
              <option value="">Anywhere</option>
              {jurisdictionOptions.map((j) => (
                <option key={j.code} value={j.code}>
                  {j.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sort by" htmlFor="prop-sort">
            <Select id="prop-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/* Result meta */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {isLoading ? (
            'Reading the property registry…'
          ) : (
            <>
              <span className="tabular font-medium text-ink">{formatNumber(filtered.length)}</span>
              {' of '}
              <span className="tabular">{formatNumber(count)}</span>
              {count === 1 ? ' property' : ' properties'}
            </>
          )}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Grid */}
      <div className="mt-5">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13.5 13.5 3 3" strokeLinecap="round" />
              </svg>
            }
            title={count === 0 ? 'No properties registered yet' : 'Nothing matches those filters'}
            description={
              count === 0
                ? 'Tokenised properties appear here as soon as they are written to the on-chain registry.'
                : 'Try widening the status or jurisdiction, or clearing the search term.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((property) => (
              <PropertyCard key={property.propertyId.toString()} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
