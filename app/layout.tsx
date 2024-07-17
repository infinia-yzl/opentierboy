import type {Metadata} from "next";
import {Nunito_Sans as FontSans, Urbanist as FontHeading} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils"

import {ThemeProvider} from "next-themes"
import {Toaster} from "@/components/ui/sonner";
import {ZenToggle} from "@/components/ZenToggle";
import {ThemeSelector} from "@/components/ThemeSelector";
import {DiscordLogoIcon, EnvelopeClosedIcon, GitHubLogoIcon} from "@radix-ui/react-icons";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontHeading = FontHeading({
  subsets: ["latin"],
  variable: "--font-heading"
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
      "bg-background font-sans antialiased min-h-screen flex flex-col justify-between",
      fontSans.variable,
      fontHeading.variable,
    )}>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <header className="w-full border-b" data-html2canvas-ignore>
        <div className="max-w-screen-lg mx-auto px-4">
          <div className="flex flex-row py-4 justify-between items-center">
            <a href="/" className="text-xl"><h1>OpenTierBoy</h1></a>
            <div className="space-x-1">
              <ZenToggle/>
              <span className="hide-in-zen">
                    <ThemeSelector/>
                  </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow md:my-8">
        <div className="max-w-screen-lg mx-auto px-4">
          {children}
        </div>
      </main>

      <footer className="w-full mt-8 py-8 border-t" data-html2canvas-ignore>
        <div className="max-w-screen-lg mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 text-center sm:text-start gap-8 items-start">
            <div className="flex flex-col space-y-2">
              <p className="text-sm text-muted-foreground">OpenTierBoy is an open-source project.</p>
              <p className="text-sm text-muted-foreground">No logins, no sign-ups.</p>
              <a href="/about" className="text-sm hover:underline">About</a>
            </div>
            <div className="flex flex-col items-center justify-center space-y-4 p-4">
              <div className="flex space-x-4">
                <a href="https://github.com/infinia-yzl/opentierboy" className="text-foreground hover:text-primary"
                   aria-label="GitHub">
                  <GitHubLogoIcon className="h-5 w-5"/>
                </a>
                <a href="https://discord.gg/CEtDSHV38b" className="text-foreground hover:text-primary"
                   aria-label="Discord">
                  <DiscordLogoIcon className="h-5 w-5"/>
                </a>
                <a href="mailto:dev@infinia.space" className="text-foreground hover:text-primary"
                   aria-label="Contact">
                  <EnvelopeClosedIcon className="h-5 w-5"/>
                </a>
              </div>
              <p className="text-center text-sm text-muted-foreground py-1">
                © 2024 OpenTierBoy. All rights reserved.
              </p>
            </div>
            <div className="flex flex-col space-y-2 lg:px-20">
              <h3 className="text-sm font-semibold text-muted-foreground">Legal</h3>
              <a href="/terms" className="text-sm hover:underline">Terms of Service</a>
              <a href="/privacy" className="text-sm hover:underline">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>
      <Toaster/>
    </ThemeProvider>
    </body>
    </html>
  );
}
