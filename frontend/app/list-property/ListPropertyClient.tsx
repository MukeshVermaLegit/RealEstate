'use client';

import { useSearchParams } from 'next/navigation';
import { useProperty } from '@/lib/hooks/useProperties';
import { useIPFSMetadata } from '@/lib/hooks/useIPFSMetadata';
import { PropertyStatus, PROPERTY_STATUS_LABEL } from '@/lib/types';
import { ListingWizard } from '@/components/listing/ListingWizard';
import { Alert, ButtonLink, Skeleton } from '@/components/ui';

/**
 * `/list-property`            → create a new draft
 * `/list-property?edit=<id>`  → revise an existing draft
 */
export function ListPropertyClient() {
  const params = useSearchParams();
  const editId = params.get('edit');

  let propertyId = 0n;
  if (editId) {
    try {
      propertyId = BigInt(editId);
    } catch {
      propertyId = 0n;
    }
  }

  const { data: property, isPending } = useProperty(propertyId);
  const { data: meta, isPending: metaLoading } = useIPFSMetadata(property?.metadataURI ?? '');

  if (!editId) return <ListingWizard mode="create" />;

  if (propertyId === 0n) {
    return (
      <Alert tone="negative" title="Listing not found">
        &quot;{editId}&quot; is not a valid property id.
      </Alert>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!property || property.propertyId === 0n) {
    return (
      <Alert tone="negative" title="Listing not found">
        No property with id #{editId} exists in the registry on this network.
      </Alert>
    );
  }

  // Only a Draft is editable by its owner — the contract enforces this too, but
  // failing here saves the user a rejected transaction.
  if (property.status !== PropertyStatus.Draft) {
    return (
      <Alert tone="warn" title="This listing is locked">
        <p>
          Property #{property.propertyId.toString()} is{' '}
          <strong>{PROPERTY_STATUS_LABEL[property.status] ?? 'in an unknown state'}</strong>. A
          listing can only be edited while it is a Draft — once it is submitted, the record is what
          admins review and investors buy against.
        </p>
        <div className="mt-3 flex gap-2">
          <ButtonLink href="/my-listings" size="sm" variant="secondary">
            My listings
          </ButtonLink>
          <ButtonLink href={`/properties/${property.propertyId}`} size="sm" variant="ghost">
            View listing
          </ButtonLink>
        </div>
      </Alert>
    );
  }

  return (
    <ListingWizard
      mode="edit"
      property={property}
      existingMeta={meta}
      metaLoading={metaLoading}
    />
  );
}
