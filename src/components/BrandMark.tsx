/* eslint-disable @next/next/no-img-element */
export default function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return <img src="/logo.png" alt="ClientReady" width={512} height={512} decoding="async" className={`shrink-0 select-none rounded-[22%] shadow-sm ${className}`} />;
}
