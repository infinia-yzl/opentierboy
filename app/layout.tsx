import type {Metadata} from "next";
import {Geologica, Nunito_Sans, Urbanist} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils"
import Link from "next/link";

import {ThemeProvider} from "next-themes"
import {Toaster} from "@/components/ui/sonner";
import {ZenToggle} from "@/components/ZenToggle";
import {AppearanceMenu} from "@/components/AppearanceMenu";
import {APPEARANCE_SCRIPT, THEME_CLASSES, THEME_NAMES} from "@/lib/appearance";
import {GitHubLogoIcon} from "@radix-ui/react-icons";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import {FaDiscord, FaXTwitter} from "react-icons/fa6";
import otbLogo from "@/public/brand/otb-logo-wide.webp";
import {Separator} from "@/components/ui/separator";
import StructuredMetadata from "@/components/StructuredMetadata";

// Modern (the default): Geologica, with its Sharpness axis for titles and tier letters.
// Classic: the look before the revamp, Nunito Sans with Urbanist headings. app/globals.css picks
// one by the font-classic class on <html> (lib/appearance.ts).
const fontGeologica = Geologica({
  subsets: ["latin"],
  axes: ["SHRP"],
  variable: "--font-geologica",
  display: "swap",
});

const fontNunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const fontUrbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
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
    <html lang="en" suppressHydrationWarning
          className={cn(fontGeologica.variable, fontNunito.variable, fontUrbanist.variable)}>
    <head>
      {/* The font and game colours choices, before the page paints (lib/appearance.ts). */}
      <script dangerouslySetInnerHTML={{__html: APPEARANCE_SCRIPT}}/>
    </head>
    <StructuredMetadata data={STRUCTURED_METADATA}/>
    <body className="bg-background font-sans antialiased min-h-screen flex flex-col justify-between">
    {/* Ocean and Forest retired (owner decision, 2026-10-28): a stored Ocean or Forest theme
        keeps its light or dark mode through THEME_CLASSES. */}
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      themes={[...THEME_NAMES]}
      value={THEME_CLASSES}
      enableSystem
      disableTransitionOnChange
    >
      <header className="w-full border-b" data-html2canvas-ignore>
        <div className="max-w-(--breakpoint-lg) zen-mode:max-w-(--breakpoint-2xl) mx-auto px-4 transition-all duration-75 ease-in-out">
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
            {/* gap-1, not space-x-1: in Tailwind 4, space-x-1 would leave a margin after the Zen
                button when zen mode hides the theme button. */}
            <div className="flex justify-center gap-1">
              <ZenToggle/>
              <span className="hide-in-zen">
          <AppearanceMenu/>
        </span>
            </div>
          </div>
        </div>
      </header>

      <main className="grow my-2 md:my-4">
        <div className="max-w-(--breakpoint-lg) zen-mode:max-w-(--breakpoint-2xl) mx-auto px-4 transition-all duration-75 ease-in-out">
          {children}
        </div>
      </main>

      <footer className="w-full mt-8 py-8 border-t hide-in-zen" data-html2canvas-ignore>
        <div className="max-w-(--breakpoint-lg) zen-mode:hide-in-zen mx-auto px-4">
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
                © 2026 OpenTierBoy. All rights reserved.
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
