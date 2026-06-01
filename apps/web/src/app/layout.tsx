import type { Metadata } from "next";
import { DesktopCommandRouter } from "@/components/desktop-command-router";
import { ThemeController } from "@/components/theme-controller";
import { UpdateBanner } from "@/components/update-banner";
import "./globals.css";

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
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeController />
        <DesktopCommandRouter />
        <UpdateBanner />
        {children}
      </body>
    </html>
  );
}
