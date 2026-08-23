import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

/**
 * Single metric tile. Used on the landing hero strip and the portfolio summary.
 * `loading` renders a shimmer at the value's exact height so nothing reflows.
 */
export function Stat({
  label,
  value,
  sub,
  loading = false,
  accent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  loading?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p
          className={cn(
            'tabular mt-1.5 truncate font-display text-2xl font-semibold leading-8',
            accent ? 'text-accent-gradient' : 'text-ink',
          )}
        >
          {value}
        </p>
      )}
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Row of stats separated by hairlines. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Stat cell for use inside StatRow — carries its own surface fill. */
export function StatCell(props: Parameters<typeof Stat>[0]) {
  return (
    <div className="bg-surface px-5 py-4">
      <Stat {...props} />
    </div>
  );
}
