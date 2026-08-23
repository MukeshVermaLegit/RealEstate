import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'accent' | 'positive' | 'info' | 'warn' | 'negative';

const TONES: Record<Tone, string> = {
  neutral:  'border-edge          bg-elevated       text-muted',
  accent:   'border-accent/30     bg-accent/12      text-accent',
  positive: 'border-positive/30   bg-positive/12    text-positive',
  info:     'border-info/30       bg-info/12        text-info',
  warn:     'border-warn/30       bg-warn/12        text-warn',
  negative: 'border-negative/30   bg-negative/12    text-negative',
};

const DOTS: Record<Tone, string> = {
  neutral:  'bg-faint',
  accent:   'bg-accent',
  positive: 'bg-positive',
  info:     'bg-info',
  warn:     'bg-warn',
  negative: 'bg-negative',
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  pulse = false,
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-[11px] font-medium leading-5 tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-70', DOTS[tone])}
            />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOTS[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}
