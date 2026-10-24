import type { NextConfig } from "next";
import { OLD_ROUTE_REDIRECTS } from "./src/lib/view-routes";

// Security batch: Content-Security-Policy. Inline scripts/styles stay allowed ('unsafe-inline') because the
// theme bootstrap in layout.tsx and Next's own hydration scripts are inline and there is no nonce middleware.
// CSP_REPORT_ONLY=1 sends it as Content-Security-Policy-Report-Only instead (quick rollback without a code change).
const supabaseSrc = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    return [u.origin, `${u.protocol === "http:" ? "ws:" : "wss:"}//${u.host}`];
  } catch { return ["https://*.supabase.co", "wss://*.supabase.co"]; }
})();
const dev = process.env.NODE_ENV !== "production";
export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  `connect-src 'self' ${supabaseSrc.join(" ")} https://api.stripe.com https://maps.googleapis.com https://vitals.vercel-insights.com https://va.vercel-scripts.com${dev ? " ws: http://localhost:*" : ""}`,
  "frame-src 'self' https://www.google.com https://maps.google.com https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'self'",
].join("; ");
const cspHeader = process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
// Vercel adds access-control-allow-origin: * to responses by default. Nothing cross-origin calls this app
// (the API is same-origin, the Capacitor shell loads the live site), so pin it to the site itself.
const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.clientreadyapp.com").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Redesign 3: old menu routes open the matching Calendar / Documents view (query strings are kept).
  async redirects() {
    return OLD_ROUTE_REDIRECTS.map((r) => ({ ...r, permanent: false }));
  },
  // Universal Links: the apple-app-site-association file (added once the Apple Team ID exists) has no
  // extension, so serve it as JSON. assetlinks.json is JSON by extension. Both are plain static files,
  // so they serve on clientreadyapp.com, www and the vercel.app host alike.
  async headers() {
    // Baseline security headers on every page. Referrer-Policy keeps approval / portal tokens in the URL
    // from leaking to other sites; SAMEORIGIN stops other sites framing the approve/sign page.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
      { key: cspHeader, value: CSP },
      { key: "Access-Control-Allow-Origin", value: siteOrigin },
      { key: "Vary", value: "Origin" },
    ];
    // Customer token links and signed-in app screens must never show up in search results.
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    const privatePaths = ["approve", "portal", "invoice-view", "receipt", "collect", "proposal", "crew", "dashboard", "documents", "clients", "backup", "calendar", "drafts", "employees", "history", "inventory", "invoice", "job", "mileage", "profile", "report", "reports", "schedule", "today", "upcoming", "year", "reset-password", "api"];
    return [
      { source: "/:path*", headers: security },
      ...privatePaths.map((p) => ({ source: `/${p}/:path*`, headers: noindex })),
      ...privatePaths.map((p) => ({ source: `/${p}`, headers: noindex })),
      { source: "/.well-known/apple-app-site-association", headers: [{ key: "Content-Type", value: "application/json" }] },
    ];
  },
};

export default nextConfig;
