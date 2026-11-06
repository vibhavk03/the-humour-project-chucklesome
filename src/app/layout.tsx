import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
import { ThemeProvider } from "@/components/button/ThemeProvider";
import { TimeZoneProvider } from "@/components/TimeZoneContext";

const siteTitle = process.env.NEXT_PUBLIC_SITE_TITLE?.trim() || "Crack'd | Admin";
const appEnv =
  process.env.NEXT_PUBLIC_ENVIRONMENT ||
  process.env.NEXT_PUBLIC_APP_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.NODE_ENV ||
  "development";
const isProduction = appEnv.toLowerCase() === "production";
const colorEnv = isProduction ? "production" : "non-production";

export const metadata: Metadata = {
  title: siteTitle,
  description: "A hub for managing the funny business.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-env={colorEnv} suppressHydrationWarning>
      <head>
        <title>{siteTitle}</title>
      </head>
      <body
        className="min-h-screen"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TimeZoneProvider>
            {children}
            <Toaster/>
          </TimeZoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
