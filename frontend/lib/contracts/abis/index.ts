// ─── PropertyRegistry ────────────────────────────────────────────────────────
export const PropertyRegistryABI = [
  // Functions
  {
    type: 'function',
    name: 'registerProperty',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'metadataURI',   type: 'string'  },
      { name: 'totalSupply',   type: 'uint256' },
      { name: 'pricePerToken', type: 'uint256' },
      { name: 'spvAddress',    type: 'address' },
      { name: 'legalHash',     type: 'bytes32' },
      { name: 'jurisdiction',  type: 'uint16'  },
    ],
    outputs: [{ name: 'propertyId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getProperty',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'propertyId',       type: 'uint256'  },
          { name: 'owner',            type: 'address'  },
          { name: 'metadataURI',      type: 'string'   },
          { name: 'totalSupply',      type: 'uint256'  },
          { name: 'pricePerToken',    type: 'uint256'  },
          { name: 'status',           type: 'uint8'    }, // PropertyStatus enum
          { name: 'createdAt',        type: 'uint256'  },
          { name: 'tokenAddress',     type: 'address'  },
          { name: 'offeringContract', type: 'address'  },
          { name: 'spvAddress',       type: 'address'  },
          { name: 'legalHash',        type: 'bytes32'  },
          { name: 'jurisdiction',     type: 'uint16'   },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'totalProperties',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // RentDistributor resolves the token through the REGISTRY, so rent tooling must
  // read it from here rather than from the factory's copy.
  {
    type: 'function',
    name: 'getPropertyToken',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'submitForReview',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approveProperty',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'rejectSubmission',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId', type: 'uint256' },
      { name: 'reason',     type: 'string'  },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateMetadata',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId', type: 'uint256' },
      { name: 'newURI',     type: 'string'  },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateOfferingTerms',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',    type: 'uint256' },
      { name: 'totalSupply',   type: 'uint256' },
      { name: 'pricePerToken', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateLegalDetails',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',   type: 'uint256' },
      { name: 'spvAddress',   type: 'address' },
      { name: 'legalHash',    type: 'bytes32' },
      { name: 'jurisdiction', type: 'uint16'  },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'openOffering',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',       type: 'uint256' },
      { name: 'offeringContract', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'closeOffering',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'openTrading',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pauseProperty',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'delistProperty',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'PROPERTY_ADMIN_ROLE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'grantRole',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Events
  {
    type: 'event',
    name: 'PropertyRegistered',
    inputs: [
      { name: 'propertyId',  type: 'uint256', indexed: true  },
      { name: 'owner',       type: 'address', indexed: true  },
      { name: 'metadataURI', type: 'string',  indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PropertyStatusUpdated',
    inputs: [
      { name: 'propertyId', type: 'uint256', indexed: true  },
      { name: 'oldStatus',  type: 'uint8',   indexed: false },
      { name: 'newStatus',  type: 'uint8',   indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PropertyMetadataUpdated',
    inputs: [
      { name: 'propertyId', type: 'uint256', indexed: true  },
      { name: 'newURI',     type: 'string',  indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PropertySubmissionRejected',
    inputs: [
      { name: 'propertyId', type: 'uint256', indexed: true  },
      { name: 'reason',     type: 'string',  indexed: false },
    ],
  },
] as const;

// ─── KYCRegistry ─────────────────────────────────────────────────────────────
export const KYCRegistryABI = [
  {
    type: 'function',
    name: 'verify',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account',      type: 'address' },
      { name: 'countryCode',  type: 'uint16'  },
      { name: 'investorType', type: 'uint8'   },
      { name: 'expiresAt',    type: 'uint48'  },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revoke',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'freeze',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unfreeze',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isVerified',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getInvestorRecord',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'verified',     type: 'bool'    },
          { name: 'countryCode',  type: 'uint16'  },
          { name: 'investorType', type: 'uint8'   },
          { name: 'verifiedAt',   type: 'uint48'  },
          { name: 'expiresAt',    type: 'uint48'  },
          { name: 'frozen',       type: 'bool'    },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'AccountVerified',
    inputs: [
      { name: 'account',      type: 'address', indexed: true  },
      { name: 'verifiedBy',   type: 'address', indexed: true  },
      { name: 'countryCode',  type: 'uint16',  indexed: false },
      { name: 'investorType', type: 'uint8',   indexed: false },
      { name: 'expiresAt',    type: 'uint48',  indexed: false },
      { name: 'timestamp',    type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AccountRevoked',
    inputs: [
      { name: 'account',   type: 'address', indexed: true  },
      { name: 'revokedBy', type: 'address', indexed: true  },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AccountFrozen',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'AccountUnfrozen',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
    ],
  },
  {
    type: 'function',
    name: 'selfVerify',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

// ─── Marketplace ─────────────────────────────────────────────────────────────
export const MarketplaceABI = [
  {
    type: 'function',
    name: 'createListing',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',    type: 'uint256' },
      { name: 'tokenAmount',   type: 'uint256' },
      { name: 'pricePerToken', type: 'uint256' },
      { name: 'expiresAt',     type: 'uint48'  },
    ],
    outputs: [{ name: 'listingId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'buyListing',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'amount',    type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelListing',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getListing',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'listingId',    type: 'uint256' },
          { name: 'propertyId',   type: 'uint256' },
          { name: 'seller',       type: 'address' },
          { name: 'tokenAmount',  type: 'uint256' },
          { name: 'pricePerToken',type: 'uint256' },
          { name: 'status',       type: 'uint8'   }, // ListingStatus enum
          { name: 'createdAt',    type: 'uint256' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'expiresAt',    type: 'uint48'  },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'nextListingId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'ListingCreated',
    inputs: [
      { name: 'listingId',    type: 'uint256', indexed: true  },
      { name: 'propertyId',   type: 'uint256', indexed: true  },
      { name: 'seller',       type: 'address', indexed: true  },
      { name: 'tokenAmount',  type: 'uint256', indexed: false },
      { name: 'pricePerToken',type: 'uint256', indexed: false },
      { name: 'expiresAt',    type: 'uint48',  indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ListingPurchased',
    inputs: [
      { name: 'listingId', type: 'uint256', indexed: true  },
      { name: 'buyer',     type: 'address', indexed: true  },
      { name: 'amount',    type: 'uint256', indexed: false },
      { name: 'totalPaid', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ListingCancelled',
    inputs: [
      { name: 'listingId', type: 'uint256', indexed: true  },
      { name: 'seller',    type: 'address', indexed: true  },
    ],
  },
] as const;

// ─── RentDistributor ─────────────────────────────────────────────────────────
export const RentDistributorABI = [
  {
    type: 'function',
    name: 'depositRent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',    type: 'uint256' },
      { name: 'amount',        type: 'uint256' },
      { name: 'merkleRoot',    type: 'bytes32' },
      { name: 'snapshotBlock', type: 'uint256' },
    ],
    outputs: [{ name: 'periodId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimRent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',      type: 'uint256'   },
      { name: 'periodId',        type: 'uint256'   },
      { name: 'claimableAmount', type: 'uint256'   },
      { name: 'merkleProof',     type: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimMultiple',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyIds', type: 'uint256[]'   },
      { name: 'periodIds',   type: 'uint256[]'   },
      { name: 'amounts',     type: 'uint256[]'   },
      { name: 'proofs',      type: 'bytes32[][]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reclaimUnclaimed',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId', type: 'uint256' },
      { name: 'periodId',   type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getRentPeriod',
    stateMutability: 'view',
    inputs: [
      { name: 'propertyId', type: 'uint256' },
      { name: 'periodId',   type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'propertyId',      type: 'uint256' },
          { name: 'totalRent',       type: 'uint256' },
          { name: 'totalClaimed',    type: 'uint256' },
          { name: 'merkleRoot',      type: 'bytes32' },
          { name: 'depositor',       type: 'address' },
          { name: 'reclaimDeadline', type: 'uint256' },
          { name: 'snapshotBlock',   type: 'uint256' },
          { name: 'reclaimed',       type: 'bool'    },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'periodCount',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hasClaimed',
    stateMutability: 'view',
    inputs: [
      { name: 'propertyId', type: 'uint256' },
      { name: 'periodId',   type: 'uint256' },
      { name: 'account',    type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Must match src/utils/Events.sol exactly — an extra input changes topic0 and
  // the log stops matching. `snapshotBlock` is NOT emitted; read it back with
  // getRentPeriod instead.
  {
    type: 'event',
    name: 'RentDeposited',
    inputs: [
      { name: 'propertyId', type: 'uint256', indexed: true  },
      { name: 'periodId',   type: 'uint256', indexed: true  },
      { name: 'amount',     type: 'uint256', indexed: false },
      { name: 'merkleRoot', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RentClaimed',
    inputs: [
      { name: 'propertyId', type: 'uint256', indexed: true  },
      { name: 'periodId',   type: 'uint256', indexed: true  },
      { name: 'claimant',   type: 'address', indexed: true  },
      { name: 'amount',     type: 'uint256', indexed: false },
    ],
  },
] as const;

// ─── PropertyToken ───────────────────────────────────────────────────────────
export const PropertyTokenABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getPastVotes',
    stateMutability: 'view',
    inputs: [
      { name: 'account',     type: 'address' },
      { name: 'timepoint',   type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // The denominator RentDistributor uses for the per-holder entitlement cap.
  {
    type: 'function',
    name: 'getPastTotalSupply',
    stateMutability: 'view',
    inputs: [{ name: 'timepoint', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // ERC20Votes only checkpoints accounts that have delegated. Tokens from the
  // original factory did not self-delegate, so holders must call delegate(self)
  // once or their rent entitlement is computed as zero.
  {
    type: 'function',
    name: 'delegates',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'delegate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'delegatee', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'lockupExpiry',
    stateMutability: 'view',
    inputs: [{ name: 'investor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value',   type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'maxSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'MINTER_ROLE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'grantRole',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ─── PropertyFactory ─────────────────────────────────────────────────────────
export const PropertyFactoryABI = [
  {
    type: 'function',
    name: 'createPropertyToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'propertyId',           type: 'uint256' },
      { name: 'name',                 type: 'string'  },
      { name: 'symbol',               type: 'string'  },
      { name: 'maxSupply',            type: 'uint256' },
      { name: 'registryAddr',         type: 'address' },
      { name: 'kycRegistryAddr',      type: 'address' },
      { name: 'complianceModuleAddr', type: 'address' },
    ],
    outputs: [{ name: 'tokenAddress', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getPropertyToken',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'FACTORY_ROLE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ─── PropertyOffering ────────────────────────────────────────────────────────
export const PropertyOfferingABI = [
  {
    type: 'function',
    name: 'invest',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenAmount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeOffering',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelOffering',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getInvestment',
    stateMutability: 'view',
    inputs: [{ name: 'investor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalTokensCommitted',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'finalized',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'cancelled',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getLockupExpiry',
    stateMutability: 'view',
    inputs: [{ name: 'investor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'pricePerToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hardCap',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'softCap',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'startTime',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'endTime',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'lockupDuration',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'lockupExpiry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalPaymentsReceived',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenAddress',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'paymentToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'hasClaimedTokens',
    stateMutability: 'view',
    inputs: [{ name: 'investor', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'claimTokens',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'expireOffering',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

// ─── PriceOracle ─────────────────────────────────────────────────────────────
export const PriceOracleABI = [
  {
    type: 'function',
    name: 'getPrice',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [
      { name: 'price',       type: 'uint256' },
      { name: 'lastUpdated', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getPriceUnsafe',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [
      { name: 'price',       type: 'uint256' },
      { name: 'lastUpdated', type: 'uint256' },
    ],
  },
] as const;

// ─── ERC20 (payment token / USDC) ────────────────────────────────────────────
export const ERC20ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value',   type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;
