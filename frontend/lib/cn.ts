/** Join conditional class names. Keeps JSX readable without pulling in clsx. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
