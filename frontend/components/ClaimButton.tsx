'use client';

import { useEffect, useState } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { type ClaimItem, useClaimRent } from '../lib/hooks/useRentClaims';
import { cleanTxError } from '../lib/format';
import { Button } from './ui';

interface ClaimButtonProps {
  item: ClaimItem;
  onSuccess?: () => void;
}

export function ClaimButton({ item, onSuccess }: ClaimButtonProps) {
  const [signing, setSigning] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');

  const { claimSingle, invalidateClaims } = useClaimRent();

  const { isLoading: waitingReceipt, isSuccess: receiptSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (receiptSuccess) {
      setClaimed(true);
      void invalidateClaims();
      onSuccess?.();
    }
  }, [receiptSuccess, invalidateClaims, onSuccess]);

  const isLoading = signing || waitingReceipt;

  const handleClaim = async () => {
    setSigning(true);
    setErrorMsg('');
    try {
      const hash = await claimSingle(item);
      setTxHash(hash);
    } catch (e) {
      setErrorMsg(cleanTxError(e, 90));
    } finally {
      setSigning(false);
    }
  };

  if (claimed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-positive">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m4 8.5 2.8 2.8L12 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Claimed
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" loading={isLoading} onClick={() => void handleClaim()}>
        {waitingReceipt ? 'Confirming…' : 'Claim'}
      </Button>
      {errorMsg && (
        <p className="max-w-[180px] text-right text-[11px] leading-tight text-negative">{errorMsg}</p>
      )}
    </div>
  );
}
