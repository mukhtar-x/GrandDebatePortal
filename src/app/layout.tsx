import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Montserrat } from "next/font/google";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={cinzel.variable + " " + montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
