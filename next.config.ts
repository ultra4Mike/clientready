import type { NextConfig } from "next";
import { OLD_ROUTE_REDIRECTS } from "./src/lib/view-routes";

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
