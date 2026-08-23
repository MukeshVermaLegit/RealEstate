'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * Hero image with thumbnail strip. Sits inside the detail page's existing
 * aspect-ratio frame, so it fills its parent absolutely rather than sizing
 * itself — the gradient overlay and title are layered on top by the page.
 *
 * `unoptimized` because sources are arbitrary IPFS gateway URLs, which Next's
 * optimiser cannot be configured for ahead of time.
 */
export function PropertyGallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const current = urls[Math.min(active, urls.length - 1)];

  return (
    <>
      <Image
        key={current}
        src={current}
        alt={urls.length > 1 ? `${alt} — photo ${active + 1} of ${urls.length}` : alt}
        fill
        sizes="(max-width: 1024px) 100vw, 66vw"
        className="object-cover"
        unoptimized
      />

      {urls.length > 1 && (
        <>
          {/* Thumbnails sit above the page's gradient overlay, hence z-20. */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex gap-2 overflow-x-auto p-3">
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === active}
                className={cn(
                  'relative h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                  i === active
                    ? 'border-accent'
                    : 'border-white/25 hover:border-white/60',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          <span className="absolute right-3 top-3 z-20 rounded-full bg-base/70 px-2 py-0.5 text-[11px] font-semibold text-ink">
            {active + 1} / {urls.length}
          </span>
        </>
      )}
    </>
  );
}
