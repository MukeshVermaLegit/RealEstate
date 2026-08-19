import { useReadContracts } from 'wagmi';
import { KYCRegistryABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';
import { countryName } from '../constants/countries';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvestorRecord = {
  verified:     boolean;
  countryCode:  number;
  investorType: number;
  verifiedAt:   bigint;
  expiresAt:    bigint;
  frozen:       boolean;
};

export type KYCStatus = {
  isVerified:  boolean;
  record:      InvestorRecord | null;
  isLoading:   boolean;
  countryName: string;
  refetch:     () => void;
};

/** Maps the raw uint8 investorType → human-readable label. */
export function investorTypeLabel(type: number): string {
  switch (type) {
    case 1:  return 'Retail';
    case 2:  return 'Accredited';
    case 3:  return 'Qualified';
    default: return '—';
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKYCStatus(address: `0x${string}` | undefined): KYCStatus {
  const { addresses } = useContracts();
  const enabled = !!address;

  const { data, isPending, refetch } = useReadContracts({
    contracts: [
      {
        address: addresses.kycRegistry,
        abi: KYCRegistryABI,
        functionName: 'isVerified',
        args: [address!],
      },
      {
        address: addresses.kycRegistry,
        abi: KYCRegistryABI,
        functionName: 'getInvestorRecord',
        args: [address!],
      },
    ],
    query: { enabled },
  });

  const isVerified = (data?.[0].result as boolean | undefined) ?? false;

  const rawRecord = data?.[1].result as
    | { verified: boolean; countryCode: number; investorType: number; verifiedAt: bigint; expiresAt: bigint; frozen: boolean }
    | undefined;

  const record: InvestorRecord | null = rawRecord
    ? {
        verified:     rawRecord.verified,
        countryCode:  rawRecord.countryCode,
        investorType: rawRecord.investorType,
        verifiedAt:   rawRecord.verifiedAt,
        expiresAt:    rawRecord.expiresAt,
        frozen:       rawRecord.frozen,
      }
    : null;

  return {
    isVerified,
    record,
    isLoading: isPending,
    countryName: record ? countryName(record.countryCode) : '—',
    refetch,
  };
}
