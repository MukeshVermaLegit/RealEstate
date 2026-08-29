import { createPublicClient, defineChain, http, type PublicClient } from 'viem';

/**
 * Chains are defined here rather than imported from `viem/chains`: that entry
 * point pulls in viem's entire chain index, which drags a dynamic `require` from
 * a transitive dependency into the server bundle and makes webpack warn on every
 * build. Only two chains are ever used, so the definitions are cheap to inline.
 */
const sepolia = defineChain({
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.sepolia.org'] } },
  // Required: the holder scan batches getPastVotes through multicall, and viem
  // refuses to batch on a chain that does not declare this address.
  contracts: {
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 751532,
    },
  },
  testnet: true,
});

const hardhat = defineChain({
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

/**
 * Read-only chain access for API routes.
 *
 * Prefers SEPOLIA_RPC_URL (server-only, usually a keyed provider) and falls back
 * to the public NEXT_PUBLIC_SEPOLIA_RPC_URL. Snapshot building issues a chunked
 * log scan plus a multicall per holder, which the default public endpoint will
 * rate-limit.
 */
export function serverClient(chainId: number): PublicClient {
  if (chainId === 31337) {
    return createPublicClient({ chain: hardhat, transport: http() }) as PublicClient;
  }
  if (chainId !== sepolia.id) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }
  const url = process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  return createPublicClient({
    chain: sepolia,
    transport: http(url),
    batch: { multicall: true },
  }) as PublicClient;
}
