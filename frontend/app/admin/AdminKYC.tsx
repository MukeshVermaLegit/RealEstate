'use client';

import { useMemo, useState } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useReadContracts,
  useChainId,
} from 'wagmi';
import { isAddress, parseAbiItem } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { KYCRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { countryName } from '@/lib/constants/countries';
import { formatDate, shortAddress } from '@/lib/format';
import { explorerAddressUrl } from '@/lib/explorer';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui';

type VerifyForm = {
  address: string;
  countryCode: string;
  investorType: string;
  expiresAt: string;
};

const BLANK_FORM: VerifyForm = { address: '', countryCode: '', investorType: '1', expiresAt: '' };

type InvestorRow = {
  id: string;
  countryCode: number;
  investorType: number;
  verifiedAt: string;
  expiresAt: string;
  frozen: boolean;
};

const INVESTOR_TYPE_LABEL: Record<number, string> = {
  0: 'Unset',
  1: 'Retail',
  2: 'Accredited',
  3: 'Qualified',
};

const ACCOUNT_VERIFIED_EVENT = parseAbiItem(
  'event AccountVerified(address indexed account, address indexed verifiedBy, uint16 countryCode, uint8 investorType, uint48 expiresAt, uint256 timestamp)',
);

export default function AdminKYC() {
  const { addresses } = useContracts();
  const chainId = useChainId();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [form, setForm] = useState<VerifyForm>(BLANK_FORM);
  const [formErrors, setFormErrors] = useState<Partial<VerifyForm>>({});

  const [actionAddr, setActionAddr] = useState('');
  const [actionAddrError, setActionAddrError] = useState('');

  const publicClient = usePublicClient();

  // Step 1 — collect unique verified addresses from AccountVerified logs.
  const { data: verifiedAddresses, refetch: refetchLogs } = useQuery({
    queryKey: ['kyc-verified-addresses', addresses.kycRegistry],
    queryFn: async () => {
      if (!publicClient) return [] as `0x${string}`[];
      const logs = await publicClient.getLogs({
        address: addresses.kycRegistry,
        event: ACCOUNT_VERIFIED_EVENT,
        fromBlock: 0n,
        toBlock: 'latest',
      });
      const seen = new Map<string, `0x${string}`>();
      logs.forEach((log) => {
        if (log.args.account) seen.set(log.args.account.toLowerCase(), log.args.account);
      });
      return [...seen.values()].slice(-20) as `0x${string}`[];
    },
    staleTime: 30_000,
  });

  // Step 2 — batch getInvestorRecord for each address.
  const { data: recordResults, refetch: refetchRecords } = useReadContracts({
    contracts: (verifiedAddresses ?? []).map((addr) => ({
      address: addresses.kycRegistry,
      abi: KYCRegistryABI,
      functionName: 'getInvestorRecord' as const,
      args: [addr] as const,
    })),
    query: { enabled: (verifiedAddresses ?? []).length > 0 },
  });

  function refetchInvestors() {
    void refetchLogs();
    void refetchRecords();
  }

  type RawRecord = {
    verified: boolean;
    countryCode: number;
    investorType: number;
    verifiedAt: bigint;
    expiresAt: bigint;
    frozen: boolean;
  };

  const investors = useMemo<InvestorRow[]>(
    () =>
      (verifiedAddresses ?? [])
        .map((addr, i) => {
          const rec = recordResults?.[i]?.result as RawRecord | undefined;
          return {
            id: addr,
            countryCode: rec?.countryCode ?? 0,
            investorType: rec?.investorType ?? 0,
            verifiedAt: rec ? rec.verifiedAt.toString() : '0',
            expiresAt: rec ? rec.expiresAt.toString() : '0',
            frozen: rec?.frozen ?? false,
          };
        })
        .filter((inv) => inv.countryCode !== 0),
    [verifiedAddresses, recordResults],
  );

  const busy = isPending || isConfirming;

  // ─── Validation ────────────────────────────────────────────────────────────

  function validateForm(): boolean {
    const errors: Partial<VerifyForm> = {};
    if (!isAddress(form.address)) errors.address = 'Not a valid Ethereum address';
    const cc = parseInt(form.countryCode, 10);
    if (Number.isNaN(cc) || cc < 1 || cc > 999) errors.countryCode = 'ISO numeric, 1–999';
    const it = parseInt(form.investorType, 10);
    if (![1, 2, 3].includes(it)) errors.investorType = 'Must be Retail, Accredited or Qualified';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateActionAddr(): boolean {
    if (!isAddress(actionAddr)) {
      setActionAddrError('Not a valid Ethereum address');
      return false;
    }
    setActionAddrError('');
    return true;
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleVerify() {
    if (!validateForm()) return;
    const expiresAtSecs = form.expiresAt
      ? Math.floor(new Date(form.expiresAt).getTime() / 1000)
      : 0;
    writeContract(
      {
        address: addresses.kycRegistry,
        abi: KYCRegistryABI,
        functionName: 'verify',
        args: [
          form.address as `0x${string}`,
          parseInt(form.countryCode, 10),
          parseInt(form.investorType, 10),
          expiresAtSecs,
        ],
      },
      {
        onSuccess: () => {
          setForm(BLANK_FORM);
          refetchInvestors();
        },
      },
    );
  }

  function writeSimple(fn: 'revoke' | 'freeze' | 'unfreeze') {
    if (!validateActionAddr()) return;
    writeContract(
      {
        address: addresses.kycRegistry,
        abi: KYCRegistryABI,
        functionName: fn,
        args: [actionAddr as `0x${string}`],
      },
      { onSuccess: () => refetchInvestors() },
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Verify */}
      <Card>
        <CardHeader>
          <CardTitle>Verify an investor</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Writes the wallet into the KYC registry. Until this lands, the compliance module rejects
            every transfer to that address.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Wallet address"
              htmlFor="kyc-address"
              error={formErrors.address}
              className="sm:col-span-2"
            >
              <Input
                id="kyc-address"
                placeholder="0x…"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </Field>

            <Field
              label="Country code"
              htmlFor="kyc-country"
              hint="ISO 3166-1 numeric"
              error={formErrors.countryCode}
            >
              <Input
                id="kyc-country"
                type="number"
                min={1}
                max={999}
                placeholder="840"
                value={form.countryCode}
                onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                className="tabular"
              />
            </Field>

            <Field label="Investor type" htmlFor="kyc-type" error={formErrors.investorType}>
              <Select
                id="kyc-type"
                value={form.investorType}
                onChange={(e) => setForm((f) => ({ ...f, investorType: e.target.value }))}
              >
                <option value="1">Retail</option>
                <option value="2">Accredited</option>
                <option value="3">Qualified</option>
              </Select>
            </Field>

            <Field
              label="KYC expiry"
              htmlFor="kyc-expiry"
              hint="Blank = never expires"
              className="sm:col-span-2"
            >
              <Input
                id="kyc-expiry"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </Field>
          </div>

          <Button loading={busy} onClick={handleVerify}>
            Verify investor
          </Button>
        </CardBody>
      </Card>

      {/* Revoke / freeze / unfreeze */}
      <Card>
        <CardHeader>
          <CardTitle>Revoke, freeze or unfreeze</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Freezing blocks transfers and rent claims immediately. Revoking removes the verification
            record entirely.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="Investor address" htmlFor="kyc-action-addr" error={actionAddrError}>
            <Input
              id="kyc-action-addr"
              placeholder="0x…"
              value={actionAddr}
              onChange={(e) => setActionAddr(e.target.value)}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={busy} onClick={() => writeSimple('revoke')}>
              Revoke
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => writeSimple('freeze')}>
              Freeze
            </Button>
            <Button variant="outline" loading={busy} onClick={() => writeSimple('unfreeze')}>
              Unfreeze
            </Button>
          </div>

          <Alert tone="warn">
            These actions take effect on the next block and apply protocol-wide.
          </Alert>
        </CardBody>
      </Card>

      {/* Recent verified investors */}
      <Card>
        <CardHeader>
          <CardTitle>Recently verified investors</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Last 20 wallets from <span className="font-mono">AccountVerified</span> logs, with their
            current registry record.
          </p>
        </CardHeader>

        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Address</Th>
                <Th>Country</Th>
                <Th>Type</Th>
                <Th>Verified</Th>
                <Th>Expires</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {investors.length === 0 && (
                <tr>
                  <Td colSpan={6} align="center" className="py-10 text-muted">
                    No verified investors found in the event logs yet.
                  </Td>
                </tr>
              )}
              {investors.map((inv) => {
                const url = explorerAddressUrl(chainId, inv.id);
                return (
                  <Tr key={inv.id}>
                    <Td>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-accent hover:text-accent-hover"
                        >
                          {shortAddress(inv.id)}
                        </a>
                      ) : (
                        <span className="font-mono text-xs">{shortAddress(inv.id)}</span>
                      )}
                    </Td>
                    <Td>
                      {countryName(inv.countryCode)}{' '}
                      <span className="text-faint">({inv.countryCode})</span>
                    </Td>
                    <Td>{INVESTOR_TYPE_LABEL[inv.investorType] ?? inv.investorType}</Td>
                    <Td className="tabular">
                      {inv.verifiedAt !== '0' ? formatDate(BigInt(inv.verifiedAt)) : '—'}
                    </Td>
                    <Td className="tabular">
                      {inv.expiresAt !== '0' ? formatDate(BigInt(inv.expiresAt)) : 'Never'}
                    </Td>
                    <Td>
                      {inv.frozen ? (
                        <Badge tone="negative" dot>
                          Frozen
                        </Badge>
                      ) : (
                        <Badge tone="positive" dot>
                          Active
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
