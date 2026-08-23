import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Horizontally scrollable shell — tables must never widen the page. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('-mx-px overflow-x-auto', className)}>{children}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn('w-full min-w-[36rem] text-sm', className)}>{children}</table>;
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-hairline bg-elevated/50 px-5 py-3',
        'text-[11px] font-semibold uppercase tracking-wider text-faint',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'px-5 py-4 text-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn('border-b border-hairline/70 transition-colors last:border-0 hover:bg-elevated/40', className)}>
      {children}
    </tr>
  );
}
