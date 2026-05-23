import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeController } from "@/components/theme-controller";
import { UpdateBanner } from "@/components/update-banner";
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
  title: "Mila",
  description: "Multilingual AI meeting notes assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeController />
        <UpdateBanner />
        {children}
      </body>
    </html>
  );
}
