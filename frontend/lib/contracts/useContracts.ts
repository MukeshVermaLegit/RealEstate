import { useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES, type SupportedChainId } from './addresses';

export function useContracts() {
  const { chain } = useAccount();
  const chainId = (chain?.id ?? 31337) as SupportedChainId;
  const addresses = CONTRACT_ADDRESSES[chainId] ?? CONTRACT_ADDRESSES[31337];
  return { addresses, chainId };
}
