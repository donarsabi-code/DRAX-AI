import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBaseUrl =
  process.env.APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  applicationName: "DRAX IA",
  title: "DRAX IA — Votre intelligence artificielle de nouvelle génération",
  description:
    "DRAX IA est un assistant conversationnel indépendant : conversations persistantes, réponses en direct, recherche web, génération d'images et rendu Markdown soigné.",
  keywords: ["DRAX IA", "DRAX IA", "assistant IA", "chat", "conversationnel", "intelligence artificielle"],
  authors: [{ name: "DRAX IA" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "DRAX IA — Votre intelligence artificielle de nouvelle génération",
    description: "Conversations persistantes, réponses en direct, recherche web et génération d'images.",
    siteName: "DRAX IA",
    type: "website",
    locale: "fr_FR",
    images: [{ url: "/og-drax.png", width: 1200, height: 630, alt: "DRAX IA" }],
  },
  appleWebApp: {
    capable: true,
    title: "DRAX IA",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
