import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClientReady",
    short_name: "ClientReady",
    description: "Proposals, invoices, crew and job costs in one place.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#061418",
    theme_color: "#061418",
    icons: [
      { src: "/icons/cr-2026-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/cr-2026-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/cr-2026-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
