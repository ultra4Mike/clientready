import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
            __html: `try{var t=localStorage.getItem('clientready-theme')||'dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.classList.toggle('light',t==='light');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)] antialiased">
        {children}
      </body>
    </html>
  );
}