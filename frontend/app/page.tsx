import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-65px)] px-6 text-center bg-gradient-to-b from-white to-indigo-50">
      <h1 className="text-5xl font-extrabold text-gray-900 leading-tight max-w-2xl">
        Fractional Real Estate{' '}
        <span className="text-indigo-600">on Chain</span>
      </h1>
      <p className="mt-6 text-lg text-gray-500 max-w-xl">
        Buy, sell, and earn rent from tokenised real-world property assets — fully
        compliant, on-chain, and permissionless.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/properties"
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 transition-colors"
        >
          Browse Properties
        </Link>
        <Link
          href="/marketplace"
          className="rounded-lg border border-indigo-600 px-6 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          Secondary Market
        </Link>
      </div>
    </div>
  );
}
