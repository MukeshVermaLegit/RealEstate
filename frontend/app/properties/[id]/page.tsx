'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useChainId } from 'wagmi';
import { useProperty } from '@/lib/hooks/useProperties';
import { useIPFSMetadata, ipfsToHttp } from '@/lib/hooks/useIPFSMetadata';
import { PROPERTY_STATUS_LABEL, PropertyStatus } from '@/lib/types';
import { propertyTone } from '@/lib/status';
import { countryName } from '@/lib/constants/countries';
import {
  formatDate,
  formatNumber,
  formatUsd,
  formatUsdCompact,
  isZeroAddress,
  shortAddress,
  truncateHex,
} from '@/lib/format';
import { explorerAddressUrl, explorerTokenUrl } from '@/lib/explorer';
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Skeleton,
  SkeletonText,
} from '@/components/ui';
import { IpfsUri } from '@/components/IpfsUri';
import { PropertyGallery } from '@/components/PropertyGallery';
import { parseIpfsUri, shortCid } from '@/lib/ipfs';
import { InvestPanel } from './InvestPanel';

// ─── Small building blocks ───────────────────────────────────────────────────

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className="tabular mt-1 truncate font-display text-lg font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

function DataRow({
  label,
  value,
  href,
  mono = false,
}: {
  label: string;
  value: string;
  href?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 break-all text-right text-accent transition-colors hover:text-accent-hover ${
            mono ? 'font-mono text-xs' : 'text-sm'
          }`}
        >
          {value}
          <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M6 3h7v7M13 3 6.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 12.5V13H3V5h.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ) : (
        <span className={`break-all text-right text-ink ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
          {value}
        </span>
      )}
    </div>
  );
}

/** Prefer the filename inside an `ipfs://<cid>/<path>` document link, else a serial label. */
function docLabel(uri: string, index: number): string {
  const path = parseIpfsUri(uri)?.path;
  const filename = path ? path.split('/').pop() : '';
  return filename || `Document ${index + 1}`;
}

/** The CID a document link resolves to, so a reader can verify it independently. */
function docCid(uri: string): string {
  const parsed = parseIpfsUri(uri);
  return parsed ? `ipfs · ${shortCid(parsed.cid, 8)}` : uri;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
  // `useParams` works whether the router hands params over synchronously (Next 14)
  // or as a promise (Next 15) — `use(params)` throws on the former.
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const chainId = useChainId();

  let propertyId: bigint;
  try {
    propertyId = BigInt(id);
  } catch {
    propertyId = 0n;
  }

  const { data: property, isPending: propLoading } = useProperty(propertyId);
  const { data: meta, isPending: metaLoading } = useIPFSMetadata(property?.metadataURI ?? '');

  if (propLoading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-4 w-48" />
        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (!property || property.propertyId === 0n) {
    return (
      <Container className="py-20">
        <EmptyState
          title="Property not found"
          description={`No property with id #${id} exists in the registry on this network.`}
          action={
            <ButtonLink href="/properties" variant="secondary" size="sm">
              Back to properties
            </ButtonLink>
          }
        />
      </Container>
    );
  }

  const imageUrl = meta?.imageUrl ? ipfsToHttp(meta.imageUrl) : '';
  const galleryUrls = meta?.imageUrls?.length ? meta.imageUrls : imageUrl ? [imageUrl] : [];
  const name = meta?.name || `Property #${property.propertyId}`;
  const location = meta?.location || (property.jurisdiction ? countryName(property.jurisdiction) : '');
  const valuation = property.totalSupply * property.pricePerToken;

  return (
    <Container className="py-8 sm:py-10">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-faint">
        <Link href="/properties" className="transition-colors hover:text-ink">
          Properties
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-muted">{metaLoading ? `#${id}` : name}</span>
      </nav>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-3">
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Hero image */}
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-hairline bg-elevated">
            {metaLoading ? (
              <Skeleton className="absolute inset-0 rounded-none" />
            ) : galleryUrls.length > 0 ? (
              <PropertyGallery urls={galleryUrls} alt={name} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-14 w-14 text-faint/40" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
                  <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-base/80 via-base/10 to-base/20" />

            {/* Title over the photo */}
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={propertyTone(property.status)}
                  dot
                  pulse={property.status === PropertyStatus.OfferingOpen}
                >
                  {PROPERTY_STATUS_LABEL[property.status] ?? 'Unknown'}
                </Badge>
                <span className="rounded-md border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[11px] text-white/80 backdrop-blur">
                  #{property.propertyId.toString()}
                </span>
              </div>
              {metaLoading ? (
                <Skeleton className="mt-3 h-8 w-2/3" />
              ) : (
                <h1 className="text-balance mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">
                  {name}
                </h1>
              )}
              {location && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/70">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <path d="M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8Z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="8" cy="6" r="1.75" />
                  </svg>
                  {location}
                </p>
              )}
            </div>
          </div>

          {/* Key facts */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-4">
            <Fact label="Per token" value={formatUsd(property.pricePerToken)} />
            <Fact label="Total supply" value={formatNumber(property.totalSupply)} sub="fractional tokens" />
            <Fact label="Valuation" value={formatUsdCompact(valuation)} sub="supply × price" />
            <Fact
              label="Jurisdiction"
              value={property.jurisdiction ? countryName(property.jurisdiction) : '—'}
              sub={property.jurisdiction ? `ISO ${property.jurisdiction}` : undefined}
            />
          </div>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>About this property</CardTitle>
            </CardHeader>
            <CardBody>
              {metaLoading ? (
                <SkeletonText lines={4} />
              ) : meta?.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                  {meta.description}
                </p>
              ) : (
                <p className="text-sm text-faint">No description was published with this property.</p>
              )}
            </CardBody>
          </Card>

          {/* On-chain details */}
          <Card>
            <CardHeader>
              <CardTitle>On-chain details</CardTitle>
            </CardHeader>
            <CardBody className="divide-y divide-hairline py-1">
              <DataRow label="Property ID" value={`#${property.propertyId}`} />
              <DataRow
                label="Owner"
                value={shortAddress(property.owner, 6)}
                href={explorerAddressUrl(chainId, property.owner)}
                mono
              />
              <DataRow
                label="Token contract"
                value={isZeroAddress(property.tokenAddress) ? '— not deployed' : shortAddress(property.tokenAddress, 6)}
                href={isZeroAddress(property.tokenAddress) ? null : explorerTokenUrl(chainId, property.tokenAddress)}
                mono
              />
              <DataRow
                label="Offering contract"
                value={isZeroAddress(property.offeringContract) ? '— none' : shortAddress(property.offeringContract, 6)}
                href={isZeroAddress(property.offeringContract) ? null : explorerAddressUrl(chainId, property.offeringContract)}
                mono
              />
              <DataRow
                label="SPV address"
                value={isZeroAddress(property.spvAddress) ? '— not set' : shortAddress(property.spvAddress, 6)}
                href={isZeroAddress(property.spvAddress) ? null : explorerAddressUrl(chainId, property.spvAddress)}
                mono
              />
              <DataRow label="Legal pack hash" value={truncateHex(property.legalHash, 8)} mono />
              <DataRow label="Registered" value={formatDate(property.createdAt)} />
              <div className="py-3">
                <IpfsUri uri={property.metadataURI} label="Metadata URI" />
              </div>
            </CardBody>
          </Card>

          {/* Documents */}
          {meta?.documents && meta.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Legal documents</CardTitle>
              </CardHeader>
              <CardBody className="grid gap-2 sm:grid-cols-2">
                {meta.documents.map((doc, i) => (
                  <a
                    key={i}
                    href={ipfsToHttp(doc)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-hairline bg-elevated px-4 py-3 transition-colors hover:border-accent/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-faint transition-colors group-hover:text-accent">
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <path d="M9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V5.5L9.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9.5 2v3.5H13" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {docLabel(doc, i)}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-faint">
                        {docCid(doc)}
                      </span>
                    </span>
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                      <path d="M6 3h7v7M13 3 6.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                ))}
                <p className="text-[11px] leading-relaxed text-faint sm:col-span-2">
                  Each document is addressed by its IPFS CID — a hash of the file itself. The link
                  opens it through a public gateway; re-hashing the download reproduces the same CID.
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <InvestPanel property={property} />
        </div>
      </div>
    </Container>
  );
}
