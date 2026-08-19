'use client';

import { useState, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, isAddress, keccak256, toBytes } from 'viem';
import { PropertyRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStep = 'idle' | 'image' | 'metadata' | 'tx' | 'done' | 'error';

type FormState = {
  name:         string;
  description:  string;
  location:     string;
  totalSupply:  string;
  pricePerToken:string; // USD, 18-decimal on-chain
  spvAddress:   string;
  jurisdiction: string; // ISO 3166-1 numeric as string
};

const EMPTY_FORM: FormState = {
  name:         '',
  description:  '',
  location:     '',
  totalSupply:  '',
  pricePerToken:'',
  spvAddress:   '',
  jurisdiction: '840', // US default
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pinFile(file: File, name: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('name', name);
  const res = await fetch('/api/pin', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Image upload failed');
  return data.ipfsUri as string;
}

async function pinJson(json: object, name: string): Promise<string> {
  const res = await fetch('/api/pin', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ json, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Metadata upload failed');
  return data.ipfsUri as string;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  onClose:   () => void;
  onSuccess: () => void;
};

export function RegisterPropertyModal({ onClose, onSuccess }: Props) {
  const { addresses }   = useContracts();
  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [imageFile,  setImageFile]  = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [step,       setStep]       = useState<UploadStep>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── field change ────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview('');
    }
  }

  // ── submit ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    // Validate
    if (!form.name.trim())                       return setErrorMsg('Property name is required');
    if (!form.totalSupply || Number(form.totalSupply) <= 0) return setErrorMsg('Total supply must be > 0');
    if (!form.pricePerToken || Number(form.pricePerToken) <= 0) return setErrorMsg('Price per token must be > 0');
    if (!isAddress(form.spvAddress))             return setErrorMsg('SPV address must be a valid Ethereum address');
    if (!form.jurisdiction)                      return setErrorMsg('Jurisdiction is required');

    try {
      // 1) Upload image (optional — skip if none selected)
      let imageUri = '';
      if (imageFile) {
        setStep('image');
        imageUri = await pinFile(imageFile, `${form.name} — image`);
      }

      // 2) Upload metadata JSON
      setStep('metadata');
      const metadata = {
        name:        form.name.trim(),
        description: form.description.trim(),
        location:    form.location.trim(),
        imageUrl:    imageUri,
        documents:   [] as string[],
      };
      const metadataUri = await pinJson(metadata, `${form.name} — metadata`);

      // 3) Derive legalHash from metadata IPFS URI (deterministic — can be replaced with a real PDF hash)
      const legalHash = keccak256(toBytes(metadataUri)) as `0x${string}`;

      // 4) Send registerProperty tx
      setStep('tx');
      writeContract(
        {
          address:      addresses.propertyRegistry,
          abi:          PropertyRegistryABI,
          functionName: 'registerProperty',
          args: [
            metadataUri,
            BigInt(form.totalSupply),
            parseUnits(form.pricePerToken, 18),
            form.spvAddress as `0x${string}`,
            legalHash,
            Number(form.jurisdiction) as unknown as number,
          ],
        },
        {
          onSuccess: () => setStep('done'),
          onError: (err) => {
            setStep('error');
            setErrorMsg(err.message.split('\n')[0]);
          },
        },
      );
    } catch (err: unknown) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  // close after confirmation
  if (isSuccess && step === 'done') {
    onSuccess();
    return null;
  }

  const busy = step !== 'idle' && step !== 'error';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Register New Property</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <Field label="Property Name *">
            <input
              name="name" value={form.name} onChange={handleChange}
              placeholder="e.g. 123 Main St, Miami FL"
              className={inputCls}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              name="description" value={form.description} onChange={handleChange}
              rows={3} placeholder="Property overview, features, investment thesis…"
              className={inputCls}
            />
          </Field>

          {/* Location */}
          <Field label="Location">
            <input
              name="location" value={form.location} onChange={handleChange}
              placeholder="City, Country"
              className={inputCls}
            />
          </Field>

          {/* Image */}
          <Field label="Cover Image (optional)">
            <div
              className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview
                ? <img src={imagePreview} alt="preview" className="h-12 w-12 rounded object-cover" />
                : <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">IMG</div>
              }
              <span className="text-sm text-gray-500">{imageFile ? imageFile.name : 'Click to select image'}</span>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
          </Field>

          {/* Supply + Price row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total Supply (tokens) *">
              <input
                name="totalSupply" value={form.totalSupply} onChange={handleChange}
                type="number" min="1" step="1" placeholder="1000000"
                className={inputCls}
              />
            </Field>
            <Field label="Price per Token (USD) *">
              <input
                name="pricePerToken" value={form.pricePerToken} onChange={handleChange}
                type="number" min="0.000001" step="any" placeholder="1.00"
                className={inputCls}
              />
            </Field>
          </div>

          {/* SPV Address */}
          <Field label="SPV Wallet Address *">
            <input
              name="spvAddress" value={form.spvAddress} onChange={handleChange}
              placeholder="0x..."
              className={inputCls}
            />
          </Field>

          {/* Jurisdiction */}
          <Field label="Jurisdiction (ISO 3166-1 numeric) *">
            <input
              name="jurisdiction" value={form.jurisdiction} onChange={handleChange}
              type="number" min="1" max="999" placeholder="840 = United States"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-400">Common: 840=US, 826=UK, 276=DE, 356=IN, 702=SG</p>
          </Field>

          {/* Error */}
          {errorMsg && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          {/* Progress */}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <span className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              {step === 'image'    && 'Uploading image to IPFS…'}
              {step === 'metadata' && 'Pinning metadata to IPFS…'}
              {step === 'tx'       && 'Waiting for wallet…'}
              {(step === 'done' && isConfirming) && 'Confirming on-chain…'}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={busy}
              className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Processing…' : 'Register Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
