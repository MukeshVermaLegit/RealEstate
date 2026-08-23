import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Wordmark: a stacked-slab glyph (fractional shares of one building) plus type.
 */
export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('group flex items-center gap-2.5', className)} aria-label="RWA Estate — home">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-accent-sheen shadow-[0_2px_10px_-2px_rgb(var(--c-accent)/0.6)]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-accent-ink" aria-hidden>
          <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="6"  y="13" width="12" height="4" rx="1"   fill="currentColor" opacity="0.95" />
          <rect x="8"  y="8"  width="8"  height="3.5" rx="1" fill="currentColor" opacity="0.7" />
          <rect x="10" y="3.5" width="4" height="3"  rx="1"  fill="currentColor" opacity="0.45" />
        </svg>
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
        RWA<span className="text-accent">Estate</span>
      </span>
    </Link>
  );
}
