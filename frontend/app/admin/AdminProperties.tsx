'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { PropertyRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { PROPERTY_STATUS_LABEL, PropertyStatus } from '@/lib/types';
import { propertyTone } from '@/lib/status';
import { formatNumber, formatUsd, isZeroAddress, shortAddress } from '@/lib/format';
import { explorerAddressUrl } from '@/lib/explorer';
import { RegisterPropertyModal } from '@/components/RegisterPropertyModal';
import { IpfsUriInline } from '@/components/IpfsUri';
import { TokenCell } from './TokenPanel';
import { CreateOfferingModal } from './CreateOfferingModal';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui';

export type PropertyRow = {
  id: string;
  owner: string;
  metadataURI: string;
  status: number;
  totalSupply: string;
  pricePerToken: string;
  tokenAddress: `0x${string}`;
};

type Props = {
  properties: PropertyRow[];
  onRefetch: () => void;
};

/**
 * status → the single next lifecycle transition available from it.
 *
 * `ownerOnly` marks a transition the registry restricts to the property owner:
 * since listings are self-serve, most Drafts belong to someone else and the
 * admin cannot submit them — the owner has to.
 */
const LIFECYCLE_ACTIONS: Record<
  number,
  { label: string; fn: string; needsOffering?: boolean; ownerOnly?: boolean } | undefined
> = {
  [PropertyStatus.Draft]: { label: 'Submit for review', fn: 'submitForReview', ownerOnly: true },
  [PropertyStatus.UnderReview]: { label: 'Approve', fn: 'approveProperty' },
  [PropertyStatus.Approved]: { label: 'Open offering', fn: 'openOffering', needsOffering: true },
  [PropertyStatus.OfferingClosed]: { label: 'Open trading', fn: 'openTrading' },
};

export default function AdminProperties({ properties, onRefetch }: Props) {
  const { addresses } = useContracts();
  const chainId = useChainId();
  const { address } = useAccount();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [offeringFor, setOfferingFor] = useState<PropertyRow | null>(null);
  const [rejectInputs, setRejectInputs] = useState<Record<string, string>>({});
  const [rejectErrors, setRejectErrors] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  function handleAction(prop: PropertyRow) {
    const action = LIFECYCLE_ACTIONS[prop.status];
    if (!action) return;

    const propId = BigInt(prop.id);

    writeContract(
      {
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        functionName: action.fn as any,
        args: [propId],
      },
      { onSuccess: onRefetch },
    );
  }

  /** Send a submitted listing back to its owner with feedback. UnderReview → Draft. */
  function handleReject(prop: PropertyRow) {
    const reason = (rejectInputs[prop.id] ?? '').trim();
    if (reason.length < 4) {
      setRejectErrors((prev) => ({ ...prev, [prop.id]: 'Tell the owner what to fix.' }));
      return;
    }
    setRejectErrors((prev) => ({ ...prev, [prop.id]: '' }));
    writeContract(
      {
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        functionName: 'rejectSubmission',
        args: [BigInt(prop.id), reason],
      },
      {
        onSuccess: () => {
          setRejectOpen(null);
          setRejectInputs((prev) => ({ ...prev, [prop.id]: '' }));
          onRefetch();
        },
      },
    );
  }

  const pendingReview = properties.filter((p) => p.status === PropertyStatus.UnderReview).length;
  const busy = isPending || isConfirming;

  return (
    <>
      <Card>
        <CardHeader
          action={
            <Button onClick={() => setShowRegister(true)}>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Register property
            </Button>
          }
        >
          <CardTitle>Registry</CardTitle>
          <p className="mt-1 text-xs text-muted">
            {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} · each row shows the
            single next lifecycle transition
            {pendingReview > 0 && (
              <>
                {' · '}
                <span className="font-medium text-warn">
                  {pendingReview} awaiting review
                </span>
              </>
            )}
          </p>
        </CardHeader>

        <TableWrap>
          <Table className="min-w-[72rem]">
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th align="right">Supply</Th>
                <Th align="right">Price / token</Th>
                <Th>Token</Th>
                <Th>Metadata</Th>
                <Th>Next action</Th>
              </tr>
            </thead>
            <tbody>
              {properties.length === 0 && (
                <tr>
                  <Td colSpan={8} align="center" className="py-10 text-muted">
                    No properties registered yet.
                  </Td>
                </tr>
              )}

              {properties.map((prop) => {
                const action = LIFECYCLE_ACTIONS[prop.status];
                const ownerUrl = explorerAddressUrl(chainId, prop.owner);
                const ownedByAdmin =
                  !!address && prop.owner.toLowerCase() === address.toLowerCase();
                return (
                  <Tr key={prop.id}>
                    <Td className="font-mono text-ink">#{prop.id}</Td>
                    <Td>
                      {ownerUrl ? (
                        <a
                          href={ownerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-accent hover:text-accent-hover"
                        >
                          {shortAddress(prop.owner)}
                        </a>
                      ) : (
                        <span className="font-mono text-xs">{shortAddress(prop.owner)}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={propertyTone(prop.status)}>
                        {PROPERTY_STATUS_LABEL[prop.status] ?? `Status ${prop.status}`}
                      </Badge>
                    </Td>
                    <Td align="right" className="tabular">
                      {formatNumber(BigInt(prop.totalSupply))}
                    </Td>
                    <Td align="right" className="tabular">
                      {formatUsd(BigInt(prop.pricePerToken))}
                    </Td>
                    <Td>
                      <TokenCell
                        propertyId={prop.id}
                        tokenAddress={prop.tokenAddress}
                        registrySupply={prop.totalSupply}
                        onRefetch={onRefetch}
                      />
                    </Td>
                    <Td className="max-w-[14rem]">
                      <IpfsUriInline uri={prop.metadataURI} />
                    </Td>
                    <Td className="min-w-[16rem]">
                      {action && action.ownerOnly && !ownedByAdmin ? (
                        <span className="text-xs text-faint">
                          Waiting on the owner to submit
                        </span>
                      ) : action ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            {action.needsOffering ? (
                              <Button
                                size="sm"
                                disabled={isZeroAddress(prop.tokenAddress)}
                                onClick={() => setOfferingFor(prop)}
                              >
                                {action.label}
                              </Button>
                            ) : (
                              <Button size="sm" loading={busy} onClick={() => handleAction(prop)}>
                                {action.label}
                              </Button>
                            )}
                            {prop.status === PropertyStatus.UnderReview && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  setRejectOpen((cur) => (cur === prop.id ? null : prop.id))
                                }
                              >
                                Send back
                              </Button>
                            )}
                          </div>

                          {action.needsOffering && isZeroAddress(prop.tokenAddress) && (
                            <p className="text-[11px] leading-tight text-faint">
                              Deploy the token first — the offering mints from it.
                            </p>
                          )}

                          {rejectOpen === prop.id && (
                            <div className="space-y-1.5 rounded-xl border border-warn/25 bg-warn/[0.06] p-2">
                              <Input
                                placeholder="What needs fixing?"
                                value={rejectInputs[prop.id] ?? ''}
                                onChange={(e) =>
                                  setRejectInputs((prev) => ({ ...prev, [prop.id]: e.target.value }))
                                }
                                className="h-8 text-xs"
                              />
                              <p className="text-[11px] leading-tight text-faint">
                                Returns the listing to Draft. The reason is emitted on-chain and
                                shown to the owner.
                              </p>
                              {rejectErrors[prop.id] && (
                                <p className="text-[11px] text-negative">{rejectErrors[prop.id]}</p>
                              )}
                              <Button
                                size="sm"
                                variant="danger"
                                loading={busy}
                                onClick={() => handleReject(prop)}
                              >
                                Send back to owner
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-faint">No transition available</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {offeringFor && (
        <CreateOfferingModal
          propertyId={offeringFor.id}
          tokenAddress={offeringFor.tokenAddress}
          registryPrice={offeringFor.pricePerToken}
          onClose={() => setOfferingFor(null)}
          onSuccess={() => {
            setOfferingFor(null);
            onRefetch();
          }}
        />
      )}

      {showRegister && (
        <RegisterPropertyModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            setShowRegister(false);
            onRefetch();
          }}
        />
      )}
    </>
  );
}
