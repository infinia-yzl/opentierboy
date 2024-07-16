import type {Metadata} from "next";
import {Inter as FontSans} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils"

import {ThemeProvider} from "next-themes"
import {Toaster} from "@/components/ui/sonner";
import {ZenToggle} from "@/components/ZenToggle";
import {ThemeSelector} from "@/components/ThemeSelector";
import {Separator} from "@/components/ui/separator";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "OpenTierBoy - Craft, Rank, Share Your Tiers",
  description: "OpenTierBoy: The open-source tier list creator that helps you craft, rank, and share your passion! No logins, no sign-ups.",
  keywords: "tier list, maker, creator, generator, open-source, free, share, rank, community, tier maker, rank, rankings, game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
    <body className={cn(
      "bg-background font-sans antialiased min-h-screen flex justify-center",
      fontSans.variable
    )}>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="max-w-screen-lg w-full">
        <div className="flex flex-row p-4 w-full justify-between items-center align-middle" data-html2canvas-ignore>
          <a href="/" className="text-xl">OpenTierBoy</a>
          <div className="space-x-1">
            <ZenToggle/>
            <span className="hide-in-zen">
            <ThemeSelector/>
          </span>
          </div>
        </div>
        <Separator className="mb-8" data-html2canvas-ignore/>
        {children}
      </div>
      <Toaster/>
    </ThemeProvider>
    </body>
    </html>
  );
}
