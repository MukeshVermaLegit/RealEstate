'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  DEFAULT_GATEWAY,
  GATEWAYS,
  describeCid,
  gatewayUrl,
  parseIpfsUri,
  shortCid,
} from '@/lib/ipfs';
import { CopyButton } from './ui/CopyButton';

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('h-3 w-3 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 3h7v7M13 3 6.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 12.5V13H3V5h.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', open && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="m4 6.5 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CidFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-ink" title={value}>
        {value}
      </p>
    </div>
  );
}

/**
 * Renders an `ipfs://` URI as something a reader can actually act on: the raw
 * URI, a one-click gateway link, and an expandable explanation of what a CID
 * is and why the address looks nothing like a URL.
 *
 * Non-IPFS values (a plain https:// document, an empty string) degrade to a
 * normal link / em dash — callers can pass whatever the registry holds.
 */
export function IpfsUri({
  uri,
  label,
  defaultOpen = false,
  className,
}: {
  uri: string;
  /** Optional caption above the URI, e.g. "Metadata URI". */
  label?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  const parsed = parseIpfsUri(uri);

  if (!uri) {
    return <span className={cn('text-sm text-faint', className)}>—</span>;
  }

  // Not IPFS — an ordinary link, shown plainly rather than dressed up.
  if (!parsed) {
    return (
      <a
        href={uri}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1 break-all font-mono text-xs text-accent hover:text-accent-hover',
          className,
        )}
      >
        {uri}
        <ExternalIcon />
      </a>
    );
  }

  const info = describeCid(parsed.cid);
  const primaryUrl = gatewayUrl(parsed.cid, parsed.path, DEFAULT_GATEWAY);

  return (
    <div className={cn('overflow-hidden rounded-xl border border-hairline bg-elevated/50', className)}>
      {/* ── Header: what it is, plus the two things you want to do with it ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-info/30 bg-info/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M8 1.5 14 5v6l-6 3.5L2 11V5l6-3.5Z" strokeLinejoin="round" />
            <path d="M8 8.2 14 5M8 8.2 2 5m6 3.2v6.3" strokeLinejoin="round" />
          </svg>
          IPFS
        </span>

        <div className="min-w-0 flex-1">
          {label && <p className="text-[11px] text-faint">{label}</p>}
          <p className="truncate font-mono text-xs text-ink" title={uri}>
            {uri}
          </p>
        </div>

        <CopyButton value={uri} label="Copy IPFS URI" />
        <a
          href={primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 hover:border-accent/70"
        >
          Open
          <ExternalIcon />
        </a>
      </div>

      {/* ── Explainer toggle ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 border-t border-hairline px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <span>
          Not a website link —{' '}
          <span className="text-faint">
            content ID {shortCid(parsed.cid)}
            {info && ` · CIDv${info.version} · ${info.codec} · ${info.hash}`}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium">
          {open ? 'Hide' : "What's this?"}
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-hairline px-3 py-3.5">
          <p className="text-xs leading-relaxed text-muted">
            This is an <span className="text-ink">IPFS URI</span>, not a normal web address. Nothing
            in it names a server, so a browser cannot follow it on its own — an{' '}
            <span className="text-ink">IPFS HTTP gateway</span> has to translate it first.
          </p>

          {/* The CID itself */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Content identifier (CID)
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-accent">
                {parsed.cid}
              </code>
              <CopyButton value={parsed.cid} label="Copy CID" className="border-edge bg-elevated" />
            </div>
            {parsed.path && (
              <p className="mt-1.5 text-[11px] text-faint">
                Path inside that content: <span className="font-mono text-muted">/{parsed.path}</span>
              </p>
            )}
          </div>

          {/* What the CID declares about itself */}
          {info && (
            <div>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
                <CidFact label="Version" value={`CIDv${info.version}`} />
                <CidFact label="Content" value={info.codec} />
                <CidFact label="Hash" value={`${info.hash} · ${info.hashBits}-bit`} />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                The CID is self-describing: it declares that the block behind it is {info.codecNote}.
              </p>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted">
            That identifier is a hash of the bytes themselves, so it names{' '}
            <span className="text-ink">what the content is</span>, never where it is stored. Any node
            or gateway holding the block returns exactly these bytes — and if a single character of
            the document changed, the CID would change with it. That is what makes it safe to write
            into a contract: the on-chain pointer can never be swapped out for different content.
          </p>

          {/* Gateways */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Open through a gateway
            </p>
            <ul className="overflow-hidden rounded-lg border border-hairline">
              {GATEWAYS.map((gw, i) => (
                <li key={gw.name} className={i > 0 ? 'border-t border-hairline' : undefined}>
                  <a
                    href={gatewayUrl(parsed.cid, parsed.path, gw)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 bg-surface px-3 py-2 transition-colors hover:bg-elevated"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">{gw.name}</span>
                      <span className="block truncate text-[11px] text-faint">{gw.note}</span>
                    </span>
                    <ExternalIcon className="text-faint transition-colors group-hover:text-accent" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-faint">
              ipfs://&lt;CID&gt; → https://&lt;gateway&gt;/ipfs/&lt;CID&gt;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One-line variant for tables and cards: short CID, gateway link, no explainer.
 */
export function IpfsUriInline({ uri, className }: { uri: string; className?: string }) {
  const parsed = parseIpfsUri(uri);

  if (!uri) return <span className={cn('text-faint', className)}>—</span>;

  if (!parsed) {
    return (
      <span className={cn('block truncate font-mono text-xs text-muted', className)} title={uri}>
        {uri}
      </span>
    );
  }

  return (
    <a
      href={gatewayUrl(parsed.cid, parsed.path, DEFAULT_GATEWAY)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${uri}\n\nIPFS content identifier — opens through the ${DEFAULT_GATEWAY.name} gateway`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-accent',
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-info">ipfs</span>
      <span className="truncate">{shortCid(parsed.cid, 8)}</span>
      <ExternalIcon />
    </a>
  );
}
