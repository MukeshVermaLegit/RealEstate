'use client';

import { useAccount } from 'wagmi';
import { useKYCStatus, investorTypeLabel } from '../lib/hooks/useKYC';

export function KYCBadge() {
  const { address, isConnected } = useAccount();
  const { isVerified, record, isLoading, countryName } = useKYCStatus(
    isConnected ? address : undefined,
  );

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
        KYC…
      </span>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isExpired = isVerified && record && record.expiresAt > 0n && now > record.expiresAt;
  const isFrozen = record?.frozen;

  // Red X – not verified or frozen
  if (!isVerified || isFrozen) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <span className="text-red-500">✕</span>
        {isFrozen ? 'Frozen' : 'Unverified'}
      </span>
    );
  }

  // Yellow clock – expired
  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-700">
        <span>⏱</span>
        KYC Expired
      </span>
    );
  }

  // Green check – verified
  return (
    <span
      title={`${countryName} · ${investorTypeLabel(record?.investorType ?? 0)}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
    >
      <span className="text-green-500">✓</span>
      <span>KYC</span>
      {record && (
        <>
          <span className="text-green-400">·</span>
          <span className="text-green-600">{countryName}</span>
          <span className="text-green-400">·</span>
          <span className="text-green-600">{investorTypeLabel(record.investorType)}</span>
        </>
      )}
    </span>
  );
}
