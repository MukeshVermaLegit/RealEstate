'use client';

import { useAccount } from 'wagmi';
import { useKYCStatus, investorTypeLabel } from '../lib/hooks/useKYC';
import { Badge } from './ui';

export function KYCBadge() {
  const { address, isConnected } = useAccount();
  const { isVerified, record, isLoading, countryName } = useKYCStatus(
    isConnected ? address : undefined,
  );

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <Badge tone="neutral" dot pulse>
        Checking KYC
      </Badge>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isExpired = isVerified && record && record.expiresAt > 0n && now > record.expiresAt;

  if (record?.frozen) {
    return (
      <Badge tone="negative" dot title="This wallet has been frozen by the compliance operator">
        Frozen
      </Badge>
    );
  }

  if (!isVerified) {
    return (
      <Badge tone="negative" dot title="Wallet is not in the on-chain identity registry">
        Unverified
      </Badge>
    );
  }

  if (isExpired) {
    return (
      <Badge tone="warn" dot title="KYC record has passed its expiry — re-verification required">
        KYC expired
      </Badge>
    );
  }

  return (
    <Badge
      tone="positive"
      dot
      title={`Verified · ${countryName} · ${investorTypeLabel(record?.investorType ?? 0)}`}
    >
      <span className="font-semibold">KYC</span>
      {record && (
        <>
          <span className="text-positive/50">·</span>
          <span>{countryName}</span>
        </>
      )}
    </Badge>
  );
}
