export const CONTRACT_ADDRESSES = {
  31337: {
    // hardhat local — replace with addresses from `forge script` output
    propertyRegistry: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    propertyFactory:  '0x0000000000000000000000000000000000000000' as `0x${string}`,
    marketplace:      '0x0000000000000000000000000000000000000000' as `0x${string}`,
    rentDistributor:  '0x0000000000000000000000000000000000000000' as `0x${string}`,
    kycRegistry:      '0x0000000000000000000000000000000000000000' as `0x${string}`,
    priceOracle:      '0x0000000000000000000000000000000000000000' as `0x${string}`,
    paymentToken:     '0x0000000000000000000000000000000000000000' as `0x${string}`, // USDC mock
    // No ComplianceModule is deployed by DeployCore; PropertyToken treats the zero
    // address as "no compliance enforcement" and skips the module entirely.
    complianceModule: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
  11155111: {
    // Sepolia — deployed block 10945188
    propertyRegistry: '0x7423cB7FFfb67d7BD5b2A07c6648754C37784d8a' as `0x${string}`,
    propertyFactory:  '0x689aF9F42f1A66F400075bD6Bb2f59999FadD507' as `0x${string}`,
    // Redeployed 2026-08-29 — the previous address held no code. See DEPLOY_BLOCKS.
    marketplace:      '0xB50725990C357CBdE31B627b6eBf3728E0A3a880' as `0x${string}`,
    // Redeployed 2026-08-29 — the previous address was a stray, never-initialised
    // KYCRegistry proxy, so registry/paymentToken read as zero and no rent could
    // be deposited through it.
    rentDistributor:  '0x61F297dd02fa4b89b2d9f75A27A452d735880b52' as `0x${string}`,
    kycRegistry:      '0x6bbE2D854848f619C0D261331B8d022FC0480048' as `0x${string}`,
    // Redeployed 2026-08-29 — the previous address was the PropertyFactory impl.
    priceOracle:      '0x62F4dfb7A5a4ED465aF02E03A640B23189938427' as `0x${string}`,
    paymentToken:     '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`, // Sepolia USDC
    complianceModule: '0x0000000000000000000000000000000000000000' as `0x${string}`, // not deployed
  },
} as const;

/**
 * First block worth scanning for each contract's events. `getLogs` from block 0
 * is rejected or throttled by most public RPCs once a chain is large, so every
 * log query should start here rather than at genesis.
 */
export const DEPLOY_BLOCKS = {
  31337: {
    marketplace:      0n,
    rentDistributor:  0n,
    propertyRegistry: 0n,
    kycRegistry:      0n,
  },
  11155111: {
    marketplace:      11592656n, // redeployed 2026-08-29
    rentDistributor:  11592926n, // redeployed 2026-08-29
    propertyRegistry: 10945188n,
    kycRegistry:      10945188n,
  },
} as const;

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;
