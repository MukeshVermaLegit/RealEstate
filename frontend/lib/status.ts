import type { Tone } from '@/components/ui/Badge';
import { PropertyStatus, ListingStatus } from './types';

/** Badge tone per property lifecycle state. */
const PROPERTY_TONE: Record<number, Tone> = {
  [PropertyStatus.OfferingOpen]:   'positive',
  [PropertyStatus.Trading]:        'info',
  [PropertyStatus.UnderReview]:    'warn',
  [PropertyStatus.Approved]:       'accent',
  [PropertyStatus.Paused]:         'negative',
  [PropertyStatus.OfferingClosed]: 'neutral',
  [PropertyStatus.Draft]:          'neutral',
  [PropertyStatus.Delisted]:       'neutral',
  [PropertyStatus.None]:           'neutral',
};

export function propertyTone(status: number): Tone {
  return PROPERTY_TONE[status] ?? 'neutral';
}

/**
 * Should this property appear on investor-facing browse surfaces?
 *
 * Registration is permissionless, so the registry now holds drafts belonging to
 * anyone with a wallet. A Draft is private to its owner (see /my-listings) and a
 * Delisted property has been removed, so neither belongs in a public list.
 */
export function isPubliclyListed(status: number): boolean {
  return (
    status !== PropertyStatus.None &&
    status !== PropertyStatus.Draft &&
    status !== PropertyStatus.Delisted
  );
}

/**
 * Should this property count toward headline platform metrics?
 *
 * Stricter than {@link isPubliclyListed}: anyone can register a listing and
 * submit it for review in two transactions, so counting unreviewed submissions
 * would let a stranger move the platform's "tokenised value" figure. Only
 * properties an admin has actually approved contribute.
 */
export function countsTowardStats(status: number): boolean {
  return (
    status === PropertyStatus.Approved ||
    status === PropertyStatus.OfferingOpen ||
    status === PropertyStatus.OfferingClosed ||
    status === PropertyStatus.Trading ||
    status === PropertyStatus.Paused
  );
}

/** Statuses where the offering is live and accepting capital. */
export function isInvestable(status: number): boolean {
  return status === PropertyStatus.OfferingOpen;
}

/** Statuses where secondary trading is expected to be possible. */
export function isTradable(status: number): boolean {
  return status === PropertyStatus.Trading;
}

const LISTING_TONE: Record<number, Tone> = {
  [ListingStatus.Active]:    'positive',
  [ListingStatus.Sold]:      'info',
  [ListingStatus.Cancelled]: 'neutral',
  [ListingStatus.None]:      'neutral',
};

export function listingTone(status: number): Tone {
  return LISTING_TONE[status] ?? 'neutral';
}
