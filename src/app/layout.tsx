import { NATIVE_CLASS_SCRIPT } from "@/lib/native";
import { SITE_URL } from "@/lib/site";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";
import NativeBridge from "@/components/NativeBridge";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ClientReady",
  description:
    "Create professional proposals, invoices, client emails, and reports in minutes.",
  applicationName: "ClientReady",
  appleWebApp: { capable: true, title: "ClientReady", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#061418" },
    { media: "(prefers-color-scheme: light)", color: "#f4fbfb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: NATIVE_CLASS_SCRIPT + `try{var t;if(/^\\/(approve|portal|receipt|collect)(\\/|$)/.test(location.pathname)){var p=localStorage.getItem('clientready-portal-theme');t=(p==='light'||p==='dark')?p:(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}else{t=localStorage.getItem('clientready-theme')||'dark';}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.classList.toggle('light',t==='light');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)] antialiased">
        {children}
        <ServiceWorker />
        <NativeBridge />
      </body>
    </html>
  );
}