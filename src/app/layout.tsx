import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Montserrat } from "next/font/google";
import { SiteIntroProvider } from "@/components/shared/site-intro";
import { getPublicSiteUrl } from "@/lib/site-url";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: getPublicSiteUrl(),
  title: {
    default: "The Grand Debate ’26 - TLC",
    template: "%s - TGD'26",
  },
  description:
    "Join The Grand Debate '26, a three-day Model United Nations conference at FAST-NUCES Karachi. Explore committees, register as a delegate and access conference resources.",
  applicationName: "The Grand Debate '26",
  category: "education",
  keywords: [
    "The Grand Debate '26", "Model United Nations Karachi", "MUN Pakistan",
    "FAST-NUCES Karachi", "TLC FAST Karachi", "debate conference",
  ],
  creator: "The Literary Club, FAST-NUCES Karachi",
  publisher: "The Literary Club, FAST-NUCES Karachi",
  openGraph: {
    type: "website",
    locale: "en_PK",
    siteName: "The Grand Debate '26",
    title: "The Grand Debate '26 | TLC FAST-NUCES Karachi",
    description: "Three days of debate, diplomacy and dialogue at FAST-NUCES Karachi, 18–20 November 2026.",
    images: [{ url: "/assets/07_Posters_and_Headers/tgd_google_forms_header_1600x400.png", width: 1600, height: 400, alt: "The Grand Debate '26 at FAST-NUCES Karachi" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Grand Debate '26 | TLC FAST-NUCES Karachi",
    description: "Three days of debate, diplomacy and dialogue at FAST-NUCES Karachi, 18–20 November 2026.",
    images: ["/assets/07_Posters_and_Headers/tgd_google_forms_header_1600x400.png"],
  },
  icons: {
    icon: [
      {
        url: "/assets/01_Logo/favicon/favicon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/assets/01_Logo/favicon/favicon.ico",
        type: "image/x-icon",
      },
      {
        url: "/assets/01_Logo/favicon/favicon_32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/assets/01_Logo/favicon/favicon_16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={cinzel.variable + " " + montserrat.variable}>
      <body>
        <SiteIntroProvider>{children}</SiteIntroProvider>
      </body>
    </html>
  );
}
