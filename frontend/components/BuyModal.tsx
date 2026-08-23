'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { KYCGate } from './KYCGate';
import { useBuyListing, type Listing } from '../lib/hooks/useMarketplace';
import { cleanTxError, formatTokens, formatUsd } from '../lib/format';
import { Alert, Badge, Button, Modal } from './ui';

interface BuyModalProps {
  listing: Listing;
  onClose: () => void;
  onSuccess: () => void;
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`tabular font-semibold ${emphasis ? 'text-accent' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

export function BuyModal({ listing, onClose, onSuccess }: BuyModalProps) {
  const { approve, buy, isPending } = useBuyListing();

  const [qtyInput, setQtyInput] = useState('1');
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [buyHash, setBuyHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState('');
  const [done, setDone] = useState(false);

  const { isLoading: waitingApprove, isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { isLoading: waitingBuy, isSuccess: buySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  });

  // Listing token amounts are 18-decimal.
  const qtyBig = useMemo(() => {
    try {
      const n = parseUnits(qtyInput || '0', 18);
      return n > 0n ? n : 0n;
    } catch {
      return 0n;
    }
  }, [qtyInput]);

  const totalCost18 = qtyBig > 0n ? (qtyBig * listing.pricePerToken) / 10n ** 18n : 0n;
  // The payment token is USDC (6 decimals); approve in its own units.
  const totalCostUSDC = totalCost18 / 10n ** 12n;

  const validationError = useMemo(() => {
    if (qtyBig <= 0n) return 'Enter a quantity greater than zero.';
    if (qtyBig > listing.tokenAmount)
      return `Only ${formatTokens(listing.tokenAmount)} tokens are listed.`;
    return null;
  }, [qtyBig, listing.tokenAmount]);

  // Fire the success callback from an effect, never during render.
  useEffect(() => {
    if (buySuccess && !done) {
      setDone(true);
      onSuccess();
    }
  }, [buySuccess, done, onSuccess]);

  const handleApprove = async () => {
    setTxError('');
    try {
      const hash = await approve(totalCostUSDC > 0n ? totalCostUSDC : 1n);
      setApproveHash(hash);
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const handleBuy = async () => {
    setTxError('');
    try {
      const hash = await buy(listing.listingId, qtyBig);
      setBuyHash(hash);
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  if (done) {
    return (
      <Modal title="Purchase complete" onClose={onClose}>
        <div className="py-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-positive/30 bg-positive/10 text-positive">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m6 12.5 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-semibold text-ink">
            {formatTokens(qtyBig)} tokens purchased
          </p>
          <p className="mt-1.5 text-sm text-muted">
            Your position will appear in your portfolio once the balance settles.
          </p>
          <Button className="mt-6" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Buy tokens"
      description={`Listing #${listing.listingId.toString()} · settles in USDC`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Listing summary */}
        <div className="space-y-2 rounded-xl border border-hairline bg-elevated/50 px-4 py-3">
          <SummaryRow label="Available" value={`${formatTokens(listing.tokenAmount)} tokens`} />
          <SummaryRow label="Price per token" value={formatUsd(listing.pricePerToken)} />
        </div>

        {/* Quantity */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="buy-qty" className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Quantity to buy
            </label>
            <button
              type="button"
              onClick={() => setQtyInput(formatTokens(listing.tokenAmount).replace(/,/g, ''))}
              className="text-[11px] font-semibold text-accent transition-colors hover:text-accent-hover"
            >
              Max
            </button>
          </div>
          <input
            id="buy-qty"
            type="number"
            min="0"
            step="any"
            value={qtyInput}
            onChange={(e) => {
              setQtyInput(e.target.value);
              setTxError('');
            }}
            className="tabular h-11 w-full rounded-xl border border-hairline bg-elevated px-3 text-base text-ink placeholder:text-faint transition-colors hover:border-edge focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>

        {/* Total */}
        <div className="rounded-xl border border-accent/20 bg-accent/[0.07] px-4 py-3">
          <SummaryRow label="Total to pay" value={formatUsd(totalCost18)} emphasis />
        </div>

        {validationError && <Alert tone="warn">{validationError}</Alert>}
        {txError && <Alert tone="negative">{txError}</Alert>}

        {/* Two-step, KYC-gated */}
        <KYCGate
          fallback={
            <Alert tone="warn" title="Verification required">
              The marketplace only settles between wallets in the on-chain identity registry.
            </Alert>
          }
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={approveSuccess ? 'secondary' : 'outline'}
                disabled={!!validationError || isPending || approveSuccess}
                loading={waitingApprove}
                onClick={() => void handleApprove()}
              >
                {approveSuccess ? '✓ Approved' : waitingApprove ? 'Confirming…' : '1 · Approve'}
              </Button>
              <Button
                disabled={!!validationError || !approveSuccess || isPending}
                loading={waitingBuy}
                onClick={() => void handleBuy()}
              >
                {waitingBuy ? 'Confirming…' : '2 · Buy'}
              </Button>
            </div>
            <p className="text-center text-[11px] text-faint">
              {approveSuccess
                ? 'Allowance set — complete the purchase'
                : 'Approve the marketplace to spend your USDC first'}
            </p>
          </div>
        </KYCGate>

        <div className="flex items-center justify-center gap-2 pt-1">
          <Badge tone="neutral">Lockups and transfer rules still apply after purchase</Badge>
        </div>
      </div>
    </Modal>
  );
}
