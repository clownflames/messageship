import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "MessageShip", template: "%s | MessageShip" },
  description: "A secure multi-tenant WhatsApp Cloud API management platform.",
};

export const viewport: Viewport = { colorScheme: "light dark", themeColor: "#0f172a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning className={cn("h-full antialiased", geist.variable, geistMono.variable, dmSans.variable, outfit.variable)}><body className="min-h-full font-sans">{children}</body></html>;
}
