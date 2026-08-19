'use client';

import { useState, useEffect } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { type ClaimItem, useClaimRent } from '../lib/hooks/useRentClaims';

interface ClaimButtonProps {
  item:       ClaimItem;
  onSuccess?: () => void;
}

type TxState = 'idle' | 'loading' | 'success' | 'error';

export function ClaimButton({ item, onSuccess }: ClaimButtonProps) {
  const [txState,  setTxState]  = useState<TxState>('idle');
  const [txHash,   setTxHash]   = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');

  const { claimSingle, invalidateClaims } = useClaimRent();

  const { isLoading: waitingReceipt, isSuccess: receiptSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (receiptSuccess) {
      setTxState('success');
      void invalidateClaims();
      onSuccess?.();
    }
  }, [receiptSuccess, invalidateClaims, onSuccess]);

  const isLoading = txState === 'loading' || waitingReceipt;

  const handleClaim = async () => {
    setTxState('loading');
    setErrorMsg('');
    try {
      const hash = await claimSingle(item);
      setTxHash(hash);
    } catch (e) {
      setTxState('error');
      const raw = e instanceof Error ? e.message : 'Transaction failed';
      setErrorMsg(raw.slice(0, 100));
    }
  };

  if (txState === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
        <span>✓</span> Claimed
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => void handleClaim()}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isLoading ? (
          <>
            <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            {waitingReceipt ? 'Confirming…' : 'Signing…'}
          </>
        ) : (
          'Claim'
        )}
      </button>

      {txState === 'error' && (
        <p className="text-[11px] text-red-500 max-w-[180px] text-right leading-tight">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
