import type { Metadata } from "next";
import { SignupClient } from "./SignupClient";

const title = "Create your account | ClientReady";
const description = "Sign up for ClientReady and send your first proposal or invoice in minutes.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/signup" },
  openGraph: { type: "website", siteName: "ClientReady", url: "/signup", title, description, images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ClientReady" }] },
  twitter: { card: "summary", title, description, images: ["/icons/icon-512.png"] },
};

export default function SignupPage() {
  return <SignupClient />;
}
