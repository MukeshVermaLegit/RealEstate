import { useQueries, useQuery } from '@tanstack/react-query';
import type { IPFSMetadata } from '../types';
import { ipfsToHttp } from '../ipfs';

// Re-exported so existing callers can keep importing it from the hook module;
// the gateway rewriting itself lives in `lib/ipfs.ts` alongside CID parsing.
export { ipfsToHttp };

async function fetchMetadata(uri: string): Promise<IPFSMetadata> {
  const url = ipfsToHttp(uri);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();

  // Support both top-level `location` and an NFT attribute trait
  const location: string =
    json.location ??
    (Array.isArray(json.attributes)
      ? json.attributes.find((a: { trait_type: string }) => a.trait_type === 'location')?.value
      : undefined) ??
    '';

  const rawImage = String(json.image ?? json.imageUrl ?? '');

  // `images` is the gallery; documents pinned before galleries existed only have
  // the singular `image`, so fall back to it and treat that as a one-photo set.
  const rawImages: string[] = Array.isArray(json.images)
    ? json.images.map(String).filter(Boolean)
    : rawImage
      ? [rawImage]
      : [];

  return {
    name: String(json.name ?? ''),
    description: String(json.description ?? ''),
    location,
    // `image` is the NFT-metadata standard key; `imageUrl` is accepted for
    // documents pinned by earlier builds of the registration form.
    imageUrl: rawImage ? ipfsToHttp(rawImage) : rawImages[0] ? ipfsToHttp(rawImages[0]) : '',
    imageUri: rawImage || rawImages[0] || '',
    imageUrls: rawImages.map((uri) => ipfsToHttp(uri)),
    imageUris: rawImages,
    documents: Array.isArray(json.documents) ? json.documents : [],
  };
}

/**
 * Shared query definition so the single and batch hooks hit the same cache entry —
 * a list that pre-fetches metadata for search does not make its cards refetch.
 */
function metadataQuery(uri: string) {
  return {
    queryKey: ['ipfs-metadata', uri] as const,
    queryFn: () => fetchMetadata(uri),
    enabled: !!uri,
    staleTime: 5 * 60 * 1000, // IPFS content is immutable
  };
}

export function useIPFSMetadata(uri: string) {
  return useQuery<IPFSMetadata>(metadataQuery(uri));
}

/**
 * Batch variant for list pages that need to filter/sort on metadata (name, location)
 * before rendering. Returns a URI-keyed lookup plus an aggregate loading flag.
 */
export function useIPFSMetadataMany(uris: string[]) {
  const results = useQueries({
    queries: uris.map((uri) => metadataQuery(uri)),
    combine: (queries) => ({
      byUri: Object.fromEntries(
        queries.map((q, i) => [uris[i], q.data as IPFSMetadata | undefined]),
      ) as Record<string, IPFSMetadata | undefined>,
      isLoading: queries.some((q) => q.isLoading),
    }),
  });

  return results;
}
