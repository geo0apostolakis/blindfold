import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RevealObserver } from "@/components/site/reveal";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blindfold | Private AI chat, paid for without a name",
  description:
    "Pay for AI credits with a stablecoin and get blind-signed tickets back. The chat spends tickets and never learns which wallet paid.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <RevealObserver />
      </body>
    </html>
  );
}
