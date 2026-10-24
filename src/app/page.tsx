import type { Metadata } from "next";
import { HomeClient } from "./HomeClient";

const title = "ClientReady: proposals, invoices and job scheduling for small crews";
const description = "Write proposals, send invoices, schedule crews and get paid, with reports and tax prep built in. Made for small service businesses.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "ClientReady", url: "/", title, description, images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ClientReady" }] },
  twitter: { card: "summary", title, description, images: ["/icons/icon-512.png"] },
};

export default function HomePage() {
  return <HomeClient />;
}
