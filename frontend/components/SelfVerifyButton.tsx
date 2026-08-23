'use client';

import { useEffect, useState } from 'react';
import { useSelfVerify } from '../lib/hooks/useSelfVerify';
import { cleanTxError } from '../lib/format';
import { Alert, Button } from './ui';

/**
 * Demo-mode "pass KYC" control.
 *
 * This deployment has no KYC provider wired up, and every gated path
 * (`PropertyOffering.invest`, `Marketplace.buyListing`, every token transfer)
 * checks `KYCRegistry.isVerified`. Rather than fake verification in the UI — which
 * cannot work, because the checks are on chain — the registry itself runs a demo
 * implementation exposing `selfVerify()`, and this button calls it.
 */
export function SelfVerifyButton({
  onVerified,
  fullWidth = true,
}: {
  onVerified?: () => void;
  fullWidth?: boolean;
}) {
  const { selfVerify, isPending, isSuccess, error } = useSelfVerify();
  const [txError, setTxError] = useState('');

  useEffect(() => {
    if (isSuccess) onVerified?.();
  }, [isSuccess, onVerified]);

  useEffect(() => {
    if (error) setTxError(cleanTxError(error, 160));
  }, [error]);

  const handleVerify = async () => {
    setTxError('');
    try {
      await selfVerify();
    } catch (e) {
      setTxError(cleanTxError(e, 160));
    }
  };

  return (
    <div className="space-y-2">
      <Button fullWidth={fullWidth} loading={isPending} onClick={() => void handleVerify()}>
        {isSuccess ? 'Verified' : 'Verify my wallet'}
      </Button>
      <p className="text-[11px] leading-tight text-faint">
        Demo verification — no identity check is performed. It writes a verified record for your own
        address so you can exercise the investment flows.
      </p>
      {txError && (
        <Alert tone="negative">
          {txError}
          <p className="mt-1 text-faint">
            If this reports an unknown function, the registry is running the production
            implementation and only a VERIFIER_ROLE operator can verify wallets.
          </p>
        </Alert>
      )}
    </div>
  );
}
