import type {Metadata} from "next";
import {Inter as FontSans} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils"

import {ThemeProvider} from "next-themes"
import {Toaster} from "@/components/ui/sonner";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Tier Author",
  description: "Create amazing tier lists with Tier Author.",
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
        {children}
      </div>
      <Toaster/>
    </ThemeProvider>
    </body>
    </html>
  );
}
