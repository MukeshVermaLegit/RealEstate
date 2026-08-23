'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits } from 'viem';
import { useOfferingData, useMyInvestment, useInvest } from '@/lib/hooks/useOffering';
import { useHasClaimedTokens, useClaimTokens } from '@/lib/hooks/useOffering';
import { useOfferingTerms, usePaymentDecimals } from '@/lib/hooks/useCreateOffering';
import { useTokenInfo } from '@/lib/hooks/useTokenAdmin';
import { KYCRegistryABI, ERC20ABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { PropertyStatus, type Property } from '@/lib/types';
import { AddToWalletButton } from '@/components/AddToWalletButton';
import { SelfVerifyButton } from '@/components/SelfVerifyButton';
import {
  cleanTxError,
  formatDate,
  formatTokens,
  formatUsd,
  isZeroAddress,
  pctOf,
  ZERO_ADDRESS,
} from '@/lib/format';
import { Alert, Badge, Button, Progress } from '@/components/ui';

/** Property tokens are 18-decimal, and `invest()` takes token WEI, not whole tokens. */
const TOKEN_DECIMALS = 18;
const TOKEN_SCALE = 10n ** BigInt(TOKEN_DECIMALS);

/** Fractional token amounts are allowed; the contract works in wei throughout. */
function parseTokenInput(raw: string): bigint {
  const trimmed = raw.trim();
  if (!trimmed) return 0n;
  try {
    const wei = parseUnits(trimmed, TOKEN_DECIMALS);
    return wei > 0n ? wei : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Payment due for `tokenWei`, rounding UP — the same `mulDiv(..., Ceil)` the
 * offering applies, so the approval we request is never a wei short of what
 * `invest()` pulls.
 */
function costFor(tokenWei: bigint, pricePerToken: bigint): bigint {
  const numerator = tokenWei * pricePerToken;
  if (numerator === 0n) return 0n;
  return (numerator + TOKEN_SCALE - 1n) / TOKEN_SCALE;
}

function PanelRow({
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

export function InvestPanel({ property }: { property: Property }) {
  const { address: account, isConnected } = useAccount();
  const { addresses } = useContracts();

  const offeringAddress = !isZeroAddress(property.offeringContract)
    ? property.offeringContract
    : undefined;

  const { totalTokensCommitted, finalized, cancelled, refetch: refetchOffering } =
    useOfferingData(offeringAddress);

  // The offering's own immutable terms — NOT the registry's display figures. The
  // registry counts supply in whole tokens and quotes price at 18 decimals, while
  // the offering works in token wei and payment-token units.
  const terms = useOfferingTerms(offeringAddress);
  const { decimals: payDecimals } = usePaymentDecimals();

  const { tokenAmount: myTokens, lockupExpiry } = useMyInvestment(offeringAddress, account);
  const { hasClaimed, refetch: refetchClaimed } = useHasClaimedTokens(offeringAddress, account);
  const { claim, isPending: claiming, isSuccess: claimSuccess } = useClaimTokens(offeringAddress);

  const tokenInfo = useTokenInfo(
    !isZeroAddress(property.tokenAddress) ? property.tokenAddress : undefined,
  );

  const { data: isVerified, refetch: refetchVerified } = useReadContract({
    address: addresses.kycRegistry,
    abi: KYCRegistryABI,
    functionName: 'isVerified',
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: !!account },
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: addresses.paymentToken,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [account ?? ZERO_ADDRESS, offeringAddress ?? ZERO_ADDRESS],
    query: { enabled: !!account && !!offeringAddress },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  const { approve, invest, refund, isPending, isInvestSuccess, isRefundSuccess, error } =
    useInvest(offeringAddress);

  const [tokenInput, setTokenInput] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const tokenAmount = useMemo(() => parseTokenInput(tokenInput), [tokenInput]);
  const tokensAvailable =
    terms.hardCap > totalTokensCommitted ? terms.hardCap - totalTokensCommitted : 0n;
  const totalCost = costFor(tokenAmount, terms.pricePerToken);
  const needsApprove = allowance < totalCost && tokenAmount > 0n;
  const fundedPct = pctOf(totalTokensCommitted, terms.hardCap);
  const softCapMet = terms.softCap > 0n && totalTokensCommitted >= terms.softCap;

  // The registry status can lag the offering's own clock, so check both.
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const withinWindow =
    terms.startTime > 0n && nowSeconds >= terms.startTime && nowSeconds <= terms.endTime;
  const isOpen =
    property.status === PropertyStatus.OfferingOpen &&
    !cancelled &&
    !finalized &&
    withinWindow;

  /** Finalized, holds an allocation, hasn't pulled it yet — tokens are waiting. */
  const canClaim = finalized && !cancelled && myTokens > 0n && !hasClaimed;

  useEffect(() => {
    if (isInvestSuccess) {
      setSuccessMsg('Commitment confirmed. Tokens are claimable once the raise is finalised.');
      setTokenInput('');
      void refetchOffering();
      void refetchAllowance();
    }
  }, [isInvestSuccess, refetchOffering, refetchAllowance]);

  useEffect(() => {
    if (isRefundSuccess) {
      setSuccessMsg('Refund claimed successfully.');
      void refetchOffering();
    }
  }, [isRefundSuccess, refetchOffering]);

  useEffect(() => {
    if (claimSuccess) {
      setSuccessMsg('Tokens minted to your wallet.');
      refetchClaimed();
    }
  }, [claimSuccess, refetchClaimed]);

  useEffect(() => {
    if (error) setTxError(cleanTxError(error));
  }, [error]);

  const handleApprove = async () => {
    setTxError(null);
    try {
      await approve(totalCost);
      await refetchAllowance();
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const handleInvest = async () => {
    setTxError(null);
    if (tokenAmount <= 0n) {
      setTxError('Enter an amount above zero.');
      return;
    }
    if (tokenAmount > tokensAvailable) {
      setTxError(`Only ${formatTokens(tokensAvailable)} tokens remain in this offering.`);
      return;
    }
    try {
      await invest(tokenAmount);
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const handleRefund = async () => {
    setTxError(null);
    try {
      await refund();
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const handleClaim = async () => {
    setTxError(null);
    try {
      await claim();
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  return (
    <div className="lg:sticky lg:top-24">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        {/* Header */}
        <div className="border-b border-hairline bg-elevated/40 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Price per token
              </p>
              <p className="tabular mt-1 font-display text-2xl font-semibold text-ink">
                {offeringAddress
                  ? formatUsd(terms.pricePerToken, payDecimals)
                  : formatUsd(property.pricePerToken)}
              </p>
            </div>
            {!offeringAddress ? (
              // No offering deployed yet — "Closed" would imply one had opened and ended.
              <Badge tone="neutral">No offering</Badge>
            ) : isOpen ? (
              <Badge tone="positive" dot pulse>
                Open
              </Badge>
            ) : cancelled ? (
              <Badge tone="negative">Cancelled</Badge>
            ) : finalized ? (
              <Badge tone="info">Finalised</Badge>
            ) : (
              <Badge tone="neutral">Closed</Badge>
            )}
          </div>

          {/* Funding progress — measured against the offering's hard cap, which is
              what actually limits the raise. */}
          {offeringAddress && terms.hardCap > 0n && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="text-muted">
                  <span className="tabular font-medium text-ink">
                    {formatTokens(totalTokensCommitted)}
                  </span>{' '}
                  of {formatTokens(terms.hardCap)} committed
                </span>
                <span className="tabular font-medium text-accent">{fundedPct.toFixed(1)}%</span>
              </div>
              <Progress value={fundedPct} />
              {terms.softCap > 0n && (
                <p className="mt-1.5 text-[11px] text-faint">
                  {softCapMet
                    ? `Soft cap of ${formatTokens(terms.softCap)} reached — the raise can be finalised.`
                    : `${formatTokens(terms.softCap)} needed to clear the soft cap.`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-5">
          {!offeringAddress ? (
            <p className="py-2 text-sm text-muted">
              No offering contract has been deployed for this property yet.
            </p>
          ) : cancelled ? (
            <div className="space-y-3">
              <Alert tone="negative" title="Offering cancelled">
                This raise was cancelled. Committed funds are refundable from the offering contract.
              </Alert>
              {myTokens > 0n && (
                <Button variant="outline" fullWidth loading={isPending} onClick={() => void handleRefund()}>
                  Claim refund
                </Button>
              )}
            </div>
          ) : canClaim ? (
            <div className="space-y-3">
              <Alert tone="positive" title="Your tokens are ready to claim">
                The raise was finalised. Claiming mints{' '}
                <span className="tabular font-semibold">{formatTokens(myTokens)}</span> tokens
                directly to your wallet — until you do, the balance exists only as a claim on the
                offering.
              </Alert>
              <Button fullWidth size="lg" loading={claiming} onClick={() => void handleClaim()}>
                Claim {formatTokens(myTokens)} tokens
              </Button>
            </div>
          ) : !isOpen ? (
            <Alert tone="neutral" title={finalized ? 'Offering finalised' : 'Offering closed'}>
              {finalized
                ? hasClaimed
                  ? 'You have claimed your allocation. Look for this asset on the secondary market to trade it.'
                  : 'The raise completed. Look for this asset on the secondary market.'
                : withinWindow
                  ? 'This offering is not currently accepting new capital.'
                  : 'This offering is outside its subscription window.'}
            </Alert>
          ) : !isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Connect a wallet to invest in this offering.</p>
              <ConnectButton />
            </div>
          ) : !isVerified ? (
            <div className="space-y-3">
              <Alert tone="warn" title="Identity verification required">
                Your wallet is not in the on-chain identity registry, so the offering will reject
                your subscription. Verify to unlock investing.
              </Alert>
              <SelfVerifyButton onVerified={() => void refetchVerified()} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Amount */}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label
                    htmlFor="token-amount"
                    className="text-[11px] font-semibold uppercase tracking-wider text-faint"
                  >
                    Tokens to buy
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setTokenInput(formatUnits(tokensAvailable, TOKEN_DECIMALS))
                    }
                    className="text-[11px] font-semibold text-accent transition-colors hover:text-accent-hover"
                  >
                    Max {formatTokens(tokensAvailable)}
                  </button>
                </div>
                <input
                  id="token-amount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    setTxError(null);
                    setSuccessMsg(null);
                  }}
                  placeholder="0"
                  className="tabular h-12 w-full rounded-xl border border-hairline bg-elevated px-3 font-display text-lg text-ink placeholder:text-faint transition-colors hover:border-edge focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
              </div>

              {/* Cost summary */}
              <div className="space-y-2 rounded-xl border border-hairline bg-elevated/50 px-4 py-3">
                <PanelRow label="Tokens" value={formatTokens(tokenAmount)} />
                <PanelRow
                  label="Price per token"
                  value={formatUsd(terms.pricePerToken, payDecimals)}
                />
                <div className="rule-fade" />
                <PanelRow
                  label="Total cost"
                  value={formatUsd(totalCost, payDecimals)}
                  emphasis
                />
              </div>

              {/* Two-step action */}
              {needsApprove ? (
                <div className="space-y-2">
                  <Button fullWidth size="lg" loading={isPending} onClick={() => void handleApprove()}>
                    Approve {formatUsd(totalCost, payDecimals)}
                  </Button>
                  <p className="text-center text-[11px] text-faint">
                    Step 1 of 2 — allow the offering contract to pull your stablecoins
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    fullWidth
                    size="lg"
                    loading={isPending}
                    disabled={tokenAmount <= 0n}
                    onClick={() => void handleInvest()}
                  >
                    Invest {tokenAmount > 0n ? formatUsd(totalCost, payDecimals) : ''}
                  </Button>
                  {tokenAmount > 0n && (
                    <p className="text-center text-[11px] text-faint">
                      Step 2 of 2 — subscribe to the offering
                    </p>
                  )}
                </div>
              )}

              {txError && <Alert tone="negative">{txError}</Alert>}
              {successMsg && <Alert tone="positive">{successMsg}</Alert>}
            </div>
          )}

          {/* Claim/refund errors surface outside the invest branch too. */}
          {!isOpen && txError && <Alert tone="negative">{txError}</Alert>}
          {!isOpen && successMsg && <Alert tone="positive">{successMsg}</Alert>}
        </div>

        {/* My position */}
        {account && myTokens > 0n && (
          <div className="border-t border-hairline bg-elevated/30 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Your position
            </p>
            <div className="mt-2.5 space-y-2">
              <PanelRow label="Tokens committed" value={formatTokens(myTokens)} />
              <PanelRow
                label="Capital deployed"
                value={formatUsd(costFor(myTokens, terms.pricePerToken), payDecimals)}
              />
              <PanelRow
                label="Status"
                value={hasClaimed ? 'Claimed' : finalized ? 'Claimable' : 'Committed'}
              />
              {lockupExpiry > 0n && (
                <PanelRow label="Lockup expires" value={formatDate(lockupExpiry)} />
              )}
            </div>

            {hasClaimed && !isZeroAddress(property.tokenAddress) && (
              <div className="mt-3">
                <AddToWalletButton
                  tokenAddress={property.tokenAddress}
                  symbol={tokenInfo.symbol}
                  decimals={tokenInfo.decimals}
                />
                <p className="mt-1.5 text-[11px] leading-tight text-faint">
                  Each property is its own token contract, so your wallet needs the address before
                  it will show the balance.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Risk note — small, but it belongs next to a buy button */}
      <p className="text-pretty mt-3 px-1 text-[11px] leading-relaxed text-faint">
        Tokenised property interests are illiquid and may lose value. Transfers are restricted to
        verified wallets and subject to an on-chain lockup.
      </p>
    </div>
  );
}
