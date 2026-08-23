'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-sheen text-accent-ink font-semibold hover:brightness-110 active:brightness-95 shadow-[0_4px_16px_-6px_rgb(var(--c-accent)/0.55)]',
  secondary:
    'bg-elevated text-ink border border-edge hover:bg-elevated/70 hover:border-faint/50',
  outline:
    'border border-accent/45 text-accent hover:bg-accent/10 hover:border-accent/70',
  ghost:
    'text-muted hover:text-ink hover:bg-elevated',
  danger:
    'border border-negative/35 bg-negative/10 text-negative hover:bg-negative/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8  px-3   text-xs  gap-1.5 rounded-lg',
  md: 'h-10 px-4   text-sm  gap-2   rounded-xl',
  lg: 'h-12 px-6   text-sm  gap-2   rounded-xl',
};

const BASE =
  'inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 ' +
  'disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:brightness-100';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
    >
      {loading && <Spinner size={size === 'sm' ? 'xs' : 'sm'} />}
      {children}
    </button>
  );
}

/** Same visual language, but renders an anchor for navigation. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  external = false,
}: CommonProps & { href: string; external?: boolean }) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
