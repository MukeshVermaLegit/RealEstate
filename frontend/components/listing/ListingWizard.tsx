'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { PropertyRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import COUNTRY_MAP, { countryName } from '@/lib/constants/countries';
import { cn } from '@/lib/cn';
import { cleanTxError, formatUsdCompact } from '@/lib/format';
import {
  EMPTY_DRAFT,
  MAX_DOC_BYTES,
  MAX_IMAGE_BYTES,
  buildMetadata,
  claimDraftMedia,
  legalHashFor,
  newDraftId,
  pinFile,
  pinJson,
  propertyIdFromReceipt,
  type ListingDraft,
  type PinContext,
} from '@/lib/listing';
import type { IPFSMetadata, Property } from '@/lib/types';
import { ipfsToHttp } from '@/lib/ipfs';
import { IpfsUri } from '@/components/IpfsUri';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  InputWithPrefix,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';

// ─── Steps ───────────────────────────────────────────────────────────────────

const STEPS = [
  { title: 'Property',     blurb: 'What you are tokenising' },
  { title: 'Tokenisation', blurb: 'Supply and price' },
  { title: 'Legal',        blurb: 'SPV, jurisdiction, documents' },
  { title: 'Review',       blurb: 'Check and submit' },
] as const;

type Errors = Partial<Record<keyof ListingDraft | 'image' | 'documents', string>>;

/** Progress phases of the submit itself — each one is a real network round-trip. */
type Phase =
  | 'idle'
  | 'image'
  | 'documents'
  | 'metadata'
  | 'sign'
  | 'confirm'
  | 'legal-sign'
  | 'terms-sign'
  | 'done';

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  image: 'Uploading cover image to IPFS…',
  documents: 'Uploading documents to IPFS…',
  metadata: 'Pinning the metadata document…',
  sign: 'Waiting for your signature…',
  confirm: 'Confirming on-chain…',
  'legal-sign': 'Signing the legal-details update…',
  'terms-sign': 'Signing the offering-terms update…',
  done: '',
};

// ─── Small pieces ────────────────────────────────────────────────────────────

function Stepper({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-4">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => i <= current && onJump(i)}
              disabled={i > current}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                active ? 'bg-elevated' : 'bg-surface',
                i <= current ? 'cursor-pointer hover:bg-elevated' : 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  active && 'border-accent bg-accent text-accent-ink',
                  done && 'border-positive/40 bg-positive/15 text-positive',
                  !active && !done && 'border-hairline text-faint',
                )}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m3.5 8.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0">
                <span className={cn('block truncate text-sm font-medium', active ? 'text-ink' : 'text-muted')}>
                  {step.title}
                </span>
                <span className="hidden truncate text-[11px] text-faint sm:block">{step.blurb}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="break-all text-right text-sm text-ink">{value || '—'}</span>
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export function ListingWizard({
  mode = 'create',
  property,
  existingMeta,
  metaLoading = false,
}: {
  mode?: 'create' | 'edit';
  /** Required in edit mode — the Draft being revised. */
  property?: Property;
  existingMeta?: IPFSMetadata;
  metaLoading?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { addresses } = useContracts();
  const client = usePublicClient();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  /**
   * Groups every file this wizard session pins. Files reach IPFS before
   * `registerProperty` returns an id, so the off-chain index records them under
   * this id and `claimDraftMedia` links them once the id is known.
   */
  const draftId = useRef(newDraftId());

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ListingDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  /** Newly picked photos, in gallery order. The first one becomes the cover. */
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  /** Photos already pinned on a previous save; kept unless the user removes them. */
  const [keptImageUris, setKeptImageUris] = useState<string[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [keptDocUris, setKeptDocUris] = useState<string[]>([]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [newPropertyId, setNewPropertyId] = useState<bigint | null>(null);
  const [newMetadataUri, setNewMetadataUri] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const imageRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef<HTMLInputElement>(null);
  const prefilled = useRef(false);

  const countries = useMemo(
    () =>
      Object.entries(COUNTRY_MAP)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // Prefill once the on-chain record and its metadata have both arrived.
  useEffect(() => {
    if (mode !== 'edit' || prefilled.current || !property || metaLoading) return;
    prefilled.current = true;
    setForm({
      name: existingMeta?.name ?? '',
      description: existingMeta?.description ?? '',
      location: existingMeta?.location ?? '',
      totalSupply: property.totalSupply.toString(),
      pricePerToken: trimZeros(formatUnits(property.pricePerToken, 18)),
      spvAddress: property.spvAddress,
      jurisdiction: String(property.jurisdiction || 840),
    });
    setKeptImageUris(existingMeta?.imageUris ?? []);
    setKeptDocUris(existingMeta?.documents ?? []);
  }, [mode, property, existingMeta, metaLoading]);

  useEffect(() => {
    if (imagePreviews.length === 0) return;
    return () => imagePreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [imagePreviews]);

  const set = (key: keyof ListingDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(index: number): Errors {
    const next: Errors = {};

    if (index === 0) {
      if (!form.name.trim()) next.name = 'Give the property a name investors will recognise.';
      if (form.name.trim().length > 120) next.name = 'Keep the name under 120 characters.';
      if (!form.description.trim()) next.description = 'Describe the asset — this is the listing body.';
      if (!form.location.trim()) next.location = 'Where is the property?';
      const oversized = imageFiles.find((f) => f.size > MAX_IMAGE_BYTES);
      if (oversized) {
        next.image = `${oversized.name} is over ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
      }
    }

    if (index === 1) {
      const supply = Number(form.totalSupply);
      if (!form.totalSupply || supply <= 0) next.totalSupply = 'Total supply must be above zero.';
      else if (!Number.isInteger(supply)) next.totalSupply = 'Supply is a whole number of tokens.';
      else if (supply > 1e12) next.totalSupply = 'That supply is unrealistically large.';

      const price = Number(form.pricePerToken);
      if (!form.pricePerToken || price <= 0) next.pricePerToken = 'Price per token must be above zero.';
      else if (!Number.isFinite(price)) next.pricePerToken = 'Enter a valid amount.';
    }

    if (index === 2) {
      if (!isAddress(form.spvAddress)) {
        next.spvAddress = 'Enter the SPV wallet address that holds legal title (0x…).';
      }
      if (!form.jurisdiction) next.jurisdiction = 'Select the governing jurisdiction.';
      const tooBig = docFiles.find((f) => f.size > MAX_DOC_BYTES);
      if (tooBig) next.documents = `${tooBig.name} is over ${MAX_DOC_BYTES / 1024 / 1024} MB.`;
    }

    return next;
  }

  function goNext() {
    const found = validate(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  /** Everything the review step needs to be honest about — validate all of it. */
  function validateAll(): boolean {
    const all = { ...validate(0), ...validate(1), ...validate(2) };
    setErrors(all);
    if (Object.keys(all).length === 0) return true;
    // Send the user back to the earliest step that still has a problem.
    for (const [index, keys] of [
      [0, ['name', 'description', 'location', 'image']],
      [1, ['totalSupply', 'pricePerToken']],
      [2, ['spvAddress', 'jurisdiction', 'documents']],
    ] as const) {
      if (keys.some((k) => all[k as keyof Errors])) {
        setStep(index);
        break;
      }
    }
    return false;
  }

  // ── Files ─────────────────────────────────────────────────────────────────

  function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setImageFiles((prev) => [...prev, ...picked]);
    setImagePreviews((prev) => [...prev, ...picked.map((f) => URL.createObjectURL(f))]);
    setErrors((prev) => ({ ...prev, image: undefined }));
    // Let the same file be re-picked after a removal.
    if (imageRef.current) imageRef.current.value = '';
  }

  function removeNewImage(index: number) {
    URL.revokeObjectURL(imagePreviews[index]);
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function removeKeptImage(index: number) {
    setKeptImageUris((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDocs(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setDocFiles((prev) => [...prev, ...picked]);
    setErrors((prev) => ({ ...prev, documents: undefined }));
    // Let the same file be re-picked after a removal.
    if (docsRef.current) docsRef.current.value = '';
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateAll()) return;
    if (!client) {
      setErrorMsg('No RPC connection — check your network and try again.');
      return;
    }

    setErrorMsg('');

    // In edit mode the property id already exists, so pins are attributed
    // directly and nothing needs claiming afterwards.
    const pinCtx: PinContext = {
      draftId: draftId.current,
      uploadedBy: address,
      chainId,
      ...(mode === 'edit' && property ? { propertyId: Number(property.propertyId) } : {}),
    };

    try {
      // 1. Photos — kept ones first, so the cover only changes if the user
      //    removed it. Pinned sequentially to keep gallery order deterministic.
      let imageUris = keptImageUris;
      if (imageFiles.length > 0) {
        setPhase('image');
        const pinnedImages: string[] = [];
        for (const [i, file] of imageFiles.entries()) {
          const label = `${form.name} — photo ${keptImageUris.length + i + 1}`;
          pinnedImages.push((await pinFile(file, label, { ...pinCtx, kind: 'image' })).uri);
        }
        imageUris = [...keptImageUris, ...pinnedImages];
      }

      // 2. Documents
      let documentUris = keptDocUris;
      if (docFiles.length > 0) {
        setPhase('documents');
        const pinned = await Promise.all(
          docFiles.map((file) =>
            pinFile(file, `${form.name} — ${file.name}`, { ...pinCtx, kind: 'document' }),
          ),
        );
        documentUris = [...keptDocUris, ...pinned.map((p) => p.uri)];
      }

      // 3. Metadata document
      setPhase('metadata');
      const metadata = buildMetadata({
        name: form.name,
        description: form.description,
        location: form.location,
        imageUris,
        documentUris,
      });
      const { uri: metadataUri } = await pinJson(metadata, `${form.name} — metadata`, {
        ...pinCtx,
        kind: 'metadata',
      });
      setNewMetadataUri(metadataUri);

      // The legal hash commits to the executed paperwork. Re-derive it only when
      // there is something new to hash: an edit that keeps its existing documents
      // keeps their digest rather than overwriting it with the URI placeholder.
      const keepsExistingDocs = mode === 'edit' && !!property && docFiles.length === 0 && keptDocUris.length > 0;
      const legalHash = keepsExistingDocs
        ? property.legalHash
        : await legalHashFor(docFiles[0] ?? null, metadataUri);
      const supply = BigInt(form.totalSupply);
      const price = parseUnits(form.pricePerToken, 18);
      const registry = addresses.propertyRegistry;

      if (mode === 'create') {
        setPhase('sign');
        const hash = await writeContractAsync({
          address: registry,
          abi: PropertyRegistryABI,
          functionName: 'registerProperty',
          args: [metadataUri, supply, price, form.spvAddress as `0x${string}`, legalHash, Number(form.jurisdiction)],
        });

        setPhase('confirm');
        const receipt = await client.waitForTransactionReceipt({ hash });
        const createdId = propertyIdFromReceipt(receipt.logs);
        setNewPropertyId(createdId);

        // Link the pinned files to the id the chain just assigned.
        if (createdId !== null) {
          void claimDraftMedia(draftId.current, Number(createdId));
        }
      } else if (property) {
        const id = property.propertyId;

        setPhase('sign');
        const metaHash = await writeContractAsync({
          address: registry,
          abi: PropertyRegistryABI,
          functionName: 'updateMetadata',
          args: [id, metadataUri],
        });
        setPhase('confirm');
        await client.waitForTransactionReceipt({ hash: metaHash });

        // Legal details and terms live in separate setters, so each changed group
        // is its own transaction — skipped entirely when nothing in it moved.
        const legalChanged =
          property.spvAddress.toLowerCase() !== form.spvAddress.toLowerCase() ||
          property.jurisdiction !== Number(form.jurisdiction) ||
          property.legalHash !== legalHash;
        if (legalChanged) {
          setPhase('legal-sign');
          const legalTx = await writeContractAsync({
            address: registry,
            abi: PropertyRegistryABI,
            functionName: 'updateLegalDetails',
            args: [id, form.spvAddress as `0x${string}`, legalHash, Number(form.jurisdiction)],
          });
          setPhase('confirm');
          await client.waitForTransactionReceipt({ hash: legalTx });
        }

        const termsChanged = property.totalSupply !== supply || property.pricePerToken !== price;
        if (termsChanged) {
          setPhase('terms-sign');
          const termsTx = await writeContractAsync({
            address: registry,
            abi: PropertyRegistryABI,
            functionName: 'updateOfferingTerms',
            args: [id, supply, price],
          });
          setPhase('confirm');
          await client.waitForTransactionReceipt({ hash: termsTx });
        }

        setNewPropertyId(id);
      }

      setPhase('done');
    } catch (err) {
      setPhase('idle');
      setErrorMsg(cleanTxError(err));
    }
  }

  /** Second transaction: hand the draft to the admin review queue. */
  async function handleSubmitForReview() {
    const id = newPropertyId ?? property?.propertyId;
    if (!id || !client) return;
    setErrorMsg('');
    try {
      setPhase('sign');
      const hash = await writeContractAsync({
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        functionName: 'submitForReview',
        args: [id],
      });
      setPhase('confirm');
      await client.waitForTransactionReceipt({ hash });
      setSubmitted(true);
      setPhase('done');
    } catch (err) {
      setPhase('done');
      setErrorMsg(cleanTxError(err));
    }
  }

  // ── Gates ─────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-14 text-center">
          <p className="text-sm font-semibold text-ink">Connect a wallet to list a property</p>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            The wallet you connect becomes the on-chain owner of the listing. It is the only
            account that can edit the draft or submit it for review.
          </p>
          <ConnectButton />
        </CardBody>
      </Card>
    );
  }

  if (mode === 'edit' && property && address && property.owner.toLowerCase() !== address.toLowerCase()) {
    return (
      <Alert tone="negative" title="Not your listing">
        Property #{property.propertyId.toString()} is owned by another wallet, so it cannot be
        edited from this account.
      </Alert>
    );
  }

  const busy = phase !== 'idle' && phase !== 'done';
  const valuation = safeValuation(form);

  // ── Success ───────────────────────────────────────────────────────────────

  if (phase === 'done') {
    const id = newPropertyId ?? property?.propertyId;
    return (
      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-4 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-positive/30 bg-positive/12 text-positive">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m5 13 4 4 10-11" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">
                {submitted
                  ? 'Submitted for review'
                  : mode === 'create'
                    ? 'Draft listing created'
                    : 'Draft updated'}
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                {submitted ? (
                  <>
                    {id ? `Property #${id}` : 'Your listing'} is now with the platform admins. You will not be able
                    to edit it while it is under review — if they send it back, it returns to Draft
                    with their notes attached.
                  </>
                ) : (
                  <>
                    {id ? `Property #${id}` : 'Your listing'} is recorded on-chain as a{' '}
                    <strong className="text-ink">Draft</strong>.
                    Investors cannot see or fund it yet. Submit it for review when you are ready for
                    an admin to check the paperwork.
                  </>
                )}
              </p>
            </div>

            {newMetadataUri && (
              <div className="mx-auto max-w-xl pt-1 text-left">
                <IpfsUri uri={newMetadataUri} label="Metadata written on-chain" />
              </div>
            )}

            {errorMsg && <Alert tone="negative" className="mx-auto max-w-xl text-left">{errorMsg}</Alert>}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {!submitted && (
                <Button onClick={handleSubmitForReview} loading={busy}>
                  Submit for review
                </Button>
              )}
              <ButtonLink href="/my-listings" variant={submitted ? 'primary' : 'secondary'}>
                My listings
              </ButtonLink>
              {id && (
                <ButtonLink href={`/properties/${id}`} variant="ghost">
                  View listing page
                </ButtonLink>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Stepper current={step} onJump={setStep} />

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step].title}</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Step {step + 1} of {STEPS.length} · {STEPS[step].blurb}
          </p>
        </CardHeader>

        <CardBody className="space-y-4">
          {mode === 'edit' && metaLoading && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="xs" /> Loading the current draft…
            </div>
          )}

          {/* ── Step 1: property ─────────────────────────────────────────── */}
          {step === 0 && (
            <>
              <Field label="Property name" htmlFor="l-name" error={errors.name}>
                <Input
                  id="l-name"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="123 Main St, Miami FL"
                />
              </Field>

              <Field
                label="Description"
                htmlFor="l-desc"
                hint="Shown on the listing page"
                error={errors.description}
              >
                <Textarea
                  id="l-desc"
                  rows={5}
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Building type, tenancy, yield history, refurbishment status, the investment thesis…"
                />
              </Field>

              <Field label="Location" htmlFor="l-loc" hint="City, country" error={errors.location}>
                <Input
                  id="l-loc"
                  value={form.location}
                  onChange={set('location')}
                  placeholder="Miami, United States"
                />
              </Field>

              <Field
                label="Photos"
                hint="Optional · first is the cover"
                error={errors.image}
              >
                <div className="space-y-2.5">
                  {(keptImageUris.length > 0 || imagePreviews.length > 0) && (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {/* Already pinned, then newly picked — the same order they
                          will appear in the gallery. */}
                      {keptImageUris.map((uri, i) => (
                        <PhotoTile
                          key={`kept-${uri}`}
                          src={ipfsToHttp(uri)}
                          label={i === 0 ? 'Cover' : `#${i + 1}`}
                          onRemove={() => removeKeptImage(i)}
                        />
                      ))}
                      {imagePreviews.map((preview, i) => (
                        <PhotoTile
                          key={`new-${preview}`}
                          src={preview}
                          label={
                            keptImageUris.length === 0 && i === 0
                              ? 'Cover'
                              : `#${keptImageUris.length + i + 1}`
                          }
                          onRemove={() => removeNewImage(i)}
                        />
                      ))}
                    </ul>
                  )}

                  <button
                    type="button"
                    onClick={() => imageRef.current?.click()}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-hairline bg-elevated px-3 py-2.5 text-left transition-colors hover:border-accent/40"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-faint">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {keptImageUris.length + imagePreviews.length > 0
                          ? 'Add more photos…'
                          : 'Choose photos…'}
                      </span>
                      <span className="block text-[11px] text-faint">
                        Pinned to IPFS when you submit · JPG or PNG
                      </span>
                    </span>
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImages}
                    />
                  </button>
                </div>
              </Field>
            </>
          )}

          {/* ── Step 2: tokenisation ─────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Total supply"
                  htmlFor="l-supply"
                  hint="whole tokens"
                  error={errors.totalSupply}
                >
                  <Input
                    id="l-supply"
                    type="number"
                    min="1"
                    step="1"
                    value={form.totalSupply}
                    onChange={set('totalSupply')}
                    placeholder="1000000"
                    className="tabular"
                  />
                </Field>

                <Field label="Price per token" htmlFor="l-price" error={errors.pricePerToken}>
                  <InputWithPrefix
                    id="l-price"
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

              <div className="rounded-xl border border-hairline bg-elevated/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                  Implied valuation
                </p>
                <p className="tabular mt-1 font-display text-2xl font-semibold text-accent-gradient">
                  {valuation ? formatUsdCompact(valuation) : '—'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Supply × price per token. This is the raise the offering contract will be sized
                  against.
                </p>
              </div>

              <Alert tone="info">
                Supply and price can be revised while the listing is a Draft. Once you submit it for
                review they are frozen — they are the terms investors buy against.
              </Alert>
            </>
          )}

          {/* ── Step 3: legal ────────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <Field
                label="SPV wallet address"
                htmlFor="l-spv"
                hint="Holds legal title"
                error={errors.spvAddress}
              >
                <Input
                  id="l-spv"
                  value={form.spvAddress}
                  onChange={set('spvAddress')}
                  placeholder="0x…"
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </Field>

              <Field
                label="Jurisdiction"
                htmlFor="l-juris"
                hint="ISO 3166-1"
                error={errors.jurisdiction}
              >
                <Select id="l-juris" value={form.jurisdiction} onChange={set('jurisdiction')}>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Legal documents"
                hint="Optional · PDF"
                error={errors.documents}
              >
                <div className="space-y-2">
                  {keptDocUris.map((uri, i) => (
                    <div
                      key={uri}
                      className="flex items-center gap-3 rounded-xl border border-hairline bg-elevated px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{uri}</span>
                      <button
                        type="button"
                        onClick={() => setKeptDocUris((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-xs text-faint transition-colors hover:text-negative"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {docFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 rounded-xl border border-hairline bg-elevated px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
                      <span className="shrink-0 text-[11px] text-faint">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => setDocFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-xs text-faint transition-colors hover:text-negative"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => docsRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-edge bg-surface/40 px-3 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-ink"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                    </svg>
                    Add documents
                    <input
                      ref={docsRef}
                      type="file"
                      accept="application/pdf,image/*"
                      multiple
                      className="hidden"
                      onChange={handleDocs}
                    />
                  </button>
                </div>
              </Field>

              <Alert tone="info" title="How the legal hash is derived">
                The first document you upload is hashed with keccak256 and its digest is written
                on-chain as this property&apos;s <span className="font-mono">legalHash</span>. Anyone can
                re-download that file and reproduce the hash to prove the paperwork has not been
                swapped. Upload nothing and the field falls back to a hash of the metadata URI.
              </Alert>
            </>
          )}

          {/* ── Step 4: review ───────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div className="divide-y divide-hairline">
                <SummaryRow label="Name" value={form.name} />
                <SummaryRow label="Location" value={form.location} />
                <SummaryRow
                  label="Cover image"
                  value={(() => {
                    const total = keptImageUris.length + imageFiles.length;
                    if (total === 0) return 'None';
                    return `${total} photo${total === 1 ? '' : 's'}`;
                  })()}
                />
                <SummaryRow label="Total supply" value={form.totalSupply ? Number(form.totalSupply).toLocaleString('en-US') : ''} />
                <SummaryRow label="Price per token" value={form.pricePerToken ? `$${form.pricePerToken}` : ''} />
                <SummaryRow label="Implied valuation" value={valuation ? formatUsdCompact(valuation) : ''} />
                <SummaryRow
                  label="SPV address"
                  value={<span className="font-mono text-xs">{form.spvAddress}</span>}
                />
                <SummaryRow
                  label="Jurisdiction"
                  value={`${countryName(Number(form.jurisdiction))} (${form.jurisdiction})`}
                />
                <SummaryRow
                  label="Documents"
                  value={`${keptDocUris.length + docFiles.length} file${keptDocUris.length + docFiles.length === 1 ? '' : 's'}`}
                />
                <SummaryRow
                  label="Owner"
                  value={<span className="font-mono text-xs">{address}</span>}
                />
              </div>

              <Alert tone="warn" title="What happens when you submit">
                {mode === 'create' ? (
                  <>
                    Your files are pinned to IPFS, then one transaction writes the listing into the
                    registry as a <strong>Draft</strong>. A draft is inert: it mints no tokens, has no
                    offering contract and cannot take money. It only becomes investable after a
                    platform admin reviews and approves it.
                  </>
                ) : (
                  <>
                    Saving re-pins the metadata and updates the on-chain record. Changed legal
                    details and offering terms are separate transactions, so your wallet may ask you
                    to sign more than once.
                  </>
                )}
              </Alert>
            </>
          )}

          {errorMsg && <Alert tone="negative">{errorMsg}</Alert>}

          {busy && (
            <div className="flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/[0.07] px-4 py-3 text-xs text-accent">
              <Spinner size="xs" />
              {PHASE_LABEL[phase]}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Back
            </Button>
          ) : (
            <Link href="/my-listings" className="text-sm text-muted transition-colors hover:text-ink">
              Cancel
            </Link>
          )}
        </div>

        {step < STEPS.length - 1 ? (
          <Button onClick={goNext}>Continue</Button>
        ) : (
          <Button onClick={handleSubmit} loading={busy}>
            {mode === 'create' ? 'Create draft listing' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** One thumbnail in the photo grid, with a remove affordance. */
function PhotoTile({
  src,
  label,
  onRemove,
}: {
  src: string;
  label: string;
  onRemove: () => void;
}) {
  return (
    <li className="group relative aspect-square overflow-hidden rounded-lg border border-hairline bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="h-full w-full object-cover" />
      <span className="absolute left-1 top-1 rounded bg-base/75 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-base/75 text-muted transition-colors hover:bg-negative/80 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

/** "100.000000000000000000" → "100", so the input shows what the user typed. */
function trimZeros(decimal: string): string {
  return decimal.includes('.') ? decimal.replace(/\.?0+$/, '') : decimal;
}

/** Supply × price as an 18-decimal bigint, or null while the inputs are unusable. */
function safeValuation(form: ListingDraft): bigint | null {
  try {
    const supply = BigInt(form.totalSupply || '0');
    const price = parseUnits(form.pricePerToken || '0', 18);
    if (supply <= 0n || price <= 0n) return null;
    return supply * price;
  } catch {
    return null;
  }
}

/** Pull the new id out of the PropertyRegistered log in the receipt. */
