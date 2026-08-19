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
  },
  11155111: {
    // Sepolia — deployed block 10945188
    propertyRegistry: '0x7423cB7FFfb67d7BD5b2A07c6648754C37784d8a' as `0x${string}`,
    propertyFactory:  '0x353D73717be97DCD93495C6471f5156D72C05c4B' as `0x${string}`,
    marketplace:      '0x595D7432b13136ccBc1619C96C5E31db99C241bE' as `0x${string}`,
    rentDistributor:  '0x6f56Df216930ACaE5dE8009aA3ECe1547E462DC4' as `0x${string}`,
    kycRegistry:      '0x6bbE2D854848f619C0D261331B8d022FC0480048' as `0x${string}`,
    priceOracle:      '0x7cA79d48964bc8d80abbB57E0536E8bfb1A4467d' as `0x${string}`,
    paymentToken:     '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`, // Sepolia USDC
  },
} as const;

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;
