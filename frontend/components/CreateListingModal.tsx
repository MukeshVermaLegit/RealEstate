'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { useHoldings } from '../lib/hooks/usePortfolio';
import { useCreateListing } from '../lib/hooks/useMarketplace';
import { useIPFSMetadataMany } from '../lib/hooks/useIPFSMetadata';
import { cleanTxError, formatDate, formatTokens, formatUsd } from '../lib/format';
import { Alert, Button, Field, Input, InputWithPrefix, Modal, Select } from './ui';

interface CreateListingModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateListingModal({ onClose, onSuccess }: CreateListingModalProps) {
  const { address } = useAccount();
  const { holdings } = useHoldings(address);
  const { approve, createListing, isPending } = useCreateListing();

  const uris = useMemo(() => holdings.map((h) => h.metadataURI), [holdings]);
  const { byUri } = useIPFSMetadataMany(uris);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [amountInput, setAmountInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [listHash, setListHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState('');
  const [done, setDone] = useState(false);

  const { isLoading: waitingApprove, isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { isLoading: waitingList, isSuccess: listSuccess } = useWaitForTransactionReceipt({
    hash: listHash,
  });

  const holding = holdings[selectedIdx];
  const now = BigInt(Math.floor(Date.now() / 1000));

  const amountBig = useMemo(() => {
    try {
      return amountInput ? parseUnits(amountInput, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput]);

  const priceBig = useMemo(() => {
    try {
      return priceInput ? parseUnits(priceInput, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [priceInput]);

  const expiresAt = useMemo<bigint>(() => {
    if (!expiryInput) return 0n;
    const ts = Math.floor(new Date(expiryInput).getTime() / 1000);
    return Number.isFinite(ts) && ts > 0 ? BigInt(ts) : 0n;
  }, [expiryInput]);

  const isLocked = holding ? holding.lockupExpiry > 0n && holding.lockupExpiry > now : false;

  const validationError = useMemo(() => {
    if (!holding) return 'You do not hold any property tokens.';
    if (isLocked) return `These tokens are locked until ${formatDate(holding.lockupExpiry)}.`;
    if (amountBig <= 0n) return 'Enter the number of tokens to list.';
    if (amountBig > holding.balance) return 'Amount exceeds your balance.';
    if (priceBig <= 0n) return 'Set a price above zero.';
    if (expiresAt > 0n && expiresAt <= now) return 'Expiry must be in the future.';
    return null;
  }, [holding, isLocked, amountBig, priceBig, expiresAt, now]);

  // Success callback belongs in an effect, not the render body.
  useEffect(() => {
    if (listSuccess && !done) {
      setDone(true);
      onSuccess();
    }
  }, [listSuccess, done, onSuccess]);

  const handleApprove = async () => {
    if (!holding || validationError) return;
    setTxError('');
    try {
      const hash = await approve(holding.tokenAddress, amountBig);
      setApproveHash(hash);
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const handleList = async () => {
    if (!holding || validationError) return;
    setTxError('');
    try {
      const hash = await createListing(holding.propertyId, amountBig, priceBig, expiresAt);
      setListHash(hash);
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const proceeds = amountBig > 0n && priceBig > 0n ? (amountBig * priceBig) / 10n ** 18n : 0n;

  const holdingLabel = (idx: number) => {
    const h = holdings[idx];
    const name = byUri[h.metadataURI]?.name || `Property #${h.propertyId}`;
    return `${name} — ${formatTokens(h.balance)} tokens`;
  };

  if (done) {
    return (
      <Modal title="Listing created" onClose={onClose}>
        <div className="py-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-positive/30 bg-positive/10 text-positive">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m6 12.5 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-semibold text-ink">
            {formatTokens(amountBig)} tokens listed
          </p>
          <p className="mt-1.5 text-sm text-muted">
            Your tokens are held in escrow by the marketplace and the listing is now live.
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
      title="List tokens for sale"
      description="Tokens move into marketplace escrow until the listing sells or is cancelled."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {holdings.length === 0 ? (
          <Alert tone="warn" title="Nothing to list">
            You do not hold any property tokens on this network yet.
          </Alert>
        ) : (
          <>
            <Field
              label="Property"
              htmlFor="listing-property"
              hint={holding ? `${formatTokens(holding.balance)} available` : undefined}
            >
              <Select
                id="listing-property"
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(Number(e.target.value))}
              >
                {holdings.map((h, i) => (
                  <option key={h.propertyId.toString()} value={i}>
                    {holdingLabel(i)}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tokens to list" htmlFor="listing-amount">
                <Input
                  id="listing-amount"
                  type="number"
                  min="0"
                  step="any"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setTxError('');
                  }}
                  placeholder="100"
                  className="tabular"
                />
              </Field>

              <Field label="Price per token" htmlFor="listing-price">
                <InputWithPrefix
                  id="listing-price"
                  prefix="$"
                  type="number"
                  min="0"
                  step="any"
                  value={priceInput}
                  onChange={(e) => {
                    setPriceInput(e.target.value);
                    setTxError('');
                  }}
                  placeholder="10.50"
                  className="tabular"
                />
              </Field>
            </div>

            <Field label="Expiry" htmlFor="listing-expiry" hint="Optional — blank means no expiry">
              <Input
                id="listing-expiry"
                type="date"
                value={expiryInput}
                onChange={(e) => setExpiryInput(e.target.value)}
              />
            </Field>

            {proceeds > 0n && (
              <div className="rounded-xl border border-accent/20 bg-accent/[0.07] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">Gross proceeds if fully sold</span>
                  <span className="tabular font-semibold text-accent">{formatUsd(proceeds)}</span>
                </div>
              </div>
            )}

            {validationError && <Alert tone="warn">{validationError}</Alert>}
            {txError && <Alert tone="negative">{txError}</Alert>}

            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={approveSuccess ? 'secondary' : 'outline'}
                  disabled={!!validationError || isPending || approveSuccess}
                  loading={waitingApprove}
                  onClick={() => void handleApprove()}
                >
                  {approveSuccess ? '✓ Approved' : waitingApprove ? 'Confirming…' : '1 · Approve tokens'}
                </Button>
                <Button
                  disabled={!!validationError || !approveSuccess || isPending}
                  loading={waitingList}
                  onClick={() => void handleList()}
                >
                  {waitingList ? 'Confirming…' : '2 · Create listing'}
                </Button>
              </div>
              <p className="text-center text-[11px] text-faint">
                {approveSuccess
                  ? 'Escrow approved — publish the listing'
                  : 'Approve the marketplace to escrow your tokens first'}
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
