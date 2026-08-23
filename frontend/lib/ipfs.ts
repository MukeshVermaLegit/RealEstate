/**
 * IPFS URI helpers.
 *
 * An `ipfs://` URI is not a web address — it is a *content identifier* (CID).
 * The CID is derived from a hash of the bytes themselves, so it names *what*
 * the content is rather than *where* it is hosted. Browsers cannot follow
 * `ipfs://` natively, so every link in the UI is rewritten to an HTTP gateway:
 *
 *     ipfs://<CID>/<path>   →   https://<gateway>/ipfs/<CID>/<path>
 */

export type Gateway = {
  /** Short label shown in the UI. */
  name: string;
  /** Origin, no trailing slash. `/ipfs/<cid>` is appended. */
  base: string;
  /** One-line note on why a reader might pick this one. */
  note: string;
};

/**
 * Pinata first — it is where this app pins, so it is warm for our own CIDs.
 * The rest are public fallbacks for when a gateway rate-limits or is down;
 * every one of them returns the same bytes for the same CID.
 */
export const GATEWAYS: readonly Gateway[] = [
  { name: 'Pinata',     base: 'https://gateway.pinata.cloud', note: 'Where this app pins — fastest for our CIDs' },
  { name: 'ipfs.io',    base: 'https://ipfs.io',              note: 'Run by Protocol Labs' },
  { name: 'dweb.link',  base: 'https://dweb.link',            note: 'Subdomain-isolated origin' },
  { name: 'Cloudflare', base: 'https://cloudflare-ipfs.com',  note: 'Global edge cache' },
] as const;

export const DEFAULT_GATEWAY = GATEWAYS[0];

export type ParsedIpfsUri = {
  /** The bare content identifier, no scheme and no path. */
  cid: string;
  /** Path inside the addressed directory, without a leading slash. */
  path: string;
};

/** Cheap shape checks — enough to tell a CID from a typo without pulling in a multiformats dep. */
const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1 = /^b[a-z2-7]{20,}$/;

export function isCid(value: string): boolean {
  return CID_V0.test(value) || CID_V1.test(value.toLowerCase());
}

export function isIpfsUri(uri: string): boolean {
  return parseIpfsUri(uri) !== null;
}

/**
 * Accepts `ipfs://<cid>[/path]`, a bare CID, or an existing gateway URL, and
 * returns the CID/path pair. Returns `null` for anything that is not IPFS
 * (a plain https:// document link, an empty string, a data URI).
 */
export function parseIpfsUri(uri: string): ParsedIpfsUri | null {
  const trimmed = (uri ?? '').trim();
  if (!trimmed) return null;

  let rest: string;
  if (trimmed.startsWith('ipfs://')) {
    // Some pinning services emit `ipfs://ipfs/<cid>`.
    rest = trimmed.slice(7).replace(/^ipfs\//, '');
  } else if (trimmed.includes('/ipfs/')) {
    rest = trimmed.slice(trimmed.indexOf('/ipfs/') + 6);
  } else {
    rest = trimmed;
  }

  const [cid, ...segments] = rest.split('/');
  if (!cid || !isCid(cid)) return null;

  return { cid, path: segments.join('/').split(/[?#]/)[0] };
}

/** Build the HTTP URL a browser can actually open. */
export function gatewayUrl(cid: string, path = '', gateway: Gateway = DEFAULT_GATEWAY): string {
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';
  return `${gateway.base}/ipfs/${cid}${suffix}`;
}

/**
 * Rewrite any URI for `fetch`/`<img>`. Non-IPFS input is returned untouched so
 * callers can pass whatever a metadata document happens to contain.
 */
export function ipfsToHttp(uri: string, gateway: Gateway = DEFAULT_GATEWAY): string {
  const parsed = parseIpfsUri(uri);
  return parsed ? gatewayUrl(parsed.cid, parsed.path, gateway) : uri;
}

/** "bafkreib2mo…ese2dm" — CIDs are too long for a table cell. */
export function shortCid(cid: string, chars = 6): string {
  if (cid.length <= chars * 2 + 3) return cid;
  return `${cid.slice(0, chars)}…${cid.slice(-chars)}`;
}

// ─── CID decoding ────────────────────────────────────────────────────────────

export type CidInfo = {
  version: 0 | 1;
  /** Multicodec name of the wrapped content, e.g. "raw" or "dag-pb". */
  codec: string;
  /** Plain-English gloss of the codec, for the explainer panel. */
  codecNote: string;
  /** Multihash function name, e.g. "sha2-256". */
  hash: string;
  /** Digest length in bits, e.g. 256. */
  hashBits: number;
};

const CODECS: Record<number, { name: string; note: string }> = {
  0x55:  { name: 'raw',      note: 'a single raw block — one file stored whole, such as a JSON document or an image' },
  0x70:  { name: 'dag-pb',   note: 'a UnixFS file or directory — content split into linked blocks' },
  0x71:  { name: 'dag-cbor', note: 'a structured CBOR document with links to other CIDs' },
  0x0129:{ name: 'dag-json', note: 'a structured JSON document with links to other CIDs' },
  0x0200:{ name: 'json',     note: 'a plain JSON block' },
};

const HASHES: Record<number, { name: string; bits: number }> = {
  0x12:   { name: 'sha2-256',   bits: 256 },
  0x13:   { name: 'sha2-512',   bits: 512 },
  0x1e:   { name: 'blake3',     bits: 256 },
  0xb220: { name: 'blake2b-256', bits: 256 },
};

const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lowercase, unpadded — decodes only the first `limit` bytes. */
function base32Decode(input: string, limit: number): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of input.toLowerCase()) {
    const index = B32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
      if (out.length >= limit) break;
    }
  }

  return new Uint8Array(out);
}

/** LEB128 varint. Returns the value and the offset just past it. */
function readVarint(bytes: Uint8Array, offset: number): [value: number, next: number] | null {
  let value = 0;
  let shift = 0;
  let i = offset;

  while (i < bytes.length) {
    const byte = bytes[i++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value >>> 0, i];
    shift += 7;
    if (shift > 28) return null;
  }
  return null;
}

/**
 * Read the self-describing prefix of a CID: version, content codec and hash
 * function. Returns `null` when the CID uses a multibase we do not decode
 * (base16, base58 for v1, …) — the UI simply omits the detail line then.
 */
export function describeCid(cid: string): CidInfo | null {
  if (CID_V0.test(cid)) {
    // v0 is always dag-pb + sha2-256; the bytes carry no codec prefix.
    return {
      version: 0,
      codec: 'dag-pb',
      codecNote: CODECS[0x70].note,
      hash: 'sha2-256',
      hashBits: 256,
    };
  }

  const lower = cid.toLowerCase();
  if (!CID_V1.test(lower)) return null;

  // Strip the multibase prefix: 'b' = base32 lower. 8 bytes covers every
  // prefix we recognise (1B version + ≤3B codec + ≤3B hash code + 1B length).
  const bytes = base32Decode(lower.slice(1), 8);
  if (!bytes || bytes.length < 4) return null;

  const version = readVarint(bytes, 0);
  if (!version || version[0] !== 1) return null;

  const codec = readVarint(bytes, version[1]);
  if (!codec) return null;

  const hash = readVarint(bytes, codec[1]);
  if (!hash) return null;

  const length = readVarint(bytes, hash[1]);

  const codecEntry = CODECS[codec[0]];
  const hashEntry = HASHES[hash[0]];

  return {
    version: 1,
    codec: codecEntry?.name ?? `codec 0x${codec[0].toString(16)}`,
    codecNote: codecEntry?.note ?? 'content in a codec this app does not recognise',
    hash: hashEntry?.name ?? `hash 0x${hash[0].toString(16)}`,
    hashBits: hashEntry?.bits ?? (length ? length[0] * 8 : 0),
  };
}
