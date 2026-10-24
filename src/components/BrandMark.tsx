export default function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false" className={`shrink-0 drop-shadow-sm ${className}`}>
      <defs>
        <linearGradient id="cr-brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#cr-brand-g)" />
      <path d="M270 182a104 104 0 1 0 0 148" fill="none" stroke="#fff" strokeWidth="54" strokeLinecap="round" />
      <path d="M336 352V176h46a50 50 0 0 1 0 100h-46M380 278l52 74" fill="none" stroke="#2dd4bf" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
