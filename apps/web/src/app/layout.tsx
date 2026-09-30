import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/nav";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Encore", template: "%s · Encore" },
  description: "Rank the movies and series you watch, and keep a record of every live show you've been to.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Encore", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pb-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
