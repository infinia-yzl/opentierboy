import type {Metadata} from "next";
import {Nunito_Sans as FontSans, Urbanist as FontHeading} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils"
import Link from "next/link";

import {ThemeProvider} from "next-themes"
import {Toaster} from "@/components/ui/sonner";
import {ZenToggle} from "@/components/ZenToggle";
import {ThemeSelector} from "@/components/ThemeSelector";
import {GitHubLogoIcon} from "@radix-ui/react-icons";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import {FaDiscord, FaXTwitter} from "react-icons/fa6";
import otbLogo from "@/public/brand/otb-logo-wide.webp";
import {Separator} from "@/components/ui/separator";
import StructuredMetadata from "@/components/StructuredMetadata";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontHeading = FontHeading({
  subsets: ["latin"],
  variable: "--font-heading"
});

const getBaseUrl = () => {
  let baseUrl = 'https://opentierboy.com';
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    try {
      baseUrl = new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).toString().replace(/\/$/, '');
    } catch (error) {
      console.warn('Invalid VERCEL_PROJECT_PRODUCTION_URL in the root layout');
    }
  }
  return baseUrl;
};

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "OpenTierBoy - Craft, Rank, and Share Your Tier Lists",
  description: "OpenTierBoy: The free, open-source tier list creator that helps you craft, rank and share your passion! No ads, no logins, no sign-ups. Create and instantly share your tier lists simply by copying the URL to your tier list.",
  keywords: "tier list, maker, creator, generator, open-source, free, share, rank, community, tier maker, rank, rankings, game",
  openGraph: {
    title: "OpenTierBoy - Craft, Rank, and Share Your Tier Lists",
    description: "OpenTierBoy: The free, open-source tier list creator that helps you craft, rank and share your passion! No ads, no logins, no sign-ups. Create and instantly share your tier lists simply by copying the URL to your tier list.",
    url: baseUrl,
    siteName: "OpenTierBoy",
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "OpenTierBoy - Craft, Rank, and Share Your Tier Lists",
    description: "OpenTierBoy: The free, open-source tier list creator that helps you craft, rank and share your passion! No ads, no logins, no sign-ups. Create and instantly share your tier lists simply by copying the URL to your tier list.",
  },
  other: {
    'application-name': 'OpenTierBoy',
  },
  authors: [{name: 'OpenTierBoy Team'}],
  alternates: {
    canonical: baseUrl,
  }
};

const STRUCTURED_METADATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'OpenTierBoy',
  description: "OpenTierBoy: The free, open-source tier list creator that helps you craft, rank and share your passion! No ads, no logins, no sign-ups. Create and share your tier lists instantly simply by copying the URL to your tier list.",
  url: baseUrl,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  potentialAction: [
    {
      '@type': 'ViewAction',
      target: `${baseUrl}/rank`,
      name: 'Create New Blank Tier List',
      description: "Start crafting a new tier list from a blank slate"
    },
    {
      '@type': 'ViewAction',
      target: `${baseUrl}/rank/the-finals/all`,
      name: "Rank The Finals Equipment",
      description: "Rank equipments and specializations from The Finals in your own tier list and share it with the community"
    },
    {
      '@type': 'ViewAction',
      target: `${baseUrl}/rank/wuthering-waves/c-all`,
      name: "Rank Wuthering Waves Resonators",
      description: "Rank Wuthering Waves Resonators in your own tier list and share it with the community"
    },
    {
      '@type': 'ViewAction',
      target: `${baseUrl}/rank/overwatch/h-all`,
      name: "Rank Overwatch Heroes",
      description: "Rank Overwatch Heroes in your own tier list and share it with the community"
    },
    {
      '@type': 'ViewAction',
      target: `${baseUrl}/about`,
      name: "About",
      description: "Learn more about OpenTierBoy"
    },
    {
      '@type': 'ViewAction',
      target: `${baseUrl}/blog`,
      name: "Blog",
      description: "Read the latest blog posts from OpenTierBoy"
    },
  ],
  sameAs: [
    'https://github.com/infinia-yzl/opentierboy',
    'https://discord.gg/CEtDSHV38b'
  ],
  author: {
    '@type': 'Organization',
    name: 'OpenTierBoy Team',
    url: baseUrl
  },
  isAccessibleForFree: true,
  license: 'https://www.gnu.org/licenses/agpl-3.0.en.html'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
    <StructuredMetadata data={STRUCTURED_METADATA}/>
    <body className={cn(
      "bg-background font-sans antialiased min-h-screen flex flex-col justify-between",
      fontSans.variable,
      fontHeading.variable,
    )}>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      themes={[
        'ocean-light', 'ocean-dark',
        'forest-light', 'forest-dark',
        'dark', 'light',
        'system'
      ]}
      enableSystem
      disableTransitionOnChange
    >
      <header className="w-full border-b" data-html2canvas-ignore>
        <div className="max-w-screen-lg zen-mode:max-w-screen-2xl mx-auto px-4 transition-all duration-75 ease-in-out">
          <div className="flex flex-row py-4 justify-between items-center">
            <div className="flex flex-row items-center space-x-6">
              <Link href="/" className="flex items-center">
                <Image src={otbLogo} alt="OpenTierBoy" height={40} priority/>
              </Link>
              <nav className="flex space-x-2">
                <Button asChild variant="ghost" className="text-muted-foreground">
                  <Link href="/about">
                    About
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="text-muted-foreground">
                  <Link href="/blog">
                    Blog
                  </Link>
                </Button>
              </nav>
            </div>
            <div className="flex justify-center space-x-1">
              <ZenToggle/>
              <span className="hide-in-zen">
          <ThemeSelector/>
        </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow my-2 md:my-4">
        <div className="max-w-screen-lg zen-mode:max-w-screen-2xl mx-auto px-4 transition-all duration-75 ease-in-out">
          {children}
        </div>
      </main>

      <footer className="w-full mt-8 py-8 border-t hide-in-zen" data-html2canvas-ignore>
        <div className="max-w-screen-lg zen-mode:hide-in-zen mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 text-center sm:text-start gap-8 items-start">
            <div className="flex flex-col space-y-2">
              <p className="text-sm text-muted-foreground">OpenTierBoy is an open-source project.</p>
              <p className="text-sm text-muted-foreground">No ads, no logins, no sign-ups.</p>
              <div className="flex flex-row space-x-4 h-5 justify-center sm:justify-start">
                <Link href="/about" className="text-sm hover:underline">About</Link>
                <Separator orientation="vertical"/>
                <Link href="/blog" className="text-sm hover:underline">Blog</Link>
                <Separator orientation="vertical"/>
                <a href="mailto:opentierboy@infinia.space" className="text-sm hover:underline">Email</a>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center space-y-4 p-4">
              <div className="flex space-x-2">
                <Button variant="ghost" asChild size="icon">
                  <a href="https://github.com/infinia-yzl/opentierboy" className="text-foreground hover:text-primary"
                     aria-label="GitHub">
                    <GitHubLogoIcon className="h-5 w-5"/>
                  </a>
                </Button>
                <Button variant="ghost" asChild size="icon">
                  <a href="https://discord.gg/CEtDSHV38b" className="text-foreground hover:text-primary"
                     aria-label="Discord">
                    <FaDiscord className="h-5 w-5"/>
                  </a>
                </Button>
                <Button variant="ghost" asChild size="icon">
                  <a href="https://x.com/OpenTierBoy" className="text-foreground hover:text-primary" aria-label="X.com">
                    <FaXTwitter className="h-5 w-5"/>
                  </a>
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground py-1">
                © 2024 OpenTierBoy. All rights reserved.
              </p>
            </div>
            <div className="flex flex-col space-y-2 lg:pl-48">
              <h3 className="text-sm font-semibold text-muted-foreground">Legal</h3>
              <Link href="/terms" className="text-sm hover:underline">Terms of Service</Link>
              <Link href="/privacy" className="text-sm hover:underline">Privacy Policy</Link>
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
