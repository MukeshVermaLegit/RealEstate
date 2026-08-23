import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Page-width container. One place to change the app's max width. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8', className)}>{children}</div>;
}

/** Small uppercase kicker above a section heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent',
        className,
      )}
    >
      <span className="h-px w-6 bg-accent/50" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
  align = 'left',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="mt-3 font-display text-2xl font-semibold text-ink sm:text-3xl">{title}</h2>
        {description && (
          <p className="text-pretty mt-2.5 text-sm leading-relaxed text-muted sm:text-[15px]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Vertical rhythm wrapper for landing-page sections. */
export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('py-16 sm:py-20 lg:py-24', className)}>
      {children}
    </section>
  );
}

/** Page header used on the inner app pages. */
export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="border-b border-hairline bg-surface/40">
      <Container className="py-8 sm:py-10">
        {breadcrumb && <div className="mb-4">{breadcrumb}</div>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{title}</h1>
            {description && (
              <p className="text-pretty mt-2 text-sm leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </Container>
    </div>
  );
}
