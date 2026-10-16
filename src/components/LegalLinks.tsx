import Link from "next/link";

/** Small Privacy · Terms links. Presentational only; inherits the surrounding text color. */
export default function LegalLinks({ prefix, className = "" }: { prefix?: string; className?: string }) {
  const link = "underline-offset-2 hover:text-teal-600 hover:underline";
  return (
    <p data-testid="legal-links" className={`text-xs text-[var(--cr-muted,#64748b)] ${className}`}>
      {prefix ? `${prefix} ` : ""}
      <Link href="/terms" className={link}>Terms</Link>
      {prefix ? " and " : " · "}
      <Link href="/privacy" className={link}>Privacy</Link>
      {prefix ? "." : ""}
    </p>
  );
}
