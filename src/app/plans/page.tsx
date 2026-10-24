import type { Metadata } from "next";
import { PlansClient } from "./PlansClient";

const title = "Plans and pricing | ClientReady";
const description = "Compare ClientReady plans: what each includes for invoices, scheduling, crew timesheets and payments, and what it costs.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/plans" },
  openGraph: { type: "website", siteName: "ClientReady", url: "/plans", title, description, images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ClientReady" }] },
  twitter: { card: "summary", title, description, images: ["/icons/icon-512.png"] },
};

export default function PlansPage() {
  return <PlansClient />;
}
