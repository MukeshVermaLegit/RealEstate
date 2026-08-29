'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits } from 'viem';
import Link from 'next/link';
import { useHoldings, type Holding } from '../../lib/hooks/usePortfolio';
import { AddToWalletButton } from '../../components/AddToWalletButton';
import { useRentClaims, useClaimRent, type ClaimItem } from '../../lib/hooks/useRentClaims';
import { useIPFSMetadata } from '../../lib/hooks/useIPFSMetadata';
import { ClaimButton } from '../../components/ClaimButton';
import { DelegateButton } from '../../components/DelegateButton';
import { cleanTxError, formatNumber, formatTokens, formatUsd, formatUsdCompact } from '../../lib/format';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  PageHeader,
  Spinner,
  StatCell,
  StatRow,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

/** Decimals of the payment token (USDC = 6). Update if using a different token. */
const PAYMENT_TOKEN_DECIMALS = 6;

function formatRent(amount: bigint): string {
  return parseFloat(formatUnits(amount, PAYMENT_TOKEN_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Cells ───────────────────────────────────────────────────────────────────

function PropertyNameCell({ uri, id }: { uri: string; id: bigint }) {
  const { data } = useIPFSMetadata(uri);
  return (
    <Link
      href={`/properties/${id}`}
      className="font-medium text-ink transition-colors hover:text-accent"
    >
      {data?.name || `Property #${id}`}
    </Link>
  );
}

function LockupCell({ expiry }: { expiry: bigint }) {
  if (expiry === 0n) return <span className="text-faint">—</span>;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const date = new Date(Number(expiry) * 1000).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (expiry > now) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="tabular">{date}</span>
        <Badge tone="warn">Locked</Badge>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular text-muted">{date}</span>
      <Badge tone="positive">Unlocked</Badge>
    </span>
  );
}

/** pricePerToken is 18-dec USD; balance is an 18-dec token amount. */
function holdingValue(h: Holding): bigint {
  return h.balance > 0n ? (h.pricePerToken * h.balance) / 10n ** 18n : 0n;
}

// ─── Holdings ────────────────────────────────────────────────────────────────

function HoldingsSection({ holdings, isLoading }: { holdings: Holding[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My holdings</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted">
          <Spinner /> Reading token balances…
        </div>
      ) : holdings.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="No property tokens yet"
            description="Invest in an open offering and your position will show up here with its lockup and current value."
            action={
              <ButtonLink href="/properties" variant="secondary" size="sm">
                Browse open offerings
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <>
          {/* Holders of pre-fix tokens have zero voting power and cannot claim
              rent until they delegate once. Surfaced per position because it is
              a per-token state, not a per-wallet one. */}
          <div className="space-y-3 px-5 pt-5 empty:hidden">
            {holdings.map((h) => (
              <DelegateButton key={h.tokenAddress} tokenAddress={h.tokenAddress} />
            ))}
          </div>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th align="right">Tokens held</Th>
                <Th align="right">% of supply</Th>
                <Th>Lockup</Th>
                <Th align="right">Current value</Th>
                <Th>Wallet</Th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const pct =
                  h.totalSupply > 0n
                    ? (Number((h.balance * 10000n) / h.totalSupply) / 100).toFixed(2)
                    : '0.00';
                return (
                  <Tr key={h.propertyId.toString()}>
                    <Td>
                      <PropertyNameCell uri={h.metadataURI} id={h.propertyId} />
                    </Td>
                    <Td align="right" className="tabular">
                      {formatTokens(h.balance)}
                    </Td>
                    <Td align="right" className="tabular">
                      {pct}%
                    </Td>
                    <Td>
                      <LockupCell expiry={h.lockupExpiry} />
                    </Td>
                    <Td align="right" className="tabular font-medium text-ink">
                      {formatUsd(holdingValue(h))}
                    </Td>
                    <Td>
                      <AddToWalletButton tokenAddress={h.tokenAddress} symbol={h.symbol} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
        </>
      )}
    </Card>
  );
}

// ─── Unclaimed rent ──────────────────────────────────────────────────────────

function UnclaimedRentSection({
  claims,
  totalClaimable,
  isLoading,
  onClaimSuccess,
}: {
  claims: ClaimItem[];
  totalClaimable: bigint;
  isLoading: boolean;
  onClaimSuccess: () => void;
}) {
  const { claimMultiple, invalidateClaims } = useClaimRent();

  const [signing, setSigning] = useState(false);
  const [claimAllHash, setClaimAllHash] = useState<`0x${string}` | undefined>();
  const [claimAllError, setClaimAllError] = useState('');
  const [done, setDone] = useState(false);

  const { isLoading: waitingAll, isSuccess: claimAllSuccess } = useWaitForTransactionReceipt({
    hash: claimAllHash,
  });

  useEffect(() => {
    if (claimAllSuccess) {
      setDone(true);
      void invalidateClaims();
      onClaimSuccess();
    }
  }, [claimAllSuccess, invalidateClaims, onClaimSuccess]);

  const handleClaimAll = async () => {
    if (claims.length === 0) return;
    setSigning(true);
    setClaimAllError('');
    try {
      const hash = await claimMultiple(claims);
      setClaimAllHash(hash);
    } catch (e) {
      setClaimAllError(cleanTxError(e, 90));
    } finally {
      setSigning(false);
    }
  };

  const claimAllLoading = signing || waitingAll;

  return (
    <Card>
      <CardHeader
        action={
          claims.length > 1 ? (
            <Button
              size="sm"
              loading={claimAllLoading}
              disabled={done}
              onClick={() => void handleClaimAll()}
            >
              {done ? 'All claimed' : waitingAll ? 'Confirming…' : 'Claim all'}
            </Button>
          ) : undefined
        }
      >
        <CardTitle>Unclaimed rent</CardTitle>
        {totalClaimable > 0n && (
          <p className="mt-1 text-xs text-muted">
            <span className="tabular font-semibold text-accent">{formatRent(totalClaimable)} USDC</span>{' '}
            available across {claims.length} period{claims.length === 1 ? '' : 's'}
          </p>
        )}
      </CardHeader>

      {claimAllError && (
        <div className="px-5 pt-4">
          <Alert tone="negative">{claimAllError}</Alert>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted">
          <Spinner /> Scanning on-chain rent periods…
        </div>
      ) : claims.length === 0 ? (
        <p className="px-5 py-10 text-sm text-muted">
          No unclaimed rent right now. Distributions appear here once a period is published.
        </p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th align="right">Period</Th>
                <Th align="right">Amount (USDC)</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <Tr key={`${claim.propertyId}-${claim.periodId}`}>
                  <Td>
                    <Link
                      href={`/properties/${claim.propertyId}`}
                      className="font-medium text-ink transition-colors hover:text-accent"
                    >
                      Property #{claim.propertyId.toString()}
                    </Link>
                  </Td>
                  <Td align="right" className="tabular">
                    #{claim.periodId.toString()}
                  </Td>
                  <Td align="right" className="tabular font-semibold text-ink">
                    {formatRent(claim.amount)}
                  </Td>
                  <Td align="right">
                    <ClaimButton item={claim} onSuccess={onClaimSuccess} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();

  const { holdings, isLoading: holdingsLoading } = useHoldings(address);
  const propertyIds = useMemo(() => holdings.map((h) => h.propertyId), [holdings]);

  const {
    claims,
    totalClaimable,
    isLoading: claimsLoading,
    refetch: refetchClaims,
  } = useRentClaims(address, propertyIds);

  const [toast, setToast] = useState<string | null>(null);

  const handleClaimSuccess = useCallback(() => {
    setToast('Rent claimed successfully.');
  }, []);

  // Auto-dismiss the toast; the timer is cleared properly on unmount/replace.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const portfolioValue = useMemo(
    () => holdings.reduce((sum, h) => sum + holdingValue(h), 0n),
    [holdings],
  );

  if (!isConnected) {
    return (
      <>
        <PageHeader title="My portfolio" description="Your positions, lockups and rent claims." />
        <Container className="py-10">
          <EmptyState
            title="Connect your wallet"
            description="Your holdings are derived from on-chain token balances, so there is nothing to show until a wallet is connected."
            action={<ConnectButton />}
          />
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My portfolio"
        description="Positions, lockups and claimable rent — all read directly from the token and distributor contracts."
        action={
          <Button variant="secondary" onClick={() => void refetchClaims()}>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v3h-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </Button>
        }
      />

      <Container className="space-y-6 py-8 sm:py-10">
        {/* Summary */}
        <StatRow className="grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="Portfolio value"
            value={formatUsdCompact(portfolioValue)}
            sub="At registry price per token"
            loading={holdingsLoading}
            accent
          />
          <StatCell
            label="Properties held"
            value={formatNumber(holdings.length)}
            loading={holdingsLoading}
          />
          <StatCell
            label="Claimable rent"
            value={`${formatRent(totalClaimable)} USDC`}
            sub={`${claims.length} period${claims.length === 1 ? '' : 's'}`}
            loading={claimsLoading}
          />
          <StatCell
            label="Locked positions"
            value={formatNumber(
              holdings.filter((h) => h.lockupExpiry > BigInt(Math.floor(Date.now() / 1000))).length,
            )}
            sub="Not yet transferable"
            loading={holdingsLoading}
          />
        </StatRow>

        <HoldingsSection holdings={holdings} isLoading={holdingsLoading} />

        <UnclaimedRentSection
          claims={claims}
          totalClaimable={totalClaimable}
          isLoading={claimsLoading}
          onClaimSuccess={handleClaimSuccess}
        />
      </Container>

      {/* Toast */}
      {toast && (
        <div className="animate-fade-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
          <button
            onClick={() => setToast(null)}
            className="flex items-center gap-2.5 rounded-xl border border-positive/30 bg-overlay px-4 py-3 text-sm font-medium text-positive shadow-lift"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m5 10.5 3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {toast}
          </button>
        </div>
      )}
    </>
  );
}
