/**
 * Most hosted RPCs cap the block range of a single eth_getLogs call — Infura
 * rejects anything over 10,000 blocks outright. A scan that starts at a
 * contract's deploy block is routinely hundreds of thousands of blocks wide, so
 * every log query has to be split.
 *
 * The caller supplies the fetch, rather than this module wrapping getLogs, so
 * viem's inference of the decoded `args` on each log survives.
 *
 * Chunks run a few at a time: sequentially a 650k-block scan is ~65 round trips
 * one after another, which is slow enough to look broken.
 */

/** Blocks per request. Keep below the provider's cap (Infura: 10,000). */
const DEFAULT_CHUNK = 9_500n;
/**
 * Deliberately low. A wide scan is dozens of requests, and hosted providers
 * answer a burst of those with HTTP 429 rather than queueing them.
 */
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRIES = 4;

export type ChunkedOptions = {
  chunkSize?: bigint;
  concurrency?: number;
  /** Attempts per chunk before giving up. Backoff is exponential from 250ms. */
  retries?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rate limits are the expected failure here, not the exceptional one — a scan
 * that gives up on the first 429 loses the whole result set.
 */
async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

export function blockRanges(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint = DEFAULT_CHUNK,
): { from: bigint; to: bigint }[] {
  if (toBlock < fromBlock) return [];
  const ranges: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n;
    ranges.push({ from: start, to: end > toBlock ? toBlock : end });
  }
  return ranges;
}

/**
 * Run `fetchRange` over [fromBlock, toBlock] in provider-sized chunks and
 * concatenate the results in chain order.
 */
export async function collectLogs<T>(
  fromBlock: bigint,
  toBlock: bigint,
  fetchRange: (from: bigint, to: bigint) => Promise<readonly T[]>,
  options: ChunkedOptions = {},
): Promise<T[]> {
  const ranges = blockRanges(fromBlock, toBlock, options.chunkSize ?? DEFAULT_CHUNK);
  if (ranges.length === 0) return [];

  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const retries = options.retries ?? DEFAULT_RETRIES;
  const results: T[][] = new Array(ranges.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= ranges.length) return;
      const { from, to } = ranges[index];
      results[index] = [...(await withRetry(() => fetchRange(from, to), retries))];
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ranges.length) }, () => worker()),
  );

  // Indexed by range, not completion order, so chain order is preserved.
  return results.flat();
}
