const EXPLORERS: Record<number, { name: string; url: string }> = {
  1:        { name: 'Etherscan',         url: 'https://etherscan.io' },
  11155111: { name: 'Sepolia Etherscan', url: 'https://sepolia.etherscan.io' },
  31337:    { name: 'Local node',        url: '' },
};

export function explorerName(chainId: number): string {
  return EXPLORERS[chainId]?.name ?? 'Explorer';
}

/** `null` when the chain has no browsable explorer (e.g. a local node). */
export function explorerAddressUrl(chainId: number, address: string): string | null {
  const base = EXPLORERS[chainId]?.url;
  return base ? `${base}/address/${address}` : null;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const base = EXPLORERS[chainId]?.url;
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerTokenUrl(chainId: number, address: string): string | null {
  const base = EXPLORERS[chainId]?.url;
  return base ? `${base}/token/${address}` : null;
}
