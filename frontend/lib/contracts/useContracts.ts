import { useChainId } from 'wagmi';
import { CONTRACT_ADDRESSES, type SupportedChainId } from './addresses';

/** The chain public/unconnected visitors read from — must match wagmi's first chain. */
const DEFAULT_CHAIN_ID: SupportedChainId = 11155111; // Sepolia

/**
 * Contract addresses for the active chain.
 *
 * Uses `useChainId` rather than `useAccount().chain` so that a visitor with no
 * wallet still gets addresses for the chain wagmi is actually reading from
 * (the first entry in the config). Reading `account.chain` returned undefined
 * when disconnected and fell back to the local node's zero addresses, which
 * made every public page look empty.
 */
export function useContracts() {
  const chainId = useChainId() as SupportedChainId;
  const addresses = CONTRACT_ADDRESSES[chainId] ?? CONTRACT_ADDRESSES[DEFAULT_CHAIN_ID];
  return { addresses, chainId };
}
