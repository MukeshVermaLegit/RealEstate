'use client';

import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { isAddress, parseUnits } from 'viem';
import {
  isDeployed,
  useAuthorizeFactory,
  useCanDeployTokens,
  useDeployPropertyToken,
  useFactoryAuthorized,
  useIsMinter,
  useMintPropertyTokens,
  useTokenInfo,
  TOKEN_DECIMALS,
} from '@/lib/hooks/useTokenAdmin';
import { cleanTxError, formatTokens, shortAddress } from '@/lib/format';
import { explorerAddressUrl } from '@/lib/explorer';
import { Alert, Badge, Button, Field, Input, Modal, Progress, Spinner } from '@/components/ui';

type TokenCellProps = {
  propertyId: string;
  /** Registry-recorded token address; the zero address means "not deployed yet". */
  tokenAddress: `0x${string}`;
  /** Registry `totalSupply` — a WHOLE-token count, not wei. */
  registrySupply: string;
  onRefetch: () => void;
};

/**
 * Per-row token controls for the admin registry table.
 *
 * Two states: a property with no ERC-20 yet (offer deployment), and one with a
 * token (show supply and offer a direct mint). Minting is deliberately not
 * available to property owners — see MintTokensModal for why.
 */
export function TokenCell({ propertyId, tokenAddress, registrySupply, onRefetch }: TokenCellProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const deployed = isDeployed(tokenAddress);

  const info = useTokenInfo(deployed ? tokenAddress : undefined);
  const { isMinter } = useIsMinter(deployed ? tokenAddress : undefined, address);
  const canDeploy = useCanDeployTokens(address);

  const [modal, setModal] = useState<'deploy' | 'mint' | null>(null);

  if (!deployed) {
    return (
      <>
        <div className="flex flex-col items-start gap-1.5">
          <Badge tone="neutral">No token</Badge>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canDeploy}
            onClick={() => setModal('deploy')}
          >
            Deploy token
          </Button>
          {!canDeploy && (
            <p className="text-[11px] leading-tight text-faint">
              Needs FACTORY_ROLE
            </p>
          )}
        </div>

        {modal === 'deploy' && (
          <DeployTokenModal
            propertyId={propertyId}
            registrySupply={registrySupply}
            onClose={() => setModal(null)}
            onSuccess={() => {
              setModal(null);
              onRefetch();
            }}
          />
        )}
      </>
    );
  }

  const tokenUrl = explorerAddressUrl(chainId, tokenAddress);
  const mintedPct =
    info.maxSupply > 0n
      ? Number((info.totalSupply * 10_000n) / info.maxSupply) / 100
      : 0;

  return (
    <>
      <div className="flex min-w-[11rem] flex-col items-start gap-1.5">
        {info.isPending ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner /> Reading supply…
          </span>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge tone="info">{info.symbol || 'Token'}</Badge>
              {tokenUrl ? (
                <a
                  href={tokenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-accent hover:text-accent-hover"
                >
                  {shortAddress(tokenAddress)}
                </a>
              ) : (
                <span className="font-mono text-[11px] text-muted">
                  {shortAddress(tokenAddress)}
                </span>
              )}
            </div>
            <p className="tabular text-[11px] text-muted">
              {formatTokens(info.totalSupply)} / {formatTokens(info.maxSupply)} minted
            </p>
            <div className="w-full">
              <Progress value={mintedPct} />
            </div>
          </>
        )}

        <Button
          size="sm"
          variant="secondary"
          disabled={!isMinter || info.remaining === 0n}
          onClick={() => setModal('mint')}
        >
          Mint
        </Button>
        {!isMinter ? (
          <p className="text-[11px] leading-tight text-faint">Needs MINTER_ROLE</p>
        ) : info.remaining === 0n ? (
          <p className="text-[11px] leading-tight text-faint">Max supply reached</p>
        ) : null}
      </div>

      {modal === 'mint' && (
        <MintTokensModal
          propertyId={propertyId}
          tokenAddress={tokenAddress}
          symbol={info.symbol}
          remaining={info.remaining}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            info.refetch();
            onRefetch();
          }}
        />
      )}
    </>
  );
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

function defaultSymbol(propertyId: string) {
  return `PROP${propertyId}`;
}

function DeployTokenModal({
  propertyId,
  registrySupply,
  onClose,
  onSuccess,
}: {
  propertyId: string;
  registrySupply: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { deploy, isPending, isSuccess } = useDeployPropertyToken();
  const { authorized, isLoading: authLoading, refetch: refetchAuth } = useFactoryAuthorized();
  const { authorize, isPending: authorizing } = useAuthorizeFactory();

  const [name, setName] = useState(`Property #${propertyId}`);
  const [symbol, setSymbol] = useState(defaultSymbol(propertyId));
  const [error, setError] = useState('');
  const [txError, setTxError] = useState('');

  // The registry stores supply as a whole-token count; the ERC-20 ceiling is wei.
  const maxSupplyWei = useMemo(() => {
    try {
      return BigInt(registrySupply) * 10n ** BigInt(TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  }, [registrySupply]);

  const handleDeploy = async () => {
    setError('');
    setTxError('');
    if (name.trim().length < 3) return setError('Token name must be at least 3 characters.');
    if (!/^[A-Z0-9]{2,11}$/.test(symbol.trim()))
      return setError('Symbol must be 2–11 uppercase letters or digits.');
    if (maxSupplyWei === 0n)
      return setError('This property has no supply recorded on the registry.');
    if (!authorized)
      return setError('Authorise the factory on the registry first.');

    try {
      await deploy({
        propertyId: BigInt(propertyId),
        name: name.trim(),
        symbol: symbol.trim(),
        maxSupplyWei,
      });
      onSuccess();
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  const handleAuthorize = async () => {
    setTxError('');
    try {
      await authorize();
      refetchAuth();
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  return (
    <Modal
      title={`Deploy token for property #${propertyId}`}
      description="Creates the per-property ERC-20 and records it on the registry in one transaction."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            loading={isPending}
            disabled={!authorized || authLoading}
            onClick={() => void handleDeploy()}
          >
            {isSuccess ? 'Deployed' : 'Deploy token'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!authLoading && !authorized && (
          <Alert tone="warn" title="Factory not authorised on the registry">
            <p>
              The factory records the new token by calling the registry, which requires
              PROPERTY_ADMIN_ROLE. Grant it once and every future deployment works.
            </p>
            <Button
              size="sm"
              className="mt-2"
              loading={authorizing}
              onClick={() => void handleAuthorize()}
            >
              Authorise factory
            </Button>
          </Alert>
        )}

        <Field label="Token name" htmlFor="token-name">
          <Input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="123 Main Street"
          />
        </Field>

        <Field
          label="Symbol"
          htmlFor="token-symbol"
          hint="2–11 chars, uppercase"
        >
          <Input
            id="token-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="font-mono"
            spellCheck={false}
          />
        </Field>

        <div className="rounded-xl border border-hairline bg-elevated/40 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Max supply
          </p>
          <p className="tabular mt-0.5 text-sm text-ink">
            {formatTokens(maxSupplyWei)} tokens
          </p>
          <p className="mt-1 text-[11px] leading-tight text-muted">
            Taken from the registry entry and fixed at deployment — it cannot be raised later.
          </p>
        </div>

        {error && <Alert tone="negative">{error}</Alert>}
        {txError && <Alert tone="negative">{txError}</Alert>}

        <Alert tone="warn" title="Your wallet becomes the token admin">
          Whoever sends this transaction receives DEFAULT_ADMIN_ROLE, MINTER_ROLE and PAUSER_ROLE on
          the new token. The offering contract must be granted MINTER_ROLE separately before
          investors can claim.
        </Alert>
      </div>
    </Modal>
  );
}

// ─── Mint ─────────────────────────────────────────────────────────────────────

function MintTokensModal({
  propertyId,
  tokenAddress,
  symbol,
  remaining,
  onClose,
  onSuccess,
}: {
  propertyId: string;
  tokenAddress: `0x${string}`;
  symbol: string;
  remaining: bigint;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { mint, isPending, isSuccess } = useMintPropertyTokens(tokenAddress);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [txError, setTxError] = useState('');

  const amountWei = useMemo(() => {
    try {
      return parseUnits(amount || '0', TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  const handleMint = async () => {
    setError('');
    setTxError('');
    if (!isAddress(recipient)) return setError('Enter a valid recipient address.');
    if (amountWei <= 0n) return setError('Enter an amount greater than zero.');
    if (amountWei > remaining)
      return setError(`Only ${formatTokens(remaining)} tokens remain below max supply.`);

    try {
      await mint(recipient as `0x${string}`, amountWei);
      onSuccess();
    } catch (e) {
      setTxError(cleanTxError(e));
    }
  };

  return (
    <Modal
      title={`Mint ${symbol || 'tokens'} · property #${propertyId}`}
      description="Issues new tokens directly to an address, outside the primary offering."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button loading={isPending} onClick={() => void handleMint()}>
            {isSuccess ? 'Minted' : 'Mint tokens'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Recipient" htmlFor="mint-to">
          <Input
            id="mint-to"
            placeholder="0x…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="font-mono text-xs"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Amount"
          htmlFor="mint-amount"
          hint={`${formatTokens(remaining)} available`}
        >
          <Input
            id="mint-amount"
            type="number"
            min="0"
            step="any"
            placeholder="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular"
          />
        </Field>

        {error && <Alert tone="negative">{error}</Alert>}
        {txError && <Alert tone="negative">{txError}</Alert>}

        <Alert tone="warn" title="This dilutes the offering">
          Direct mints and investor claims draw on the same fixed max supply, so every token minted
          here is one the primary offering can no longer sell. Use it for sponsor allocations and
          corrections, not for ordinary distribution.
        </Alert>

        <p className="text-[11px] leading-tight text-muted">
          Issuance skips the KYC check that applies to transfers — the recipient can hold the tokens
          but will not be able to move them until they are verified.
        </p>
      </div>
    </Modal>
  );
}
