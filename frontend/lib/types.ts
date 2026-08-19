// ─── Property ────────────────────────────────────────────────────────────────

export enum PropertyStatus {
  None          = 0,
  Draft         = 1,
  UnderReview   = 2,
  Approved      = 3,
  OfferingOpen  = 4,
  OfferingClosed= 5,
  Trading       = 6,
  Paused        = 7,
  Delisted      = 8,
}

export const PROPERTY_STATUS_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Draft',
  2: 'Under Review',
  3: 'Approved',
  4: 'Offering Open',
  5: 'Offering Closed',
  6: 'Trading',
  7: 'Paused',
  8: 'Delisted',
};

export type Property = {
  propertyId:       bigint;
  owner:            `0x${string}`;
  metadataURI:      string;
  totalSupply:      bigint;
  pricePerToken:    bigint;
  status:           number;
  createdAt:        bigint;
  tokenAddress:     `0x${string}`;
  offeringContract: `0x${string}`;
  spvAddress:       `0x${string}`;
  legalHash:        `0x${string}`;
  jurisdiction:     number;
};

// ─── IPFS Metadata ───────────────────────────────────────────────────────────

export type IPFSMetadata = {
  name:        string;
  description: string;
  location:    string;
  imageUrl:    string;
  documents:   string[];
};

// ─── Listing ─────────────────────────────────────────────────────────────────

export enum ListingStatus {
  None      = 0,
  Active    = 1,
  Sold      = 2,
  Cancelled = 3,
}

export type Listing = {
  listingId:    bigint;
  propertyId:   bigint;
  seller:       `0x${string}`;
  tokenAmount:  bigint;
  pricePerToken:bigint;
  status:       number;
  createdAt:    bigint;
  tokenAddress: `0x${string}`;
  expiresAt:    bigint;
};
