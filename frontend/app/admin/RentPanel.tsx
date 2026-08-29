'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { RentDistributorABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { useDepositRent, DEPOSIT_STEP_LABEL } from '@/lib/hooks/useDepositRent';
import { cleanTxError, formatDate, shortAddress } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import type { PropertyRow } from './AdminProperties';

/** Payment token decimals (Sepolia USDC = 6). */
const USDC_DECIMALS = 6;

function parseUsdc(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const padded = frac.padEnd(USDC_DECIMALS, '0');
  const value = BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(padded || '0');
  return value > 0n ? value : null;
}

function formatUsdc(raw: bigint | string): string {
  const value = typeof raw === 'string' ? BigInt(raw) : raw;
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = value / base;
  const frac = (value % base).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  return frac ? `${whole.toLocaleString()}.${frac}` : whole.toLocaleString();
}

type PeriodSummary = {
  periodId: number | null;
  merkleRoot: string;
  totalRent: string;
  allocated: string;
  unallocated: string;
  snapshotBlock: string;
  claimCount: number;
  txHash: string | null;
  createdAt: string;
};

export default function RentPanel({ properties }: { properties: PropertyRow[] }) {
  const { address } = useAccount();
  const { addresses, chainId } = useContracts();
  const publicClient = usePublicClient();
  const { step, preview, build, deposit, reset } = useDepositRent();

  // Only tokenised properties can take a deposit — the snapshot needs a token.
  const eligible = useMemo(
    () => properties.filter((p) => p.tokenAddress && !/^0x0+$/.test(p.tokenAddress)),
    [properties],
  );

  const [propertyId, setPropertyId] = useState('');
  const [amount, setAmount] = useState('');
  const [snapshotBlock, setSnapshotBlock] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);

  const selected = eligible.find((p) => p.id === propertyId);

  // depositRent requires msg.sender == property owner. Admin rights are NOT
  // enough, so say so before the admin builds a tree they cannot deposit.
  const isOwner =
    !!selected && !!address && selected.owner.toLowerCase() === address.toLowerCase();

  const { data: onChainCount } = useReadContract({
    address: addresses.rentDistributor,
    abi: RentDistributorABI,
    functionName: 'periodCount',
    args: propertyId ? [BigInt(propertyId)] : undefined,
    query: { enabled: !!propertyId },
  });

  // Default the snapshot to the previous block: depositRent rejects anything at
  // or after the current head.
  useEffect(() => {
    if (snapshotBlock || !publicClient) return;
    void publicClient.getBlockNumber().then((head) => {
      setSnapshotBlock((head - 1n).toString());
    });
  }, [publicClient, snapshotBlock]);

  const loadPeriods = useCallback(async () => {
    if (!propertyId) {
      setPeriods([]);
      return;
    }
    try {
      const res = await fetch(`/api/rent/periods?chainId=${chainId}&propertyId=${propertyId}`);
      const json = await res.json();
      setPeriods(res.ok ? json.periods ?? [] : []);
    } catch {
      setPeriods([]);
    }
  }, [chainId, propertyId]);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const busy = step !== 'idle' && step !== 'done';

  async function handleBuild() {
    setError('');
    setNotice('');
    const rent = parseUsdc(amount);
    if (!propertyId) return setError('Pick a property.');
    if (!rent) return setError('Enter a rent amount greater than zero (up to 6 decimals).');
    if (!/^\d+$/.test(snapshotBlock)) return setError('Snapshot block must be a whole number.');

    try {
      await build(BigInt(propertyId), rent, BigInt(snapshotBlock));
    } catch (err) {
      setError(cleanTxError(err, 240));
    }
  }

  async function handleDeposit() {
    if (!preview) return;
    setError('');
    try {
      const newPeriodId = await deposit(BigInt(propertyId), preview);
      setNotice(`Period ${newPeriodId} is live — investors can claim now.`);
      setAmount('');
      await loadPeriods();
    } catch (err) {
      setError(cleanTxError(err, 240));
    }
  }

  if (eligible.length === 0) {
    return (
      <EmptyState
        title="No tokenised properties"
        description="Rent can only be distributed for a property that has its ERC-20 issued. Tokenise one from the Properties tab first."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Deposit a rent period</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Property">
              <Select
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  reset();
                  setError('');
                  setNotice('');
                }}
                disabled={busy}
              >
                <option value="">Select…</option>
                {eligible.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} — {shortAddress(p.tokenAddress)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Rent amount (USDC)">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000.00"
                inputMode="decimal"
                disabled={busy}
              />
            </Field>

            <Field
              label="Snapshot block"
              hint="Holdings are measured here. Must be in the past."
            >
              <Input
                value={snapshotBlock}
                onChange={(e) => setSnapshotBlock(e.target.value)}
                inputMode="numeric"
                disabled={busy}
              />
            </Field>
          </div>

          {selected && !isOwner && (
            <Alert tone="warn">
              Only the property owner can deposit rent — this one belongs to{' '}
              <span className="tabular">{shortAddress(selected.owner)}</span>. Admin rights do not
              override that check, so the deposit would revert.
            </Alert>
          )}

          {onChainCount !== undefined && (
            <p className="text-xs text-muted">
              {Number(onChainCount)} period{Number(onChainCount) === 1 ? '' : 's'} already deposited
              on-chain for this property.
            </p>
          )}

          {error && <Alert tone="negative">{error}</Alert>}
          {notice && <Alert tone="positive">{notice}</Alert>}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleBuild} disabled={busy || !propertyId}>
              {step === 'building' ? <Spinner /> : null}
              {preview ? 'Rebuild allocation' : 'Build allocation'}
            </Button>

            {preview && (
              <Button variant="primary" onClick={handleDeposit} disabled={busy || !isOwner}>
                {busy && step !== 'building' ? <Spinner /> : null}
                Approve &amp; deposit {formatUsdc(preview.totalRent)} USDC
              </Button>
            )}

            {busy && <span className="text-sm text-muted">{DEPOSIT_STEP_LABEL[step]}</span>}
          </div>
        </CardBody>
      </Card>

      {preview && <AllocationPreviewCard preview={preview} />}

      <Card>
        <CardHeader>
          <CardTitle>Deposited periods</CardTitle>
        </CardHeader>
        <CardBody>
          {periods.length === 0 ? (
            <p className="text-sm text-muted">
              {propertyId ? 'No periods recorded yet.' : 'Select a property to see its history.'}
            </p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Period</Th>
                    <Th align="right">Rent</Th>
                    <Th align="right">Claimable</Th>
                    <Th align="right">Holders</Th>
                    <Th align="right">Snapshot</Th>
                    <Th>Created</Th>
                  </Tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <Tr key={p.merkleRoot + p.createdAt}>
                      <Td>
                        {p.periodId === null ? (
                          <span className="text-warn">draft — deposit never confirmed</span>
                        ) : (
                          `#${p.periodId}`
                        )}
                      </Td>
                      <Td align="right" className="tabular">{formatUsdc(p.totalRent)}</Td>
                      <Td align="right" className="tabular">{formatUsdc(p.allocated)}</Td>
                      <Td align="right" className="tabular">{p.claimCount}</Td>
                      <Td align="right" className="tabular">{p.snapshotBlock}</Td>
                      <Td>{formatDate(BigInt(Math.floor(new Date(p.createdAt).getTime() / 1000)))}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Allocation preview ──────────────────────────────────────────────────────

function AllocationPreviewCard({ preview }: { preview: NonNullable<ReturnType<typeof useDepositRent>['preview']> }) {
  const unallocated = BigInt(preview.unallocated);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation preview</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Holders" value={preview.holderCount.toString()} />
          <Stat label="Claimable" value={`${formatUsdc(preview.allocated)} USDC`} />
          <Stat label="Unclaimable" value={`${formatUsdc(unallocated)} USDC`} />
          <Stat label="Snapshot block" value={preview.snapshotBlock} />
        </div>

        {unallocated > 0n && (
          <Alert tone="warn">
            {formatUsdc(unallocated)} USDC is not claimable by anyone. That share belongs to tokens
            held by contracts that cannot call <code>claimRent</code> — most often the marketplace
            escrow holding listed tokens. It stays in the distributor and can be swept back to you
            after the 90-day reclaim window. Redistributing it is not possible: the contract caps
            every claim at the holder&apos;s own snapshot share, so a larger allocation would simply
            revert.
          </Alert>
        )}

        <p className="text-xs text-muted">
          Merkle root <span className="tabular">{preview.merkleRoot}</span>
        </p>

        <TableWrap>
          <Table>
            <thead>
              <Tr>
                <Th>Investor</Th>
                <Th align="right">Allocation (USDC)</Th>
              </Tr>
            </thead>
            <tbody>
              {preview.allocations.map((a) => (
                <Tr key={a.investor}>
                  <Td className="tabular">{a.investor}</Td>
                  <Td align="right" className="tabular">{formatUsdc(a.amount)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </CardBody>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-elevated px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="tabular mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}
