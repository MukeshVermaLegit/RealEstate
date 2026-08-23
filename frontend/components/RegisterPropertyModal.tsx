'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, isAddress, keccak256, toBytes } from 'viem';
import { PropertyRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import COUNTRY_MAP from '@/lib/constants/countries';
import { cleanTxError } from '@/lib/format';
import {
  buildMetadata,
  claimDraftMedia,
  newDraftId,
  pinFile,
  pinJson,
  propertyIdFromReceipt,
  type PinContext,
} from '@/lib/listing';
import { IpfsUri } from './IpfsUri';
import {
  Alert,
  Button,
  Field,
  Input,
  InputWithPrefix,
  Modal,
  Select,
  Spinner,
  Textarea,
} from './ui';

type UploadStep = 'idle' | 'image' | 'metadata' | 'tx' | 'sent' | 'error';

type FormState = {
  name: string;
  description: string;
  location: string;
  totalSupply: string;
  pricePerToken: string;
  spvAddress: string;
  jurisdiction: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  location: '',
  totalSupply: '',
  pricePerToken: '',
  spvAddress: '',
  jurisdiction: '840',
};

const STEP_LABEL: Record<UploadStep, string> = {
  idle: '',
  image: 'Uploading cover image to IPFS…',
  metadata: 'Pinning metadata to IPFS…',
  tx: 'Waiting for wallet signature…',
  sent: 'Confirming on-chain…',
  error: '',
};

export function RegisterPropertyModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { addresses } = useContracts();
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  /** Groups this modal's pins until the chain assigns a property id. */
  const draftId = useRef(newDraftId());

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [step, setStep] = useState<UploadStep>('idle');
  /** Set once the metadata is pinned, so the operator can verify the exact URI going on-chain. */
  const [metadataUri, setMetadataUri] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const countries = useMemo(
    () =>
      Object.entries(COUNTRY_MAP)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // Release the object URL when the preview changes or the modal unmounts.
  useEffect(() => {
    if (!imagePreview) return;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  // Report success from an effect, not the render body.
  useEffect(() => {
    if (!isSuccess) return;
    // Attach the pinned image and metadata to the id the registry just assigned.
    const createdId = receipt ? propertyIdFromReceipt(receipt.logs) : null;
    if (createdId !== null) {
      void claimDraftMedia(draftId.current, Number(createdId));
    }
    onSuccess();
  }, [isSuccess, receipt, onSuccess]);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : '');
  }

  function validate(): string | null {
    if (!form.name.trim()) return 'Property name is required.';
    if (!form.totalSupply || Number(form.totalSupply) <= 0) return 'Total supply must be above zero.';
    if (!Number.isInteger(Number(form.totalSupply))) return 'Total supply must be a whole number of tokens.';
    if (!form.pricePerToken || Number(form.pricePerToken) <= 0)
      return 'Price per token must be above zero.';
    if (!isAddress(form.spvAddress)) return 'SPV address must be a valid Ethereum address.';
    if (!form.jurisdiction) return 'Jurisdiction is required.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setMetadataUri('');

    const invalid = validate();
    if (invalid) {
      setErrorMsg(invalid);
      return;
    }

    try {
      const pinCtx: PinContext = {
        draftId: draftId.current,
        uploadedBy: address,
        chainId,
      };

      let imageUri = '';
      if (imageFile) {
        setStep('image');
        imageUri = (await pinFile(imageFile, `${form.name} — image`, {
          ...pinCtx,
          kind: 'image',
        })).uri;
      }

      setStep('metadata');
      const metadata = buildMetadata({
        name: form.name,
        description: form.description,
        location: form.location,
        // The admin path stays a one-photo quick register; the self-serve wizard
        // is where a full gallery is built.
        imageUris: imageUri ? [imageUri] : [],
        documentUris: [],
      });
      const { uri: pinnedUri } = await pinJson(metadata, `${form.name} — metadata`, {
        ...pinCtx,
        kind: 'metadata',
      });
      setMetadataUri(pinnedUri);

      // Deterministic placeholder — swap for a hash of the executed PDF pack.
      const legalHash = keccak256(toBytes(pinnedUri)) as `0x${string}`;

      setStep('tx');
      writeContract(
        {
          address: addresses.propertyRegistry,
          abi: PropertyRegistryABI,
          functionName: 'registerProperty',
          args: [
            pinnedUri,
            BigInt(form.totalSupply),
            parseUnits(form.pricePerToken, 18),
            form.spvAddress as `0x${string}`,
            legalHash,
            Number(form.jurisdiction),
          ],
        },
        {
          onSuccess: () => setStep('sent'),
          onError: (err) => {
            setStep('error');
            setErrorMsg(cleanTxError(err));
          },
        },
      );
    } catch (err: unknown) {
      setStep('error');
      setErrorMsg(cleanTxError(err));
    }
  }

  const busy = step !== 'idle' && step !== 'error';

  return (
    <Modal
      title="Register a property"
      description="Pins metadata to IPFS, then writes the asset into the on-chain registry."
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Property name" htmlFor="reg-name">
          <Input
            id="reg-name"
            value={form.name}
            onChange={set('name')}
            placeholder="123 Main St, Miami FL"
          />
        </Field>

        <Field label="Description" htmlFor="reg-desc">
          <Textarea
            id="reg-desc"
            rows={3}
            value={form.description}
            onChange={set('description')}
            placeholder="Property overview, features, investment thesis…"
          />
        </Field>

        <Field label="Location" htmlFor="reg-location" hint="Shown on cards and search">
          <Input
            id="reg-location"
            value={form.location}
            onChange={set('location')}
            placeholder="Miami, United States"
          />
        </Field>

        {/* Cover image */}
        <Field label="Cover image" hint="Optional">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-elevated px-3 py-2.5 text-left transition-colors hover:border-accent/40"
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Cover preview" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-faint">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10" r="1.5" />
                  <path d="m4 17 5-4.5 3.5 3L16 12l4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-muted">
              {imageFile ? imageFile.name : 'Choose an image…'}
            </span>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </button>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total supply" htmlFor="reg-supply" hint="whole tokens">
            <Input
              id="reg-supply"
              type="number"
              min="1"
              step="1"
              value={form.totalSupply}
              onChange={set('totalSupply')}
              placeholder="1000000"
              className="tabular"
            />
          </Field>

          <Field label="Price per token" htmlFor="reg-price">
            <InputWithPrefix
              id="reg-price"
              prefix="$"
              type="number"
              min="0.000001"
              step="any"
              value={form.pricePerToken}
              onChange={set('pricePerToken')}
              placeholder="1.00"
              className="tabular"
            />
          </Field>
        </div>

        <Field label="SPV wallet address" htmlFor="reg-spv" hint="Holds legal title">
          <Input
            id="reg-spv"
            value={form.spvAddress}
            onChange={set('spvAddress')}
            placeholder="0x…"
            className="font-mono text-xs"
            spellCheck={false}
          />
        </Field>

        <Field label="Jurisdiction" htmlFor="reg-juris" hint="ISO 3166-1 numeric">
          <Select id="reg-juris" value={form.jurisdiction} onChange={set('jurisdiction')}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </Select>
        </Field>

        {errorMsg && <Alert tone="negative">{errorMsg}</Alert>}

        {busy && (
          <div className="flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/[0.07] px-4 py-3 text-xs text-accent">
            <Spinner size="xs" />
            {STEP_LABEL[step]}
          </div>
        )}

        {metadataUri && (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-muted">
              Metadata pinned. The registry stores this identifier, not the file itself — open it to
              check exactly what buyers will read.
            </p>
            <IpfsUri uri={metadataUri} label="Pinned metadata" />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Register property
          </Button>
        </div>
      </form>
    </Modal>
  );
}
