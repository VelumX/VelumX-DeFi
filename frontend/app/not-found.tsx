import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="max-w-md w-full backdrop-blur-xl rounded-2xl p-8 text-center"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }}
        >
          <span
            className="text-2xl font-bold"
            style={{ color: 'rgb(139, 92, 246)' }}
          >
            404
          </span>
        </div>

        <h1
          className="text-2xl font-bold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Page Not Found
        </h1>

        <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
          The page you&apos;re looking for doesn&apos;t exist.
        </p>

        <Link
          href="/swap"
          className="inline-block w-full px-6 py-3 rounded-xl font-medium transition-colors"
          style={{
            backgroundColor: 'rgb(124, 58, 237)',
            color: '#ffffff',
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
              'rgb(109, 40, 217)';
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
              'rgb(124, 58, 237)';
          }}
        >
          Return to Swap
        </Link>
      </div>
    </div>
  );
}
