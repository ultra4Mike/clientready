import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Universal Links: the apple-app-site-association file (added once the Apple Team ID exists) has no
  // extension, so serve it as JSON. assetlinks.json is JSON by extension. Both are plain static files,
  // so they serve on clientreadyapp.com, www and the vercel.app host alike.
  async headers() {
    return [{ source: "/.well-known/apple-app-site-association", headers: [{ key: "Content-Type", value: "application/json" }] }];
  },
};

export default nextConfig;
