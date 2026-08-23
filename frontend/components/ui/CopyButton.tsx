'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Copy-to-clipboard affordance for values that are too long to retype by hand
 * (CIDs, addresses, tx hashes). Falls back silently when the Clipboard API is
 * unavailable — e.g. an insecure origin — rather than throwing at the user.
 */
export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  /** Accessible name; the button itself is icon-only. */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-hairline',
        'bg-surface transition-colors hover:border-edge hover:text-ink',
        copied ? 'text-positive' : 'text-faint',
        className,
      )}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="m3.5 8.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 3.5A1.5 1.5 0 0 0 9 2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 10" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
