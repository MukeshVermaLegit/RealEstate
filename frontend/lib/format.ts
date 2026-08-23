/**
 * Display formatters shared across the app.
 *
 * Unit conventions in this codebase (do not "normalise" these — they mirror the
 * contracts):
 *   • `pricePerToken` — 18-decimal USD
 *   • `totalSupply`   — whole-token count (PropertyRegistry), NOT 18-decimal
 *   • ERC20 balances  — 18-decimal token
 *   • rent amounts    — payment-token decimals (USDC = 6)
 */

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/** Convert an 18-decimal bigint to a JS number without the Number(wei)/1e18 precision cliff. */
function fromWei(wei: bigint, decimals = 18): number {
  if (decimals <= 4) return Number(wei) / 10 ** decimals;
  const scale = 10n ** BigInt(decimals - 4);
  return Number(wei / scale) / 1e4;
}

/** "$1,250.00" */
export function formatUsd(wei: bigint, decimals = 18): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromWei(wei, decimals));
}

/** "$4.2M" — for stat tiles where width is tight. */
export function formatUsdCompact(wei: bigint, decimals = 18): string {
  const n = fromWei(wei, decimals);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: n < 100 ? 2 : 1,
  }).format(n);
}

/** Plain grouped number: "12,400" */
export function formatNumber(n: number | bigint): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** "12.4K" */
export function formatNumberCompact(n: number | bigint): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

/** 18-decimal token amount with trailing zeros trimmed: "1,250.5" */
export function formatTokens(raw: bigint, decimals = 18): string {
  const whole = raw / 10n ** BigInt(decimals);
  const frac = raw % 10n ** BigInt(decimals);
  if (frac === 0n) return formatNumber(whole);
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  return fracStr ? `${formatNumber(whole)}.${fracStr}` : formatNumber(whole);
}

/** "0x1234…abcd" */
export function shortAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < chars * 2 + 4) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/** Longer truncation for hashes shown on the detail page. */
export function truncateHex(hex: string, chars = 8): string {
  if (!hex || hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

export function isZeroAddress(addr?: string): boolean {
  return !addr || addr.toLowerCase() === ZERO_ADDRESS;
}

/** "12 Mar 2026" — em dash for unset (0) timestamps. */
export function formatDate(unixSec: bigint | number): string {
  const s = Number(unixSec);
  if (!s) return '—';
  return new Date(s * 1000).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Percentage of a total, clamped, as a number 0–100. */
export function pctOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Math.min(100, Number((part * 10000n) / total) / 100);
}

/** Human countdown for listing/lockup expiry. `null` when there is no expiry. */
export function expiryLabel(expiresAt: bigint): { text: string; expired: boolean } | null {
  if (expiresAt === 0n) return null;
  const diff = Number(expiresAt) - Math.floor(Date.now() / 1000);
  if (diff <= 0) return { text: 'Expired', expired: true };
  const days = Math.ceil(diff / 86_400);
  if (days > 1) return { text: `${days} days left`, expired: false };
  const hours = Math.ceil(diff / 3_600);
  return { text: hours > 1 ? `${hours} hours left` : 'Under 1 hour', expired: false };
}

/** Trim a wallet/RPC error down to something a card can hold. */
export function cleanTxError(e: unknown, max = 140): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'Transaction failed');
  const firstLine = raw.split('\n')[0].trim();
  if (/user rejected|denied transaction/i.test(raw)) return 'Transaction rejected in wallet.';
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

/**
 * Parse a user-typed USD amount into an 18-decimal bigint.
 * Returns null for blank/invalid input so callers can skip the filter entirely.
 */
export function parseUsdTo18(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  // Go via micro-dollars to keep 6 decimal places without float drift in the bigint.
  return BigInt(Math.round(n * 1e6)) * 10n ** 12n;
}
