'use client';

import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { PropertyTokenABI } from '@/lib/contracts/abis';
import { Alert, Button, Spinner } from '@/components/ui';

const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * Activates a holder's voting power on one property token.
 *
 * Rent claims are capped on-chain at `getPastVotes * totalRent / getPastTotalSupply`,
 * and ERC20Votes only checkpoints accounts that have delegated. Tokens minted by
 * the original factory did not self-delegate, so their holders have zero votes and
 * every claim would revert — until they send this one transaction.
 *
 * Newer tokens self-delegate on first receipt, so this renders nothing for them.
 */
export function DelegateButton({
  tokenAddress,
  onDelegated,
}: {
  tokenAddress: `0x${string}`;
  onDelegated?: () => void;
}) {
  const { address } = useAccount();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: delegatee, refetch } = useReadContract({
    address: tokenAddress,
    abi: PropertyTokenABI,
    functionName: 'delegates',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: PropertyTokenABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  if (isSuccess) {
    void refetch();
    onDelegated?.();
  }

  // Nothing to activate if they hold none, or it is already active.
  if (!address) return null;
  if (balance !== undefined && (balance as bigint) === 0n) return null;
  if (delegatee === undefined) return null;
  if ((delegatee as string).toLowerCase() !== ZERO) return null;

  const busy = isPending || isConfirming;

  return (
    <Alert tone="warn" title="Activate your rent eligibility">
      <p className="mb-3">
        This token was issued before voting power was activated automatically. Until you do this
        once, the distributor reads your balance as zero and any rent claim will fail. It costs one
        transaction and does not move your tokens.
      </p>
      <Button
        size="sm"
        onClick={() =>
          writeContract({
            address: tokenAddress,
            abi: PropertyTokenABI,
            functionName: 'delegate',
            args: [address],
          })
        }
        disabled={busy}
      >
        {busy ? <Spinner /> : null}
        Activate
      </Button>
    </Alert>
  );
}
