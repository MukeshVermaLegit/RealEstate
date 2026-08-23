'use client';

import { useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import {
  useCreateOffering,
  usePaymentDecimals,
  OFFERING_STEP_LABEL,
} from '@/lib/hooks/useCreateOffering';
import { useTokenInfo, TOKEN_DECIMALS } from '@/lib/hooks/useTokenAdmin';
import { cleanTxError, formatTokens } from '@/lib/format';
import { Alert, Button, Field, Input, Modal, Spinner } from '@/components/ui';

/** `datetime-local` value → unix seconds. Returns 0n for an unparseable value. */
function toUnix(local: string): bigint {
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? BigInt(Math.floor(ms / 1000)) : 0n;
}

/** unix seconds → the `datetime-local` format, in the browser's own timezone. */
function toLocalInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DAY = 86_400;

export function CreateOfferingModal({
  propertyId,
  tokenAddress,
  registryPrice,
  onClose,
  onSuccess,
}: {
  propertyId: string;
  tokenAddress: `0x${string}`;
  /** Registry `pricePerToken`, an 18-decimal display figure used only to prefill. */
  registryPrice: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const info = useTokenInfo(tokenAddress);
  const { decimals: payDecimals, isLoading: decLoading } = usePaymentDecimals();
  const { create, step } = useCreateOffering();

  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  const [price, setPrice] = useState(() => {
    // The registry stores price at 18 decimals; show it as plain dollars.
    try {
      return (BigInt(registryPrice) / 10n ** 18n).toString();
    } catch {
      return '';
    }
  });
  const [hardCap, setHardCap] = useState('');
  const [softCap, setSoftCap] = useState('');
  const [start, setStart] = useState(() => toLocalInput(nowSeconds));
  const [end, setEnd] = useState(() => toLocalInput(nowSeconds + 30 * DAY));
  const [lockupDays, setLockupDays] = useState('0');
  const [error, setError] = useState('');
  const [txError, setTxError] = useState('');

  const busy = step !== 'idle' && step !== 'done';

  // Direct admin mints and investor claims draw on the same ceiling, so the cap
  // that actually matters is what is left UNMINTED — not maxSupply.
  const remainingWhole = info.remaining / 10n ** BigInt(TOKEN_DECIMALS);

  const parsed = useMemo(() => {
    const toWhole = (v: string) => {
      if (!/^\d+$/.test(v.trim())) return null;
      return BigInt(v.trim()) * 10n ** BigInt(TOKEN_DECIMALS);
    };
    let priceUnits: bigint | null = null;
    try {
      priceUnits = price.trim() ? parseUnits(price.trim(), payDecimals) : null;
    } catch {
      priceUnits = null;
    }
    return {
      priceUnits,
      hardCapWei: toWhole(hardCap),
      softCapWei: toWhole(softCap),
      startUnix: toUnix(start),
      endUnix: toUnix(end),
    };
  }, [price, hardCap, softCap, start, end, payDecimals]);

  const handleCreate = async () => {
    setError('');
    setTxError('');
    const { priceUnits, hardCapWei, softCapWei, startUnix, endUnix } = parsed;

    if (!priceUnits || priceUnits <= 0n) return setError('Enter a price above zero.');
    if (hardCapWei === null || hardCapWei <= 0n)
      return setError('Hard cap must be a whole number of tokens above zero.');
    if (softCapWei === null || softCapWei <= 0n)
      return setError('Soft cap must be a whole number of tokens above zero.');
    if (softCapWei > hardCapWei) return setError('Soft cap cannot exceed the hard cap.');
    if (hardCapWei > info.maxSupply)
      return setError(
        `Hard cap exceeds the token's max supply of ${formatTokens(info.maxSupply)}.`,
      );
    if (hardCapWei > info.remaining)
      return setError(
        `Only ${formatTokens(info.remaining)} tokens are unminted. A larger hard cap would let ` +
          `the raise sell tokens that cannot be minted, and later claims would revert.`,
      );
    if (startUnix === 0n || endUnix === 0n) return setError('Enter a valid start and end time.');
    if (startUnix >= endUnix) return setError('The offering must end after it starts.');
    if (!/^\d+$/.test(lockupDays.trim())) return setError('Lockup must be a whole number of days.');

    try {
      await create({
        propertyId: BigInt(propertyId),
        tokenAddress,
        pricePerToken: priceUnits,
        hardCap: hardCapWei,
        softCap: softCapWei,
        startTime: startUnix,
        endTime: endUnix,
        lockupDuration: BigInt(lockupDays.trim()) * BigInt(DAY),
      });
      onSuccess();
    } catch (e) {
      setTxError(cleanTxError(e, 200));
    }
  };

  return (
    <Modal
      size="lg"
      title={`Open offering · property #${propertyId}`}
      description="Deploys the sale contract, grants it minter rights, and opens it on the registry."
      onClose={busy ? () => {} : onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs text-muted">
            {busy && (
              <>
                <Spinner /> {OFFERING_STEP_LABEL[step]}
              </>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!info.maxSupply || decLoading}
              onClick={() => void handleCreate()}
            >
              Open offering
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price per token"
            htmlFor="off-price"
            hint={decLoading ? '…' : `${payDecimals}-decimal settlement token`}
          >
            <Input
              id="off-price"
              type="number"
              min="0"
              step="any"
              placeholder="250"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Lockup after finalisation" htmlFor="off-lockup" hint="days">
            <Input
              id="off-lockup"
              type="number"
              min="0"
              step="1"
              value={lockupDays}
              onChange={(e) => setLockupDays(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field
            label="Hard cap"
            htmlFor="off-hard"
            hint={`max ${formatTokens(info.remaining)} tokens`}
          >
            <Input
              id="off-hard"
              type="number"
              min="0"
              step="1"
              placeholder={remainingWhole.toString()}
              value={hardCap}
              onChange={(e) => setHardCap(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Soft cap" htmlFor="off-soft" hint="minimum for a successful raise">
            <Input
              id="off-soft"
              type="number"
              min="0"
              step="1"
              value={softCap}
              onChange={(e) => setSoftCap(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Opens" htmlFor="off-start">
            <Input
              id="off-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>

          <Field label="Closes" htmlFor="off-end">
            <Input
              id="off-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-hairline bg-elevated/40 px-3 py-2.5 text-xs text-muted">
          <p>
            Token{' '}
            <span className="font-mono text-ink">{info.symbol || '—'}</span> ·{' '}
            <span className="tabular">{formatTokens(info.totalSupply)}</span> of{' '}
            <span className="tabular">{formatTokens(info.maxSupply)}</span> already minted
          </p>
          {info.totalSupply > 0n && (
            <p className="mt-1">
              Those already-minted tokens are not for sale here, so the hard cap is capped at what
              remains unminted.
            </p>
          )}
        </div>

        {error && <Alert tone="negative">{error}</Alert>}
        {txError && <Alert tone="negative">{txError}</Alert>}

        <Alert tone="info" title="Three transactions, in order">
          Deploy the offering → grant it MINTER_ROLE on the token → open it on the registry. All
          three must land: an offering that is deployed but never opened is unreachable, and one
          opened without minter rights takes money it can never deliver tokens for.
        </Alert>
      </div>
    </Modal>
  );
}
