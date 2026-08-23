import { cn } from '@/lib/cn';

export function Progress({
  value,
  className,
  tone = 'accent',
}: {
  /** 0–100 */
  value: number;
  className?: string;
  tone?: 'accent' | 'positive';
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-elevated', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'accent' ? 'bg-accent-sheen' : 'bg-positive',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
