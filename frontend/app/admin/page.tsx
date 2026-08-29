'use client';

import { useCallback, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { isAddress } from 'viem';
import { useRequireAdmin } from '@/lib/hooks/useAdminRole';
import { usePropertyCount, useProperties } from '@/lib/hooks/useProperties';
import { MarketplaceABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/format';
import { PropertyStatus } from '@/lib/types';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
} from '@/components/ui';
import AdminProperties, { type PropertyRow } from './AdminProperties';
import AdminKYC from './AdminKYC';
import RentPanel from './RentPanel';

type Tab = 'properties' | 'kyc' | 'rent' | 'fees';

const TABS: { key: Tab; label: string }[] = [
  { key: 'properties', label: 'Properties' },
  { key: 'kyc', label: 'Investors & KYC' },
  { key: 'rent', label: 'Rent distribution' },
  { key: 'fees', label: 'Protocol fees' },
];

export default function AdminPage() {
  const { isConnected } = useAccount();
  const { isAdmin, isLoading: roleLoading } = useRequireAdmin('/');
  const [tab, setTab] = useState<Tab>('properties');

  const { data: countData } = usePropertyCount();
  const count = countData ? Number(countData) : 0;
  const { properties: rawProperties, refetch: refetchProperties } = useProperties(count);

  // Self-serve listings arrive here as submissions, so surface the queue depth
  // on the tab itself — an admin should not have to open a table to notice.
  const pendingReview = rawProperties.filter(
    (p) => Number(p.status) === PropertyStatus.UnderReview,
  ).length;

  const propertyRows: PropertyRow[] = rawProperties.map((p) => ({
    id: p.propertyId.toString(),
    owner: p.owner,
    metadataURI: p.metadataURI,
    status: Number(p.status),
    totalSupply: p.totalSupply.toString(),
    pricePerToken: p.pricePerToken.toString(),
    tokenAddress: p.tokenAddress,
  }));

  const handleRefetch = useCallback(() => {
    void refetchProperties();
  }, [refetchProperties]);

  if (!isConnected) {
    return (
      <Container className="py-20">
        <EmptyState
          title="Admin access"
          description="Connect the wallet holding DEFAULT_ADMIN_ROLE to manage the registry."
          action={<ConnectButton />}
        />
      </Container>
    );
  }

  if (roleLoading) {
    return (
      <Container className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Spinner /> Checking on-chain permissions…
      </Container>
    );
  }

  if (!isAdmin) {
    return (
      <Container className="py-20">
        <EmptyState
          title="Access denied"
          description="This wallet does not hold DEFAULT_ADMIN_ROLE on the registry."
        />
      </Container>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin panel"
        description="Move properties through their lifecycle, manage investor verification, and set marketplace fees."
      />

      <Container className="py-8 sm:py-10">
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Admin sections"
          className="inline-flex gap-1 rounded-xl border border-hairline bg-surface p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-accent/12 text-accent'
                  : 'text-muted hover:bg-elevated hover:text-ink',
              )}
            >
              {t.label}
              {t.key === 'properties' && pendingReview > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warn/20 px-1.5 text-[11px] font-semibold text-warn">
                  {pendingReview}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'properties' && (
            <AdminProperties properties={propertyRows} onRefetch={handleRefetch} />
          )}
          {tab === 'kyc' && <AdminKYC />}
          {tab === 'rent' && <RentPanel properties={propertyRows} />}
          {tab === 'fees' && <FeesTab />}
        </div>
      </Container>
    </>
  );
}

// ─── Fees tab ────────────────────────────────────────────────────────────────

function FeesTab() {
  const { addresses } = useContracts();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: currentFeeBps } = useReadContract({
    address: addresses.marketplace,
    abi: MarketplaceABI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    functionName: 'feeBps' as any,
  });

  const { data: currentFeeCollector } = useReadContract({
    address: addresses.marketplace,
    abi: MarketplaceABI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    functionName: 'feeCollector' as any,
  });

  const [newFeeBps, setNewFeeBps] = useState('');
  const [newFeeCollector, setNewFeeCollector] = useState('');
  const [feeError, setFeeError] = useState('');
  const [collectorError, setCollectorError] = useState('');

  const busy = isPending || isConfirming;

  function handleSetFee() {
    const bps = parseInt(newFeeBps, 10);
    if (Number.isNaN(bps) || bps < 0 || bps > 1000) {
      setFeeError('Enter a value between 0 and 1000 bps (0–10%).');
      return;
    }
    setFeeError('');
    writeContract({
      address: addresses.marketplace,
      abi: MarketplaceABI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: 'setFee' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [bps] as any,
    });
  }

  function handleSetCollector() {
    if (!isAddress(newFeeCollector)) {
      setCollectorError('Not a valid Ethereum address.');
      return;
    }
    setCollectorError('');
    writeContract({
      address: addresses.marketplace,
      abi: MarketplaceABI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: 'setFeeCollector' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [newFeeCollector as `0x${string}`] as any,
    });
  }

  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      {/* Current state */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Current marketplace fee</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Protocol fee
            </p>
            <p className="tabular mt-1 font-display text-2xl font-semibold text-ink">
              {currentFeeBps != null ? `${Number(currentFeeBps) / 100}%` : '—'}
            </p>
            {currentFeeBps != null && (
              <p className="mt-0.5 text-xs text-muted">{String(currentFeeBps)} bps</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Fee collector
            </p>
            <p className="mt-1 break-all font-mono text-sm text-ink">
              {currentFeeCollector ? shortAddress(String(currentFeeCollector), 8) : '—'}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Update fee */}
      <Card>
        <CardHeader>
          <CardTitle>Update fee</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="New fee" htmlFor="fee-bps" hint="basis points, max 1000" error={feeError}>
            <Input
              id="fee-bps"
              type="number"
              min={0}
              max={1000}
              placeholder="250"
              value={newFeeBps}
              onChange={(e) => setNewFeeBps(e.target.value)}
              className="tabular"
            />
          </Field>
          <Button fullWidth loading={busy} onClick={handleSetFee}>
            Set fee
          </Button>
        </CardBody>
      </Card>

      {/* Update collector */}
      <Card>
        <CardHeader>
          <CardTitle>Update fee collector</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Collector address" htmlFor="fee-collector" error={collectorError}>
            <Input
              id="fee-collector"
              placeholder="0x…"
              value={newFeeCollector}
              onChange={(e) => setNewFeeCollector(e.target.value)}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </Field>
          <Button fullWidth loading={busy} onClick={handleSetCollector}>
            Set collector
          </Button>
        </CardBody>
      </Card>

      <div className="lg:col-span-2">
        <Alert tone="warn" title="These writes take effect immediately">
          Fee changes apply to every subsequent marketplace settlement. Both calls require
          DEFAULT_ADMIN_ROLE.
        </Alert>
      </div>
    </div>
  );
}
