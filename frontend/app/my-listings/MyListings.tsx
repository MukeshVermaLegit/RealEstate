'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { PropertyRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { useIPFSMetadataMany } from '@/lib/hooks/useIPFSMetadata';
import { useMyListings, useReviewNotes } from '@/lib/hooks/useMyListings';
import { PROPERTY_STATUS_LABEL, PropertyStatus, type Property } from '@/lib/types';
import { propertyTone } from '@/lib/status';
import { cleanTxError, formatDate, formatNumber, formatUsd, formatUsdCompact } from '@/lib/format';
import { countryName } from '@/lib/constants/countries';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  Skeleton,
  StatCell,
  StatRow,
} from '@/components/ui';

/** What the owner can do from each lifecycle state. */
function ownerHint(status: number): string {
  switch (status) {
    case PropertyStatus.Draft:
      return 'Only you can see this. Submit it when the details are final.';
    case PropertyStatus.UnderReview:
      return 'With the platform admins. Editing is locked until they respond.';
    case PropertyStatus.Approved:
      return 'Approved. An admin opens the offering contract next.';
    case PropertyStatus.OfferingOpen:
      return 'Live — investors can buy into the primary offering now.';
    case PropertyStatus.OfferingClosed:
      return 'The raise has closed. Secondary trading opens next.';
    case PropertyStatus.Trading:
      return 'Trading on the secondary market.';
    case PropertyStatus.Paused:
      return 'An admin has paused this property.';
    case PropertyStatus.Delisted:
      return 'Removed from the platform.';
    default:
      return '';
  }
}

function ListingRow({
  property,
  name,
  imageUrl,
  reviewNote,
  onSubmit,
  submitting,
}: {
  property: Property;
  name: string;
  imageUrl: string;
  reviewNote?: string;
  onSubmit: (id: bigint) => void;
  submitting: boolean;
}) {
  const id = property.propertyId.toString();
  const isDraft = property.status === PropertyStatus.Draft;
  const valuation = property.totalSupply * property.pricePerToken;

  return (
    <Card as="li">
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Thumbnail */}
        <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-xl border border-hairline bg-elevated sm:h-20 sm:w-28">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill sizes="112px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-faint/40" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
                <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={propertyTone(property.status)} dot>
              {PROPERTY_STATUS_LABEL[property.status] ?? 'Unknown'}
            </Badge>
            <span className="font-mono text-[11px] text-faint">#{id}</span>
          </div>

          <h3 className="mt-1.5 truncate font-display text-base font-semibold text-ink">
            {name || `Property #${id}`}
          </h3>

          <p className="mt-0.5 text-xs text-muted">{ownerHint(property.status)}</p>

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-faint">Supply</dt>
              <dd className="tabular text-muted">{formatNumber(property.totalSupply)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-faint">Price</dt>
              <dd className="tabular text-muted">{formatUsd(property.pricePerToken)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-faint">Valuation</dt>
              <dd className="tabular text-muted">{formatUsdCompact(valuation)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-faint">Jurisdiction</dt>
              <dd className="text-muted">{property.jurisdiction ? countryName(property.jurisdiction) : '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-faint">Created</dt>
              <dd className="text-muted">{formatDate(property.createdAt)}</dd>
            </div>
          </dl>

          {isDraft && reviewNote && (
            <Alert tone="warn" title="Sent back by review" className="mt-3">
              {reviewNote}
            </Alert>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
          {isDraft ? (
            <>
              <Button size="sm" onClick={() => onSubmit(property.propertyId)} loading={submitting}>
                Submit for review
              </Button>
              <ButtonLink size="sm" variant="secondary" href={`/list-property?edit=${id}`}>
                Edit
              </ButtonLink>
            </>
          ) : (
            <ButtonLink size="sm" variant="secondary" href={`/properties/${id}`}>
              View listing
            </ButtonLink>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export function MyListings() {
  const { isConnected } = useAccount();
  const { addresses } = useContracts();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { properties, isPending, refetch } = useMyListings();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const uris = useMemo(() => properties.map((p) => p.metadataURI), [properties]);
  const { byUri } = useIPFSMetadataMany(uris);

  const ids = useMemo(() => properties.map((p) => p.propertyId), [properties]);
  const notes = useReviewNotes(ids);

  async function submitForReview(id: bigint) {
    if (!client) return;
    setErrorMsg('');
    setPendingId(id.toString());
    try {
      const hash = await writeContractAsync({
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        functionName: 'submitForReview',
        args: [id],
      });
      await client.waitForTransactionReceipt({ hash });
      refetch();
    } catch (err) {
      setErrorMsg(cleanTxError(err));
    } finally {
      setPendingId(null);
    }
  }

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your wallet"
        description="Listings are owned by the wallet that created them, so this page needs a connection to know which are yours."
        action={<ConnectButton />}
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="You have not listed a property yet"
        description="Publish an asset's details to IPFS and write it into the registry as a draft. It stays private to you until an admin reviews and approves it."
        action={<ButtonLink href="/list-property">List a property</ButtonLink>}
      />
    );
  }

  const drafts = properties.filter((p) => p.status === PropertyStatus.Draft).length;
  const inReview = properties.filter((p) => p.status === PropertyStatus.UnderReview).length;
  const live = properties.filter(
    (p) => p.status === PropertyStatus.OfferingOpen || p.status === PropertyStatus.Trading,
  ).length;

  return (
    <div className="space-y-5">
      <StatRow className="grid-cols-2 lg:grid-cols-4">
        <StatCell label="Listings" value={String(properties.length)} />
        <StatCell label="Drafts" value={String(drafts)} />
        <StatCell label="In review" value={String(inReview)} />
        <StatCell label="Live" value={String(live)} accent={live > 0} />
      </StatRow>

      {errorMsg && <Alert tone="negative">{errorMsg}</Alert>}

      <ul className="space-y-3">
        {properties.map((property) => {
          const meta = byUri[property.metadataURI];
          return (
            <ListingRow
              key={property.propertyId.toString()}
              property={property}
              name={meta?.name ?? ''}
              imageUrl={meta?.imageUrl ?? ''}
              reviewNote={notes[property.propertyId.toString()]?.reason}
              onSubmit={submitForReview}
              submitting={pendingId === property.propertyId.toString()}
            />
          );
        })}
      </ul>

      <p className="text-center text-xs text-muted">
        Need another one?{' '}
        <Link href="/list-property" className="text-accent transition-colors hover:text-accent-hover">
          List a property
        </Link>
      </p>
    </div>
  );
}
