'use client';

import { useState } from 'react';
import { usePropertyCount, useProperties } from '@/lib/hooks/useProperties';
import { PropertyCard } from '@/components/PropertyCard';
import { PROPERTY_STATUS_LABEL, PropertyStatus } from '@/lib/types';

const STATUS_FILTER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'All',            value: null },
  { label: 'Offering Open',  value: PropertyStatus.OfferingOpen },
  { label: 'Trading',        value: PropertyStatus.Trading },
  { label: 'Under Review',   value: PropertyStatus.UnderReview },
  { label: 'Approved',       value: PropertyStatus.Approved },
  { label: 'Paused',         value: PropertyStatus.Paused },
];

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
        <div className="flex justify-between mt-4">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="h-5 bg-gray-200 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

export function PropertiesList() {
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [jurisdictionFilter, setJurisdictionFilter] = useState('');

  const { data: countData, isPending: countLoading } = usePropertyCount();
  const count = countData ? Number(countData) : 0;

  const { properties, isPending: propsLoading } = useProperties(count);

  const isLoading = countLoading || propsLoading;

  const filtered = properties.filter((p) => {
    const statusOk = statusFilter === null || p.status === statusFilter;
    const jurisOk =
      !jurisdictionFilter.trim() ||
      p.jurisdiction === Number(jurisdictionFilter.trim());
    return statusOk && jurisOk;
  });

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-4 mb-8 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Status
          </label>
          <select
            value={statusFilter ?? ''}
            onChange={(e) =>
              setStatusFilter(e.target.value === '' ? null : Number(e.target.value))
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Jurisdiction (ISO numeric)
          </label>
          <input
            type="number"
            placeholder="e.g. 840"
            value={jurisdictionFilter}
            onChange={(e) => setJurisdictionFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <span className="text-sm text-gray-400 self-end pb-2">
          {isLoading ? 'Loading…' : `${filtered.length} of ${count} propert${count === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : filtered.map((property) => (
              <PropertyCard key={property.propertyId.toString()} property={property} />
            ))}
      </div>

      {!isLoading && filtered.length === 0 && (
        <p className="text-center text-gray-400 py-20">No properties match your filters.</p>
      )}
    </div>
  );
}
