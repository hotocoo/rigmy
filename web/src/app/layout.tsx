import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { LOCALE } from "@/lib/format";
import { fontStylesheet, themeColor } from "@/lib/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "RigMY — PC part picker",
  description: "Build a PC, check compatibility and compare Malaysian retailer prices in ringgit.",
};

/** Pages render inside AppShell once the client has loaded catalogue data, so there is no server-rendered segment
 *  for instant-navigation validation to inspect. */
export const instant = false;

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={LOCALE}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={fontStylesheet} rel="stylesheet" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
