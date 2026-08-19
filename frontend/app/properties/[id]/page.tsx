'use client';

import { use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useProperty } from '@/lib/hooks/useProperties';
import { useIPFSMetadata, ipfsToHttp } from '@/lib/hooks/useIPFSMetadata';
import { PROPERTY_STATUS_LABEL, PropertyStatus } from '@/lib/types';
import { InvestPanel } from './InvestPanel';

// ─── ISO 3166-1 numeric → country name (partial list; expand as needed) ──────
const JURISDICTION_NAMES: Record<number, string> = {
  840: 'United States',
  826: 'United Kingdom',
  276: 'Germany',
  250: 'France',
  356: 'India',
  784: 'United Arab Emirates',
  702: 'Singapore',
  36:  'Australia',
  124: 'Canada',
};

function countryName(code: number): string {
  return JURISDICTION_NAMES[code] ?? `ISO ${code}`;
}

function truncate(hex: string, chars = 10): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

const STATUS_BADGE: Record<number, string> = {
  [PropertyStatus.OfferingOpen]:   'bg-green-100 text-green-700',
  [PropertyStatus.Trading]:        'bg-blue-100  text-blue-700',
  [PropertyStatus.UnderReview]:    'bg-yellow-100 text-yellow-700',
  [PropertyStatus.Approved]:       'bg-indigo-100 text-indigo-700',
  [PropertyStatus.Paused]:         'bg-red-100   text-red-700',
  [PropertyStatus.OfferingClosed]: 'bg-gray-100  text-gray-600',
};

function badgeClass(status: number) {
  return STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-500';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const propertyId = BigInt(id);

  const { data: property, isPending: propLoading } = useProperty(propertyId);
  const { data: meta, isPending: metaLoading } = useIPFSMetadata(
    property?.metadataURI ?? '',
  );

  const isLoading = propLoading || metaLoading;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-72 bg-gray-200 rounded-2xl" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-4/5" />
          </div>
          <div className="h-80 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center text-gray-400">
        Property not found.{' '}
        <Link href="/properties" className="underline text-indigo-600">
          Back to properties
        </Link>
      </div>
    );
  }

  const imageUrl = meta?.imageUrl ? ipfsToHttp(meta.imageUrl) : '';

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-6">
        <Link href="/properties" className="hover:text-indigo-600 transition-colors">
          Properties
        </Link>
        {' / '}
        <span className="text-gray-700">{meta?.name ?? `#${id}`}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* ── Left: image + details ──────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main image */}
          <div className="relative h-72 rounded-2xl overflow-hidden bg-gray-100">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={meta?.name ?? ''}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-6xl">
                🏠
              </div>
            )}
            <span
              className={`absolute top-4 left-4 rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(property.status)}`}
            >
              {PROPERTY_STATUS_LABEL[property.status] ?? 'Unknown'}
            </span>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {meta?.name ?? `Property #${id}`}
            </h1>
            {meta?.location && (
              <p className="text-sm text-gray-500 mb-4">📍 {meta.location}</p>
            )}
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {meta?.description ?? '—'}
            </p>
          </div>

          {/* Legal / On-chain info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 text-sm">
            <h2 className="font-semibold text-gray-900 text-base mb-2">
              On-chain Details
            </h2>
            <Row label="Property ID"   value={`#${property.propertyId}`} />
            <Row label="Owner"         value={truncate(property.owner)} mono />
            <Row label="Token Address" value={truncate(property.tokenAddress)} mono />
            <Row label="SPV Address"   value={property.spvAddress !== '0x0000000000000000000000000000000000000000' ? truncate(property.spvAddress) : '—'} mono />
            <Row label="Legal Hash"    value={truncate(property.legalHash, 8)} mono />
            <Row label="Jurisdiction"  value={property.jurisdiction ? `${countryName(property.jurisdiction)} (${property.jurisdiction})` : '—'} />
            <Row label="Total Supply"  value={property.totalSupply.toLocaleString() + ' tokens'} />
            <Row
              label="Price / Token"
              value={`$${(Number(property.pricePerToken) / 1e18).toFixed(2)}`}
            />
          </div>

          {/* Documents */}
          {meta?.documents && meta.documents.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 text-base mb-3">
                Documents
              </h2>
              <ul className="space-y-1">
                {meta.documents.map((doc, i) => (
                  <li key={i}>
                    <a
                      href={ipfsToHttp(doc)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline text-sm"
                    >
                      Document {i + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Right: invest panel ─────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <InvestPanel property={property} />
        </div>
      </div>
    </div>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span
        className={`text-gray-800 text-right break-all ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
