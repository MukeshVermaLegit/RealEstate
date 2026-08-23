import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from './Badge';

const TONES: Record<Tone, string> = {
  neutral:  'border-edge        bg-elevated      text-muted',
  accent:   'border-accent/25   bg-accent/8      text-accent',
  positive: 'border-positive/25 bg-positive/8    text-positive',
  info:     'border-info/25     bg-info/8        text-info',
  warn:     'border-warn/25     bg-warn/8        text-warn',
  negative: 'border-negative/25 bg-negative/8    text-negative',
};

export function Alert({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-xl border px-4 py-3 text-xs leading-relaxed', TONES[tone], className)}
      role={tone === 'negative' ? 'alert' : undefined}
    >
      {title && <p className="mb-0.5 text-sm font-semibold">{title}</p>}
      {children && <div className="break-words">{children}</div>}
    </div>
  );
}
