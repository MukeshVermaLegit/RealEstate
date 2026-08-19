'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useIPFSMetadata } from '@/lib/hooks/useIPFSMetadata';
import { PROPERTY_STATUS_LABEL, PropertyStatus, type Property } from '@/lib/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<number, string> = {
  [PropertyStatus.OfferingOpen]:   'bg-green-100 text-green-700',
  [PropertyStatus.Trading]:        'bg-blue-100  text-blue-700',
  [PropertyStatus.UnderReview]:    'bg-yellow-100 text-yellow-700',
  [PropertyStatus.Approved]:       'bg-indigo-100 text-indigo-700',
  [PropertyStatus.Paused]:         'bg-red-100   text-red-700',
  [PropertyStatus.OfferingClosed]: 'bg-gray-100  text-gray-600',
  [PropertyStatus.Draft]:          'bg-gray-100  text-gray-500',
  [PropertyStatus.Delisted]:       'bg-gray-200  text-gray-400',
};

function badgeClass(status: number): string {
  return STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-500';
}

// ─── Price formatter ─────────────────────────────────────────────────────────

function formatUsd(wei: bigint): string {
  const dollars = Number(wei) / 1e18;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PropertyCardProps {
  property: Property;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const { data: meta, isPending } = useIPFSMetadata(property.metadataURI);

  const name      = meta?.name      ?? `Property #${property.propertyId}`;
  const location  = meta?.location  ?? '—';
  const imageUrl  = meta?.imageUrl  ?? '';

  return (
    <Link
      href={`/properties/${property.propertyId}`}
      className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Image */}
      <div className="relative h-48 bg-gray-100">
        {isPending ? (
          <div className="absolute inset-0 animate-pulse bg-gray-200" />
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized // IPFS images bypass Next.js image optimisation
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-4xl">
            🏠
          </div>
        )}

        {/* Status badge overlay */}
        <span
          className={`absolute top-3 left-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass(property.status)}`}
        >
          {PROPERTY_STATUS_LABEL[property.status] ?? 'Unknown'}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        {isPending ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
            <p className="text-sm text-gray-500 truncate mt-0.5">{location}</p>
          </>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <div>
            <span className="text-gray-400 text-xs uppercase tracking-wide">Price / token</span>
            <p className="font-semibold text-gray-900">{formatUsd(property.pricePerToken)}</p>
          </div>
          <div className="text-right">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Total supply</span>
            <p className="font-semibold text-gray-900">
              {property.totalSupply.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
