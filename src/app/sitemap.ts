import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Public pages only (the app itself is behind sign-in). */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/plans", "/help", "/signup", "/login", "/privacy", "/terms", "/account/delete"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
