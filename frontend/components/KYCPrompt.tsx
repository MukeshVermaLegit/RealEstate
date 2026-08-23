'use client';

import { useAccount } from 'wagmi';
import { useKYCStatus } from '../lib/hooks/useKYC';
import { Alert, Button, Card, CardBody } from './ui';
import { SelfVerifyButton } from './SelfVerifyButton';
import { shortAddress } from '../lib/format';

export function KYCPrompt() {
  const { address } = useAccount();
  const { record, isLoading, refetch } = useKYCStatus(address);

  const now = BigInt(Math.floor(Date.now() / 1000));

  let tone: 'negative' | 'warn' = 'warn';
  let title = 'Verification required';
  let message =
    'Your wallet is not yet in the on-chain identity registry. Complete KYC to invest, hold, or trade property tokens.';

  if (record?.frozen) {
    tone = 'negative';
    title = 'Wallet frozen';
    message =
      'This wallet has been frozen by the compliance operator. Transfers and claims are blocked until it is reinstated.';
  } else if (record?.verified && record.expiresAt > 0n && now > record.expiresAt) {
    tone = 'warn';
    title = 'Verification expired';
    message =
      'Your KYC record has passed its expiry date. Re-verify to restore access to investing and trading.';
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="M5.5 16.5c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2M15 10h4M15 13.5h3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">Identity verification</h2>
            {address && (
              <p className="mt-0.5 font-mono text-xs text-faint">{shortAddress(address, 6)}</p>
            )}
          </div>
        </div>

        <Alert tone={tone} title={title} className="mt-5">
          {isLoading ? 'Reading your KYC record from the registry…' : message}
        </Alert>

        <div className="mt-5 flex flex-col gap-2.5">
          <SelfVerifyButton onVerified={() => void refetch()} />
          <Button variant="secondary" fullWidth loading={isLoading} onClick={() => void refetch()}>
            Re-check status
          </Button>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
          Once verification completes, the compliance team writes your wallet into the identity
          registry. Approval typically lands within 24 hours.
        </p>
      </CardBody>
    </Card>
  );
}
