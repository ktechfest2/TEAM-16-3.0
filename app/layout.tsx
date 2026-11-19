import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileNav, SiteFooter, SiteHeader } from "@/components/signa/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Signa — Election incident reporting and coordination",
    template: "%s · Signa",
  },
  description:
    "Nonpartisan election incident reporting built around Alert, Verify, Respond. Independent monitoring prototype.",
  icons: { icon: "/brand/signa-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#14212B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-midnight focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="pb-24 md:pb-0">
          {children}
        </main>
        <SiteFooter />
        <MobileNav />
      </body>
    </html>
  );
}
