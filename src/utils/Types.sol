// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Types {
    /// @notice Status of a property listing on the registry
    enum PropertyStatus {
        None,
        Draft,
        UnderReview,
        Approved,
        OfferingOpen,
        OfferingClosed,
        Trading,
        Paused,
        Delisted
    }

    /// @notice Status of a marketplace listing
    enum ListingStatus {
        None,
        Active,
        Sold,
        Cancelled
    }

    /// @notice Core property data stored on-chain
    struct Property {
        uint256 propertyId;
        address owner;
        string metadataURI; // IPFS URI with off-chain details (location, docs, images)
        uint256 totalSupply; // total fractional tokens minted for this property
        uint256 pricePerToken; // initial price in USD (18 decimals)
        PropertyStatus status;
        uint256 createdAt;
        address tokenAddress; // ERC-20 token contract deployed by PropertyFactory
        address offeringContract; // primary-sale offering contract (set by openOffering)
        // ─── Legal / regulatory fields ─────────────────────────────────────
        address spvAddress; // on-chain address of the Special Purpose Vehicle entity
        bytes32 legalHash; // keccak256 of the off-chain legal document package (LLC docs, deed, etc.)
        uint16 jurisdiction; // ISO 3166-1 numeric country code of the property's legal jurisdiction
    }

    /// @notice A marketplace listing for fractional tokens
    struct Listing {
        uint256 listingId;
        uint256 propertyId;
        address seller;
        uint256 tokenAmount;
        uint256 pricePerToken; // in payment token decimals
        ListingStatus status;
        uint256 createdAt;
        address tokenAddress; // ERC-20 token for this property
        uint48 expiresAt; // 0 = no expiry; otherwise unix timestamp
    }

    /// @notice Compliance record for a KYC-verified investor
    struct InvestorRecord {
        bool verified; // true = passed KYC
        uint16 countryCode; // ISO 3166-1 numeric country code
        uint8 investorType; // 0=unset, 1=retail, 2=accredited, 3=qualified
        uint48 verifiedAt; // block.timestamp of last successful verification
        uint48 expiresAt; // 0 = never expires; otherwise unix timestamp
        bool frozen; // OFAC / sanctions hold
    }

    /// @notice ERC-3643 inspired on-chain identity record
    struct Identity {
        address wallet; // wallet address this identity belongs to
        uint16 countryCode; // ISO 3166-1 numeric country code
        bytes32 identityHash; // off-chain identity commitment (e.g. keccak256 of DID)
    }

    /// @notice Rent distribution record
    struct RentPeriod {
        uint256 propertyId;
        uint256 totalRent; // total rent deposited in payment token
        uint256 totalClaimed; // running total of amounts claimed so far
        bytes32 merkleRoot; // root of the (address, claimableAmount) Merkle tree
        address depositor; // address that originally deposited the rent
        uint256 reclaimDeadline; // timestamp after which admin may reclaim unclaimed funds
        uint256 snapshotBlock; // block at which token balances were snapshotted (always non-zero)
        bool reclaimed; // true once the admin has swept the unclaimed remainder
    }
}
