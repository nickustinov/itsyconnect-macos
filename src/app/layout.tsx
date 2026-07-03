import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { LOCALE_BOOTSTRAP_SCRIPT } from "@/lib/i18n/locale-cookies";
import { resolveServerLocale } from "@/lib/i18n/resolve-server-locale";
import { Toaster } from "@/components/ui/sonner";
import { ElectronNavigationListener } from "@/components/electron-navigation-listener";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Itsyconnect",
  description: "Self-hosted App Store Connect dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = await resolveServerLocale();

  return (
    <html
      lang={initialLocale === "zh-CN" ? "zh-CN" : "en"}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.target.closest('[role="dialog"]'))e.preventDefault()})`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider initialLocale={initialLocale}>
            <ElectronNavigationListener />
            {children}
            <Toaster />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
