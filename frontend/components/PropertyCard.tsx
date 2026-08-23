'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useIPFSMetadata } from '@/lib/hooks/useIPFSMetadata';
import { useOfferingData } from '@/lib/hooks/useOffering';
import { PROPERTY_STATUS_LABEL, PropertyStatus, type Property } from '@/lib/types';
import { propertyTone } from '@/lib/status';
import { formatNumber, formatUsd, isZeroAddress, pctOf } from '@/lib/format';
import { countryName } from '@/lib/constants/countries';
import { Badge, Progress, Skeleton } from './ui';

export function PropertyCard({ property }: { property: Property }) {
  const { data: meta, isPending } = useIPFSMetadata(property.metadataURI);

  // Funding progress is only meaningful while the primary offering is live.
  const offeringAddress =
    property.status === PropertyStatus.OfferingOpen && !isZeroAddress(property.offeringContract)
      ? property.offeringContract
      : undefined;
  const { totalTokensCommitted } = useOfferingData(offeringAddress);

  const name = meta?.name ?? `Property #${property.propertyId}`;
  const location = meta?.location || (property.jurisdiction ? countryName(property.jurisdiction) : '—');
  const imageUrl = meta?.imageUrl ?? '';
  const fundedPct = offeringAddress ? pctOf(totalTokensCommitted, property.totalSupply) : null;

  return (
    <Link
      href={`/properties/${property.propertyId}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-edge hover:shadow-lift"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-elevated">
        {isPending ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            unoptimized /* IPFS gateways are not in next/image's allowlist */
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-faint/50" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
              <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Scrim so the badge and any bright photo can coexist */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-base/70 via-transparent to-base/25" />

        <div className="absolute left-3 top-3">
          <Badge tone={propertyTone(property.status)} dot pulse={property.status === PropertyStatus.OfferingOpen}>
            {PROPERTY_STATUS_LABEL[property.status] ?? 'Unknown'}
          </Badge>
        </div>

        <span className="absolute right-3 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[11px] text-white/80 backdrop-blur">
          #{property.propertyId.toString()}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : (
          <>
            <h3 className="truncate font-display text-[15px] font-semibold text-ink">{name}</h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8Z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8" cy="6" r="1.75" />
              </svg>
              <span className="truncate">{location}</span>
            </p>
          </>
        )}

        {/* Funding progress — live offerings only */}
        {fundedPct !== null && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-faint">Funded</span>
              <span className="tabular font-medium text-ink">{fundedPct.toFixed(1)}%</span>
            </div>
            <Progress value={fundedPct} />
          </div>
        )}

        {/* Footer figures */}
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-hairline pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Per token</p>
            <p className="tabular mt-0.5 truncate font-display text-base font-semibold text-ink">
              {formatUsd(property.pricePerToken)}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Supply</p>
            <p className="tabular mt-0.5 truncate text-sm font-medium text-muted">
              {formatNumber(property.totalSupply)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Matching skeleton so grids don't reflow while the registry loads. */
export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex justify-between border-t border-hairline pt-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  );
}
