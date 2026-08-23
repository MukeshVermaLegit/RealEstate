'use client';

import { useChainId } from 'wagmi';
import { chains } from '@/lib/wagmi';
import { ButtonLink, Container, StatCell, StatRow } from '@/components/ui';
import { usePlatformStats } from '@/lib/hooks/usePlatformStats';
import { formatNumber, formatUsdCompact } from '@/lib/format';

function NetworkPill() {
  // The chain wagmi is actually reading from, connected or not.
  const chainId = useChainId();
  const label = chains.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/60 px-3 py-1.5 text-xs text-muted backdrop-blur">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
      </span>
      Live on <span className="font-medium text-ink">{label}</span>
    </span>
  );
}

export function Hero() {
  const { stats, isLoading, isListingsLoading } = usePlatformStats();

  return (
    <section className="relative isolate overflow-hidden bg-mesh">
      {/* Faint blueprint grid, faded out toward the edges */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-grid opacity-[0.35]"
        style={{
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(70% 60% at 50% 30%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(70% 60% at 50% 30%, black, transparent)',
        }}
      />

      <Container className="pb-16 pt-16 sm:pb-20 sm:pt-24 lg:pt-28">
        <div className="max-w-3xl">
          <NetworkPill />

          <h1 className="text-balance mt-6 font-display text-4xl font-semibold leading-[1.08] text-ink sm:text-5xl lg:text-6xl">
            Own a slice of{' '}
            <span className="text-accent-gradient">real‑world property</span>, settled on‑chain.
          </h1>

          <p className="text-pretty mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Buy fractional shares of income-producing real estate with stablecoins. Every transfer is
            compliance-gated, rent is distributed on-chain, and your position stays tradable on a
            permissioned secondary market.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/properties" size="lg">
              Browse properties
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M4 10h11M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </div>
        </div>

        {/* Live protocol metrics — every figure read from the registry / marketplace */}
        <StatRow className="mt-14 grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="Value tokenised"
            value={formatUsdCompact(stats.tokenizedValue)}
            sub="Supply × price per token"
            loading={isLoading}
            accent
          />
          <StatCell
            label="Properties"
            value={formatNumber(stats.totalProperties)}
            sub={`${stats.jurisdictions} jurisdiction${stats.jurisdictions === 1 ? '' : 's'}`}
            loading={isLoading}
          />
          <StatCell
            label="Open offerings"
            value={formatNumber(stats.openOfferings)}
            sub={`${stats.tradingAssets} trading`}
            loading={isLoading}
          />
          <StatCell
            label="Live listings"
            value={formatNumber(stats.activeListings)}
            sub="Secondary market"
            loading={isListingsLoading}
          />
        </StatRow>
      </Container>
    </section>
  );
}
