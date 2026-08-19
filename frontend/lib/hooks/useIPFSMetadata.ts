import { useQuery } from '@tanstack/react-query';
import type { IPFSMetadata } from '../types';

export function ipfsToHttp(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice(7);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

export function useIPFSMetadata(uri: string) {
  return useQuery<IPFSMetadata>({
    queryKey: ['ipfs-metadata', uri],
    queryFn: async () => {
      const url = ipfsToHttp(uri);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await res.json();

      // Support both top-level `location` and an NFT attribute trait
      const location: string =
        json.location ??
        (Array.isArray(json.attributes)
          ? json.attributes.find(
              (a: { trait_type: string }) => a.trait_type === 'location',
            )?.value
          : undefined) ??
        '';

      return {
        name:        String(json.name ?? ''),
        description: String(json.description ?? ''),
        location,
        imageUrl:    json.image ? ipfsToHttp(String(json.image)) : '',
        documents:   Array.isArray(json.documents) ? json.documents : [],
      };
    },
    enabled: !!uri,
    staleTime: 5 * 60 * 1000, // 5 min — IPFS content is immutable
  });
}
