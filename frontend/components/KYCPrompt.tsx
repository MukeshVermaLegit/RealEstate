'use client';

import { useAccount } from 'wagmi';
import { useKYCStatus } from '../lib/hooks/useKYC';

const KYC_PROVIDER_URL = process.env.NEXT_PUBLIC_KYC_PROVIDER_URL ?? '#';

export function KYCPrompt() {
  const { address } = useAccount();
  const { record, isLoading, refetch } = useKYCStatus(address);

  const now = BigInt(Math.floor(Date.now() / 1000));

  // Determine alert variant and message
  let alertVariant: 'red' | 'orange' | 'yellow' = 'yellow';
  let message = 'You need to complete KYC to invest.';

  if (record?.frozen) {
    alertVariant = 'red';
    message = 'Your account has been frozen. Contact support.';
  } else if (record?.verified && record.expiresAt > 0n && now > record.expiresAt) {
    alertVariant = 'orange';
    message = 'Your KYC has expired. Re-verify.';
  }

  const alertClasses = {
    red:    'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  } as const;

  const dotClasses = {
    red:    'bg-red-400',
    orange: 'bg-orange-400',
    yellow: 'bg-yellow-400',
  } as const;

  return (
    <div className="max-w-md mx-auto mt-8 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xl">
          🪪
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Identity Verification Required</h2>
      </div>

      {/* Status alert */}
      <div
        className={`flex items-start gap-2 rounded-lg border px-4 py-3 mb-5 text-sm ${alertClasses[alertVariant]}`}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClasses[alertVariant]}`} />
        <p>{isLoading ? 'Checking KYC status…' : message}</p>
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col gap-3">
        <a
          href={KYC_PROVIDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Start Verification
        </a>
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Checking…' : 'Check Status'}
        </button>
      </div>

      {/* Footnote */}
      <p className="mt-4 text-xs text-gray-400 text-center">
        After completing verification, your wallet will be whitelisted within 24 hours by our compliance team.
      </p>
    </div>
  );
}
