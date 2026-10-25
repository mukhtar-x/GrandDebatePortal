import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Montserrat } from "next/font/google";
import { SiteIntroProvider } from "@/components/shared/site-intro";
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
  title: "The Grand Debate '26 | TLC FAST-NUCES Karachi",
  description:
    "Register for The Grand Debate '26 and track your delegate application.",
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
